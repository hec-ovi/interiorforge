import type { Point } from "../core/geom.js";
import type { LightFixture } from "../core/types.js";
import type { Vec3 } from "../glb/mesh-builder.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import type { MaterialKeys } from "./materials.js";

/** A fixture is a plain metal housing with a separate emissive lens, not a glowing block. */
const SHAPE = {
  strip: { halfWidth: 0.09, height: 0.08, inset: 0.02 },
  cove: { halfWidth: 0.05, height: 0.02, inset: 0.012 },
  spot: { halfWidth: 0.18, height: 0.06, inset: 0.03 },
};

/** A downlight reads as a flush ceiling panel, not a dot. */
const SPOT_LENGTH = 0.36;
const LENS_GAP = 0.004;
const COVE_LIP = 0.12;
const COVE_LIP_THICKNESS = 0.02;

/** Metal housings and exposed lenses for ceiling strips, corridor spots and venue coves,
 *  at the exact poses the floor JSON publishes. */
export function emitLightFixtures(mb: MeshBuilder, keys: MaterialKeys, lights: LightFixture[]): void {
  for (const light of lights) {
    const shape = SHAPE[light.kind];
    const [x, y, z] = light.position;
    const rad = (light.angleDeg * Math.PI) / 180;
    const dir: Point = [Math.cos(rad), Math.sin(rad)];
    const side: Point = [-dir[1], dir[0]];
    const half = (light.kind === "spot" ? SPOT_LENGTH : light.length) / 2;
    const plan = (along: number, across: number): Point[] =>
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [
        x + dir[0] * along * a! + side[0] * across * b!,
        z + dir[1] * along * a! + side[1] * across * b!,
      ]);
    const housing = keys.trim();
    const lens = keys.light(light.kind);
    mb.addPrism(housing, plan(half, shape.halfWidth), y, y + shape.height, "world");
    if (light.kind === "cove") {
      const lipCenter = shape.halfWidth - COVE_LIP_THICKNESS / 2;
      const lip = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]): Point => [
        x + dir[0] * half * a! + side[0] * (lipCenter + COVE_LIP_THICKNESS * b! / 2),
        z + dir[1] * half * a! + side[1] * (lipCenter + COVE_LIP_THICKNESS * b! / 2),
      ]);
      mb.addPrism(housing, lip, y + shape.height, y + shape.height + COVE_LIP, "world");
      lensQuad(mb, lens, plan(half - shape.inset, shape.halfWidth - shape.inset), y + shape.height + LENS_GAP, "up");
    } else {
      lensQuad(mb, lens, plan(half - shape.inset, shape.halfWidth - shape.inset), y - LENS_GAP, "down");
    }
  }
}

function lensQuad(
  mb: MeshBuilder, material: string, plan: Point[], y: number, facing: "up" | "down",
): void {
  const [p0, p1, p2, p3] = plan as [Point, Point, Point, Point];
  const at = (point: Point): Vec3 => [point[0], y, point[1]];
  const uv: [[number, number], [number, number], [number, number], [number, number]] =
    [[0, 0], [1, 0], [1, 1], [0, 1]];
  if (facing === "down") mb.addQuadUv(material, [at(p0), at(p1), at(p2), at(p3)], uv);
  else mb.addQuadUv(material, [at(p0), at(p3), at(p2), at(p1)], [uv[0]!, uv[3]!, uv[2]!, uv[1]!]);
}
