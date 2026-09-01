import type { Point } from "../core/geom.js";
import type { LightFixture } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import type { MaterialKeys } from "./materials.js";

/** Housing sizes per fixture kind: [half width across the run, height]. */
const SHAPE = {
  strip: { halfWidth: 0.08, height: 0.08 },
  cove: { halfWidth: 0.05, height: 0.07 },
  spot: { halfWidth: 0.13, height: 0.06 },
};

const SPOT_LENGTH = 0.26;

/** The emissive housings behind the floor's light fixtures: ceiling strips, corridor spots
 *  and the cove lines of venue rooms, at the exact poses the floor JSON publishes. */
export function emitLightFixtures(mb: MeshBuilder, keys: MaterialKeys, lights: LightFixture[]): void {
  const material = keys.light();
  for (const light of lights) {
    const shape = SHAPE[light.kind];
    const [x, y, z] = light.position;
    const rad = (light.angleDeg * Math.PI) / 180;
    const dir: Point = [Math.cos(rad), Math.sin(rad)];
    const side: Point = [-dir[1], dir[0]];
    const half = (light.kind === "spot" ? SPOT_LENGTH : light.length) / 2;
    const corners: Point[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [
      x + dir[0] * half * a! + side[0] * shape.halfWidth * b!,
      z + dir[1] * half * a! + side[1] * shape.halfWidth * b!,
    ]);
    mb.addPrism(material, corners, y, y + shape.height);
  }
}
