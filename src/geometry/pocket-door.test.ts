import { expect, it } from "vitest";
import type { Opening, PocketDoorMotion } from "../core/types.js";
import { generateFloorInteriors, makeFixture } from "../index.js";
import { facadeTriangles, triangleIntersectsBox } from "./facade-surface.test-helper.js";

it("joins pocket back skins with exact passages and keeps lateral leaf slots open", async () => {
  for (const leaves of [1, 2] as const) {
    const source = makeFixture({ seed: 6, floors: 2, width: 40, depth: 24,
      rotationDeg: leaves === 1 ? 37 : 0, type: "offices", wallDepth: 0.44 });
    const blueprint = structuredClone(source.request.blueprint);
    const opening: Opening = {
      id: "entrance", kind: "door", edge: 0, offset: 13, width: 3, height: 2.5, sill: 0, leaves,
      door: {
        set: "plain", frameWidth: 0.09, frameDepth: 0.05, recessDepth: 0.12, thresholdHeight: 0,
        clearance: { offset: 13, sill: 0, width: 3, height: 2.5, backDepth: 0.218 },
        cassette: { offset: leaves === 1 ? 12.91 : 11.387, sill: 0,
          width: leaves === 1 ? 6.203 : 6.226, height: 2.59, backDepth: 0.218 },
        motion: { kind: "pocket", clearDepth: 0, maxTravel: leaves === 1 ? 3.05 : 1.55,
          leaves: leaves === 1 ? [{ leaf: 0, travelU: 3.05, pocket: {
            offset: 16, sill: 0.002, width: 3.078, height: 2.526, frontDepth: 0.087, backDepth: 0.183,
          } }] : [
            { leaf: 0, travelU: -1.55, pocket: { offset: 11.422, sill: 0.002, width: 1.578,
              height: 2.526, frontDepth: 0.087, backDepth: 0.183 } },
            { leaf: 1, travelU: 1.55, pocket: { offset: 16, sill: 0.002, width: 1.578,
              height: 2.526, frontDepth: 0.087, backDepth: 0.183 } },
          ],
        },
      },
    };
    blueprint.floors[0]!.openings = [opening];
    const fixture = makeFixture({ seed: 6, blueprint, type: "offices" });
    const result = await generateFloorInteriors(fixture.request, {
      shellDoc: fixture.shellDoc, textures: { mode: "keys" },
    });
    const triangles = await facadeTriangles(result.floorGlbs.get(0)!, blueprint.floors[0]!, opening);
    const passage = opening.door!.clearance!;
    expect(triangles.some(triangle => triangleIntersectsBox(triangle,
      [passage.offset + 0.002, 0.04, 0.001], [passage.offset + passage.width - 0.002, passage.height - 0.002, 0.56])))
      .toBe(false);
    for (const { pocket, travelU } of (opening.door!.motion as PocketDoorMotion).leaves) {
      const jamb = travelU < 0 ? passage.offset : passage.offset + passage.width;
      expect(triangles.some(triangle => triangleIntersectsBox(triangle,
        [jamb - 0.02, pocket.sill + 0.02, pocket.frontDepth + 0.002],
        [jamb + 0.02, pocket.sill + pocket.height - 0.02, pocket.backDepth - 0.002])))
        .toBe(false);
    }
    const returns = triangles.flat().filter(([u, y, depth]) =>
      (Math.abs(u - passage.offset) < 1e-5 || Math.abs(u - passage.offset - passage.width) < 1e-5)
      && y > 0.01 && y < passage.height - 0.01 && depth < 0.44 - 1e-5 && depth > 0);
    expect(returns.length).toBeGreaterThan(0);
    expect(Math.min(...returns.map(vertex => vertex[2]))).toBeCloseTo(passage.backDepth, 5);
  }
});
