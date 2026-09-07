import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getBounds, NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld } from "@gltf-transform/functions";
import { SOURCE_PLAN, type SourcePlan } from "../import-plan.js";
import type { AssetCatalog, AssetEntry } from "../types.js";

const BOX_DIR = fileURLToPath(new URL("../", import.meta.url));
const INTERIOR_DIR = path.resolve(BOX_DIR, "..", "..");
const SOURCES_DIR = path.join(INTERIOR_DIR, "assets-sources");
const MODELS_DIR = path.join(BOX_DIR, "models");
const VERIFIED_AT = "2026-09-06";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

await fs.mkdir(MODELS_DIR, { recursive: true });
const assets: AssetEntry[] = [];
for (const plan of SOURCE_PLAN) assets.push(await importSource(plan));
const catalog: AssetCatalog = { version: 1, verifiedAt: VERIFIED_AT, assets };
await fs.writeFile(path.join(BOX_DIR, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);

async function importSource(plan: SourcePlan): Promise<AssetEntry> {
  const sourcePath = path.join(SOURCES_DIR, plan.sourceFile);
  const sourceBytes = await sourceByteLength(sourcePath);
  const doc = await io.read(sourcePath);
  const sourceBounds = boundsOf(doc);
  const dimensions = dimensionsOf(sourceBounds);
  const metrics = metricsOf(doc);
  const base = plan.provider === "Sketchfab"
    ? await sketchfabMetadata(plan, sourcePath)
    : await polyHavenMetadata(plan);

  if (plan.targetHeight === undefined && plan.provider === "Sketchfab") {
    return {
      ...base,
      id: plan.id,
      family: plan.family,
      styles: plan.styles,
      sourceDimensions: { size: dimensions, unit: "source-unit" },
      availability: "source-only",
      metrics: { sourceBytes, ...metrics },
    };
  }

  const scale = plan.targetHeight === undefined ? 1 : plan.targetHeight / dimensions[2];
  normalize(doc, plan.id, sourceBounds, scale);
  await doc.transform(dedup(), weld(), prune());
  const modelName = `${plan.id}.glb`;
  const output = path.join(MODELS_DIR, modelName);
  await io.write(output, doc);
  const modelStat = await fs.stat(output);
  const normalizedDimensions = dimensions.map((value) => round(value * scale)) as [number, number, number];
  return {
    ...base,
    id: plan.id,
    family: plan.family,
    styles: plan.styles,
    sourceDimensions: { size: dimensions, unit: plan.provider === "Poly Haven" ? "meter" : "source-unit" },
    dimensionsMeters: normalizedDimensions,
    modelUri: `models/${modelName}`,
    availability: plan.provider === "Poly Haven" ? "redistributable" : "local-only",
    metrics: { sourceBytes, modelBytes: modelStat.size, ...metricsOf(doc) },
  };
}

function normalize(doc: Document, id: string, bounds: Bounds, scale: number): void {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) throw new Error(`Asset ${id} has no scene`);
  const children = scene.listChildren();
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const root = doc.createNode(`asset:${id}`)
    .setScale([scale, scale, scale])
    .setTranslation([-centerX * scale, -bounds.min[1] * scale, -centerZ * scale]);
  for (const child of children) root.addChild(child);
  scene.addChild(root);
}

async function sketchfabMetadata(plan: SourcePlan, sourcePath: string): Promise<Pick<AssetEntry, "title" | "source" | "license">> {
  const json = await glbJson(sourcePath);
  const extras = json.asset?.extras ?? {};
  const sourceUri = required(extras.source, `${plan.id} source URI`);
  const uid = sourceUri.match(/-([0-9a-f]{32})$/)?.[1];
  if (!uid) throw new Error(`Asset ${plan.id} has no Sketchfab UID`);
  const response = await fetch(`https://api.sketchfab.com/v3/models/${uid}`);
  if (!response.ok) throw new Error(`Sketchfab metadata ${uid}: HTTP ${response.status}`);
  const metadata = await response.json() as SketchfabModel;
  const parsedAuthor = parseLinkedName(required(extras.author, `${plan.id} author`));
  return {
    title: metadata.name ?? required(extras.title, `${plan.id} title`),
    source: { provider: "Sketchfab", uid, uri: sourceUri, author: parsedAuthor },
    license: {
      slug: metadata.license.slug,
      name: metadata.license.fullName,
      uri: metadata.license.url,
      verifiedAt: VERIFIED_AT,
      redistributable: false,
    },
  };
}

async function polyHavenMetadata(plan: SourcePlan): Promise<Pick<AssetEntry, "title" | "source" | "license">> {
  const requestedId = plan.sourceFile.split("/")[1]!;
  const response = await fetch(`https://api.polyhaven.com/info/${requestedId}`);
  if (!response.ok) throw new Error(`Poly Haven metadata ${requestedId}: HTTP ${response.status}`);
  const metadata = await response.json() as { name: string; authors: Record<string, string> };
  return {
    title: metadata.name,
    source: {
      provider: "Poly Haven",
      uid: requestedId,
      uri: `https://polyhaven.com/a/${requestedId}`,
      author: { name: Object.keys(metadata.authors).join(", ") || "Poly Haven", uri: "https://polyhaven.com" },
    },
    license: {
      slug: "cc0-1.0",
      name: "CC0 1.0 Universal",
      uri: "https://creativecommons.org/publicdomain/zero/1.0/",
      verifiedAt: VERIFIED_AT,
      redistributable: true,
    },
  };
}

interface Bounds { min: [number, number, number]; max: [number, number, number] }

function boundsOf(doc: Document): Bounds {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) throw new Error("Model has no scene");
  const bounds = getBounds(scene);
  return { min: [...bounds.min] as Bounds["min"], max: [...bounds.max] as Bounds["max"] };
}

function dimensionsOf(bounds: Bounds): [number, number, number] {
  return [
    round(bounds.max[0] - bounds.min[0]),
    round(bounds.max[2] - bounds.min[2]),
    round(bounds.max[1] - bounds.min[1]),
  ];
}

function metricsOf(doc: Document): Pick<AssetEntry["metrics"], "triangles" | "vertices" | "materials" | "textures"> {
  let triangles = 0;
  let vertices = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const positionCount = primitive.getAttribute("POSITION")?.getCount() ?? 0;
    vertices += positionCount;
    triangles += Math.floor((primitive.getIndices()?.getCount() ?? positionCount) / 3);
  }
  return {
    triangles,
    vertices,
    materials: doc.getRoot().listMaterials().length,
    textures: doc.getRoot().listTextures().length,
  };
}

async function glbJson(sourcePath: string): Promise<{ asset?: { extras?: Record<string, unknown> } }> {
  const bytes = await fs.readFile(sourcePath);
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString("utf8").trim());
}

function required(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing ${label}`);
  return value;
}

function parseLinkedName(value: string): { name: string; uri?: string } {
  const match = value.match(/^(.*) \((https:\/\/[^)]+)\)$/);
  return match ? { name: match[1]!, uri: match[2]! } : { name: value };
}

function round(value: number): number { return Math.round(value * 10_000) / 10_000; }

async function sourceByteLength(sourcePath: string): Promise<number> {
  if (path.extname(sourcePath) !== ".gltf") return (await fs.stat(sourcePath)).size;
  const entries = await fs.readdir(path.dirname(sourcePath), { recursive: true, withFileTypes: true });
  let bytes = 0;
  for (const entry of entries) {
    if (entry.isFile()) bytes += (await fs.stat(path.join(entry.parentPath, entry.name))).size;
  }
  return bytes;
}

interface SketchfabModel {
  name?: string;
  license: { slug: string; fullName: string; url: string };
}
