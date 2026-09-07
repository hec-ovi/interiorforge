import type { LightFixture } from "../../core/types.js";
import type { MeshBuilder, Vec3 } from "../../glb/mesh-builder.js";
import type { MaterialKeys } from "../materials.js";

/** A narrow fitted line has a recessed lens and a closed backing, in its published frame. */
export function emitLineLight(mesh: MeshBuilder, keys: MaterialKeys, light: LightFixture): void {
  const x = light.axis!, n = light.direction!;
  const y: Vec3 = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
  const at = (a: number, b: number, depth: number): Vec3 => light.position.map((p, i) =>
    p + x[i]! * a + y[i]! * b + n[i]! * depth) as Vec3;
  const h = light.length / 2, corners = [[-h, -.02], [h, -.02], [h, .02], [-h, .02]];
  const front = corners.map(([a, b]) => at(a!, b!, -.003)), back = corners.map(([a, b]) => at(a!, b!, -.025));
  mesh.addQuad(keys.trim(), [back[3]!, back[2]!, back[1]!, back[0]!]);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    mesh.addQuad(keys.trim(), [front[i]!, back[i]!, back[j]!, front[j]!]);
  }
  mesh.addQuad(keys.trim(), front as [Vec3, Vec3, Vec3, Vec3]);
  const lens = light.color ? keys.key("interior-led-cyan", undefined, "mid") : keys.light("cove");
  mesh.addQuadUv(lens, [at(-h + .015, -.014, 0), at(h - .015, -.014, 0),
    at(h - .015, .014, 0), at(-h + .015, .014, 0)], [[0, 0], [1, 0], [1, 1], [0, 1]]);
}
