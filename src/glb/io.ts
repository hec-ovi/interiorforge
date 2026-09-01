import { Document, Format, NodeIO, getBounds, type Material } from "@gltf-transform/core";
import {
  KHRMaterialsEmissiveStrength, KHRMaterialsIOR, KHRMaterialsTransmission, KHRTextureTransform,
} from "@gltf-transform/extensions";
import type { MeshBuilder } from "./mesh-builder.js";
import type { Vec3 } from "./mesh-builder.js";

/** The extensions textured materials use: tiling transforms, glass, emissive strength.
 *  Unregistered extensions are silently dropped on write, so they live with the IO. */
const io = new NodeIO().registerExtensions([
  KHRTextureTransform, KHRMaterialsTransmission, KHRMaterialsIOR, KHRMaterialsEmissiveStrength,
]);

export function createDocument(builder: MeshBuilder): Document {
  const doc = new Document();
  doc.createBuffer("buffer");
  doc.createScene("scene");
  appendToDocument(doc, builder);
  return doc;
}

/** Adds the builder's meshes to the document's default scene, reusing materials by name. */
export function appendToDocument(doc: Document, builder: MeshBuilder): void {
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0] ?? doc.createBuffer("buffer");
  const scene = root.getDefaultScene() ?? root.listScenes()[0] ?? doc.createScene("scene");

  for (const key of builder.materials()) {
    const group = builder.getGroup(key)!;
    const material = root.listMaterials().find((m) => m.getName() === key) ?? makeMaterial(doc, key);

    const position = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array(group.positions))
      .setBuffer(buffer);
    const normal = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array(group.normals))
      .setBuffer(buffer);
    const uv = doc
      .createAccessor()
      .setType("VEC2")
      .setArray(new Float32Array(group.uvs))
      .setBuffer(buffer);
    const indices = doc
      .createAccessor()
      .setType("SCALAR")
      .setArray(new Uint32Array(group.indices))
      .setBuffer(buffer);

    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", position)
      .setAttribute("NORMAL", normal)
      .setAttribute("TEXCOORD_0", uv)
      .setIndices(indices)
      .setMaterial(material);
    const mesh = doc.createMesh(`interior:${key}`).addPrimitive(prim);
    const node = doc.createNode(`interior:${key}`).setMesh(mesh);
    scene.addChild(node);
  }
}

function makeMaterial(doc: Document, key: string): Material {
  return doc
    .createMaterial(key)
    .setBaseColorFactor(placeholderColor(key))
    .setMetallicFactor(0)
    .setRoughnessFactor(0.9)
    .setDoubleSided(false);
}

/** Deterministic placeholder tint per material key so the preview separates surfaces
 *  before the materials box resolves real textures. */
function placeholderColor(key: string): [number, number, number, number] {
  let h = 0x811c9dc5;
  for (const ch of key) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  const hue = (h >>> 0) % 360;
  const [r, g, b] = hslToRgb(hue, 0.35, 0.6);
  return [r, g, b, 1];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** GLB out. The library's binary writer drops image URIs, so the JSON chunk is assembled
 *  here: textures that carry a URI stay external, textures carrying bytes stay embedded. */
export async function writeGlb(doc: Document): Promise<Uint8Array> {
  const { json, resources } = await io.writeJSON(doc, { format: Format.GLB });
  const textures = doc.getRoot().listTextures();
  json.images?.forEach((image, i) => {
    const uri = textures[i]?.getURI();
    if (uri) image.uri = uri;
  });
  return packGlb(json, Object.values(resources)[0]);
}

const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;
const GLB_BIN = 0x004e4942;

/** glTF 2.0 container: 12-byte header, JSON chunk padded with spaces, BIN chunk padded with zeros. */
function packGlb(json: unknown, bin?: Uint8Array): Uint8Array {
  const jsonChunk = pad4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binChunk = bin && bin.byteLength > 0 ? pad4(bin, 0) : null;
  const total = 12 + 8 + jsonChunk.byteLength + (binChunk ? 8 + binChunk.byteLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonChunk.byteLength, true);
  view.setUint32(16, GLB_JSON, true);
  out.set(jsonChunk, 20);
  if (binChunk) {
    const at = 20 + jsonChunk.byteLength;
    view.setUint32(at, binChunk.byteLength, true);
    view.setUint32(at + 4, GLB_BIN, true);
    out.set(binChunk, at + 8);
  }
  return out;
}

function pad4(data: Uint8Array, fill: number): Uint8Array {
  const size = Math.ceil(data.byteLength / 4) * 4;
  if (size === data.byteLength) return data;
  const padded = new Uint8Array(size).fill(fill);
  padded.set(data);
  return padded;
}

/** The JSON chunk of a GLB, for inspecting output that references external images. */
export function glbJson(glb: Uint8Array): Record<string, unknown> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const length = view.getUint32(12, true);
  const text = new TextDecoder().decode(glb.subarray(20, 20 + length));
  return JSON.parse(text.replace(/\0+$/, "").trim()) as Record<string, unknown>;
}

export async function readGlbBytes(bytes: Uint8Array): Promise<Document> {
  return io.readBinary(bytes);
}

export async function readGlbFile(path: string): Promise<Document> {
  return io.read(path);
}

export function sceneBounds(doc: Document): { min: Vec3; max: Vec3 } {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]!;
  const { min, max } = getBounds(scene);
  return { min: min as Vec3, max: max as Vec3 };
}
