import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import floorSchema from "../schemas/floor.schema.json" with { type: "json" };
import { readGlbBytes } from "./glb/io.js";
import { findPath, generateInterior, makeFixture } from "./index.js";

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

    const document = await readGlbBytes(a.glb);
    const fabric = document.getRoot().listMaterials()
      .filter((material) => material.getName() === "cyberpunk/fabric/mid");
    expect(fabric.length).toBeGreaterThan(0);
    expect(fabric.every((material) => material.getExtras().materialVariant === "flat")).toBe(true);

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

  it("builds a producer-shaped open shop front as a clear, reachable portal without leaves", async () => {
    // The open edge is 11 degrees off the layout frame. Its center is 1.22 m from the
    // hall's rectangular working edge, while the clipped hall still owns the threshold.
    const outline: [number, number][] = [
      [120.086, 172.54], [95.279, 185.344], [83.844, 150.793], [101.852, 140.533],
    ];
    const base = makeFixture({ seed: "open-front", floors: 2, type: "commerce", outline });
    const blueprint = structuredClone(base.request.blueprint);
    const ground = blueprint.floors.find((floor) => floor.index === 0)!;
    ground.kind = "commerce";
    const opening = {
      id: "open-front:main", kind: "openFront" as const, edge: 1, offset: 1, width: 12,
      height: 3.4, sill: 0,
      portal: {
        frameWidth: 0.15, frameDepth: 0.18, recessDepth: 0.35,
        clearWidth: 11.68, clearHeight: 3.25, clearDepth: 0.35,
      },
      accessRole: "main" as const,
      material: "cyberpunk/window-frame/mid",
    };
    ground.openings = [opening, ...ground.openings.filter((item) => item.edge !== opening.edge && item.kind !== "door")];
    const fix = makeFixture({ seed: "open-front", blueprint, type: "commerce" });

    const result = await generateInterior(fix.request, {
      shellDoc: fix.shellDoc, textures: { mode: "keys" },
    });
    const floor = result.floors.find((item) => item.floor === 0)!;
    expect(floor.kind).toBe("retail");
    const room = floor.rooms.find((item) => item.doors.some((door) => door.kind === "openFront"))!;
    expect(room.kind).toBe("sales_floor");
    const portal = room.doors.find((door) => door.kind === "openFront")!;
    expect(portal).toMatchObject({
      kind: "openFront", to: "outside", width: opening.portal.clearWidth,
      clearHeight: opening.portal.clearHeight, clearDepth: opening.portal.clearDepth,
    });
    expect(portal).not.toHaveProperty("leaves");
    const edgeA = ground.outline[opening.edge]!;
    const edgeB = ground.outline[(opening.edge + 1) % ground.outline.length]!;
    const edgeLength = Math.hypot(edgeB[0] - edgeA[0], edgeB[1] - edgeA[1]);
    const centerT = (opening.offset + opening.width / 2) / edgeLength;
    expect(portal.position[0]).toBeCloseTo(edgeA[0] + (edgeB[0] - edgeA[0]) * centerT, 2);
    expect(portal.position[1]).toBeCloseTo(edgeA[1] + (edgeB[1] - edgeA[1]) * centerT, 2);
    const edgeAngle = ((Math.atan2(edgeB[1] - edgeA[1], edgeB[0] - edgeA[0]) * 180) / Math.PI + 360) % 360;
    expect(portal.angleDeg).toBeCloseTo(edgeAngle, 2);

    const entrance = result.npc.anchors.find((anchor) => anchor.floor === 0 && anchor.kind === "entrance")!;
    expect(entrance).toBeTruthy();
    for (const anchor of result.npc.anchors) {
      expect(findPath(
        result.npc,
        { floor: entrance.floor, position: entrance.position },
        { floor: anchor.floor, position: anchor.position },
      ), `no route from open front to ${anchor.id}`).not.toBeNull();
    }

    const ajv = new Ajv2020({ allErrors: false, strict: false });
    const check = ajv.compile(floorSchema);
    expect(check(JSON.parse(JSON.stringify(floor))), JSON.stringify(check.errors)).toBe(true);
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
