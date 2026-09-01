import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import floorSchema from "../schemas/floor.schema.json" with { type: "json" };
import { readGlbBytes } from "./glb/io.js";
import { generateInterior, makeFixture } from "./index.js";

const fix = makeFixture({ seed: 44, floors: 7, basements: 1 });

describe("generateInterior", () => {
  it("produces a GLB plus schema-valid floor JSONs, byte-identical across runs", async () => {
    const keys = { textures: { mode: "keys" as const } };
    const a = await generateInterior(fix.request, { shellDoc: fix.shellDoc, ...keys });
    const again = makeFixture({ seed: 44, floors: 7, basements: 1 });
    const b = await generateInterior(again.request, { shellDoc: again.shellDoc, ...keys });
    expect(Buffer.from(a.glb).equals(Buffer.from(b.glb))).toBe(true);
    expect(JSON.stringify(a.floors)).toBe(JSON.stringify(b.floors));
    expect(JSON.stringify(a.npc)).toBe(JSON.stringify(b.npc));

    const ajv = new Ajv2020({ allErrors: false, strict: false });
    const check = ajv.compile(floorSchema);
    for (const floor of a.floors) {
      const asJson = JSON.parse(JSON.stringify(floor));
      expect(check(asJson), `floor ${floor.floor}: ${JSON.stringify(check.errors)}`).toBe(true);
    }
    expect(a.floors.filter((f) => f.floor >= 0).every((f) => f.core.elevators.length > 0)).toBe(true);
  });

  it("floorGlbs splits the interior by floor band, one GLB per blueprint floor", async () => {
    const own = makeFixture({ seed: 44, floors: 7, basements: 1 });
    const result = await generateInterior(own.request, { shellDoc: own.shellDoc, textures: { mode: "keys" }, floorGlbs: true });
    const floors = own.request.blueprint.floors;
    expect([...result.floorGlbs!.keys()].sort((a, b) => a - b)).toEqual(floors.map((f) => f.index).sort((a, b) => a - b));
    const building = await readGlbBytes(result.glb);
    const buildingMaterials = new Set(building.getRoot().listMaterials().map((m) => m.getName()));
    let vertices = 0;
    for (const floor of floors) {
      const doc = await readGlbBytes(result.floorGlbs!.get(floor.index)!);
      // a floor band reaches the slab above it; a double-height space reaches the one above that
      const upper = result.floors.find((f) => f.floor === floor.index + 1 && f.rooms.length === 0);
      const top = floor.elevation + floor.height + (upper?.height ?? 0);
      let low = Infinity;
      let high = -Infinity;
      for (const node of doc.getRoot().listNodes()) {
        expect(node.getName()).toMatch(/^interior:/);
        expect(buildingMaterials.has(node.getMesh()!.listPrimitives()[0]!.getMaterial()!.getName())).toBe(true);
        for (const prim of node.getMesh()!.listPrimitives()) {
          const pos = prim.getAttribute("POSITION")!.getArray()!;
          vertices += pos.length / 3;
          for (let i = 1; i < pos.length; i += 3) {
            low = Math.min(low, pos[i]!);
            high = Math.max(high, pos[i]!);
          }
        }
      }
      expect(low, `floor ${floor.index} bottom`).toBeGreaterThanOrEqual(floor.elevation - 1.5);
      expect(high, `floor ${floor.index} top`).toBeLessThanOrEqual(top + 1e-4);
    }
    let interiorVertices = 0;
    for (const node of building.getRoot().listNodes()) {
      if (!node.getName().startsWith("interior:")) continue;
      for (const prim of node.getMesh()!.listPrimitives()) interiorVertices += prim.getAttribute("POSITION")!.getCount();
    }
    expect(vertices).toBe(interiorVertices);
  });

  it("rejects a malformed request with E_BLUEPRINT_INVALID", async () => {
    await expect(generateInterior({ nonsense: true })).rejects.toMatchObject({ code: "E_BLUEPRINT_INVALID" });
  });

  it("rejects a shell that does not match the blueprint with E_SHELL_MISMATCH", async () => {
    const tiny = makeFixture({ seed: 44, floors: 7, width: 9, depth: 9 });
    await expect(
      generateInterior(fix.request, { shellDoc: tiny.shellDoc }),
    ).rejects.toMatchObject({ code: "E_SHELL_MISMATCH" });
  });
});
