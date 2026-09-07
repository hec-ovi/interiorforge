import fs from "node:fs";
import { Document, getBounds } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { AssetInstancer, fitAssetBounds, findAssetCandidates, findFurnitureAssets, loadAssetCatalog } from "./index.js";
import { readAssetModel } from "./io.js";

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
  });
});
