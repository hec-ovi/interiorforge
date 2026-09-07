import fs from "node:fs";
import { createRequire } from "node:module";
import { Document, getBounds, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it } from "vitest";
import { AssetInstancer, fitAssetBounds, findAssetCandidates, findFurnitureAssets, loadAssetCatalog } from "./index.js";
import { readAssetModel } from "./io.js";
import { prepareFurnitureAssets } from "./pipeline.js";
import type { FloorInterior, Furniture } from "../core/types.js";

describe("asset catalog contract", () => {
  it("publishes unique licensed entries and keeps restricted binaries local", () => {
    const catalog = loadAssetCatalog();
    expect(catalog.assets).toHaveLength(43);
    expect(new Set(catalog.assets.map((asset) => asset.id)).size).toBe(catalog.assets.length);

    for (const asset of catalog.assets) {
      expect(asset.source.uri).toMatch(/^https:\/\//);
      expect(asset.license.uri).toMatch(/^https:\/\//);
      if (asset.license.slug === "free-st") {
        expect(asset.license.redistributable).toBe(false);
        expect(asset.availability).not.toBe("redistributable");
      }
      if (asset.availability === "redistributable") {
        expect(asset.license.slug).toBe("cc0-1.0");
        expect(fs.existsSync(new URL(asset.modelUri!, import.meta.url))).toBe(true);
      }
    }
  });

  it("selects available families and rejects extreme shrink fits", () => {
    const chairs = findAssetCandidates({ family: "chair", styles: ["mid"], maxBounds: [0.7, 0.75, 1.1] });
    expect(chairs.map((asset) => asset.id)).toContain("polyhaven-school-chair-01");
    const chair = chairs.find((asset) => asset.id === "polyhaven-school-chair-01")!;
    expect(fitAssetBounds(chair, [0.7, 0.75, 1.1], 6)).not.toBeNull();
    expect(fitAssetBounds(chair, [0.2, 0.2, 0.3], 0)).toBeNull();
    expect(findFurnitureAssets({
      id: "chair-1", kind: "office_chair", room: "office", position: [0, 0], rotationDeg: 0,
      size: [0.7, 0.75, 1.1],
    }, { styles: ["mid"], variationDeg: 6 }).map((asset) => asset.id)).toContain("polyhaven-school-chair-01");

    const clutter = findFurnitureAssets({
      id: "trash-1", kind: "floor_clutter", room: "living", position: [0, 0], rotationDeg: 0,
      size: [0.8, 0.8, 0.8],
    }, { styles: ["damaged"], variationDeg: 2 });
    expect(clutter.map((asset) => asset.id)).toEqual([
      "sketchfab-animal-crossing-new-horizons-trash-bags",
    ]);
    expect(clutter[0]?.dimensionsMeters).toEqual([0.7571, 0.7248, 0.55]);
  });

  it("reads and instances a model with source materials inside the promised bounds", async () => {
    const asset = loadAssetCatalog().assets.find((entry) => entry.id === "polyhaven-sofa-01")!;
    const model = await readAssetModel(asset);
    expect(model.getRoot().listMaterials().length).toBeGreaterThan(0);

    const target = new Document();
    target.createBuffer("buffer");
    target.createScene("scene");
    let reads = 0;
    const instancer = new AssetInstancer(target, async (entry) => {
      reads++;
      return readAssetModel(entry);
    });
    const result = await instancer.instantiate(asset, {
      position: [3, 2, 4],
      rotationYDeg: 35,
      variationDeg: 6,
      maxBounds: [2, 0.9, 0.9],
    });
    const meshCount = target.getRoot().listMeshes().length;
    await instancer.instantiate(asset, { position: [6, 2, 4], maxBounds: [2, 0.9, 0.9] });
    expect(reads).toBe(1);
    expect(target.getRoot().listMeshes()).toHaveLength(meshCount);
    expect(result.scale).toBeGreaterThanOrEqual(0.7);
    result.dimensions.forEach((value, index) => expect(value).toBeLessThanOrEqual([2, 0.9, 0.9][index]! + 1e-8));
    expect(target.getRoot().listMaterials().length).toBe(model.getRoot().listMaterials().length);
    const bounds = getBounds(result.node);
    expect(bounds.min[1]).toBeCloseTo(2, 4);
    const registered = new Set(target.getRoot().listNodes());
    for (const node of registered) {
      for (const child of node.listChildren()) expect(registered.has(child)).toBe(true);
    }
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const roundtrip = await io.readBinary(await io.writeBinary(target));
    expect(roundtrip.getRoot().listNodes().length).toBe(registered.size);
  });

  it("prefers one seeded local model per family and falls back to public CC0", async () => {
    const chair = (id: string): Furniture => ({
      id, kind: "office_chair", room: "office", position: [0, 0], rotationDeg: 0,
      size: [0.65, 0.65, 1.15],
    });
    const floors = [{ floor: 0, furniture: [chair("a"), chair("b")] }] as FloorInterior[];
    const localReads: string[] = [];
    const local = await prepareFurnitureAssets(floors, { seed: "catalog-choice" }, ["capsule", "mid"], async (asset) => {
      localReads.push(asset.id);
      return new Document();
    });
    expect(local.byFloor.get(0)?.map((item) => item.asset.id)).toEqual([
      "sketchfab-office-chair", "sketchfab-office-chair",
    ]);
    expect(localReads).toEqual(["sketchfab-office-chair"]);

    const fallback = await prepareFurnitureAssets(floors, { seed: "catalog-choice" }, ["mid"], async (asset) => {
      if (asset.availability === "local-only") throw new Error("local preview file absent");
      return new Document();
    });
    expect(fallback.byFloor.get(0)?.map((item) => item.asset.id)).toEqual([
      "polyhaven-school-chair-01", "polyhaven-school-chair-01",
    ]);
  });

  it("activates only trash props for poor floor clutter", async () => {
    const item: Furniture = {
      id: "trash", kind: "floor_clutter", room: "living", position: [2, 3], rotationDeg: 0,
      size: [0.8, 0.8, 0.8],
    };
    const floors = [{ floor: 0, furniture: [item] }] as FloorInterior[];
    const poor = await prepareFurnitureAssets(floors, { seed: 4 }, ["damaged", "poor"], async () => new Document());
    expect(poor.byFloor.get(0)?.[0]?.asset.id).toBe("sketchfab-animal-crossing-new-horizons-trash-bags");
    expect(poor.skipIdsByFloor.get(0)?.has("trash")).toBe(true);

    const mid = await prepareFurnitureAssets(floors, { seed: 4 }, ["capsule", "mid"], async () => new Document());
    expect(mid.byFloor.size).toBe(0);
    expect(mid.skipIdsByFloor.size).toBe(0);
  });

  it("imports a model document created by another module realm without orphan nodes", async () => {
    const asset = loadAssetCatalog().assets.find((entry) => entry.id === "polyhaven-school-chair-01")!;
    const cjs = createRequire(import.meta.url)("@gltf-transform/core") as typeof import("@gltf-transform/core");
    const foreignIO = new cjs.NodeIO().registerExtensions(ALL_EXTENSIONS);
    const foreign = await foreignIO.readBinary(fs.readFileSync(new URL(asset.modelUri!, import.meta.url)));
    const target = new Document();
    target.createBuffer("buffer");
    target.createScene("scene");
    await new AssetInstancer(target, async () => foreign as unknown as Document).instantiate(asset, {
      position: [0, 0, 0], maxBounds: [0.7, 0.8, 1.2],
    });

    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const roundtrip = await io.readBinary(await io.writeBinary(target));
    expect(roundtrip.getRoot().listNodes().some((node) => node.getName().startsWith(`asset:${asset.id}`))).toBe(true);
  });
});
