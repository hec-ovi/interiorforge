import type { Point } from "../core/geom.js";
import type { MeshBuilder } from "../glb/mesh-builder.js";
import type { Frame, UvRect } from "../layout/uv.js";
import { uvRectWorldBounds, uvToWorld } from "../layout/uv.js";
import type { RunStep } from "./stairs.js";

/** Reads stair headroom from the geometry that will actually ship. */
const PROBE_INSET = 0.12;
const MIN_SLOPE_NORMAL_Y = 0.3;
/** GLB Float32 rounding at city-scale coordinates is below 0.1 mm. */
const SURFACE_EPS = 1e-4;

interface Tri {
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  material: string;
}

function facesOver(shaft: UvRect, frame: Frame, builders: readonly MeshBuilder[]): Tri[] {
  const box = uvRectWorldBounds(shaft, frame);
  const intersects = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => {
    const minX = Math.min(a[0], b[0], c[0]), maxX = Math.max(a[0], b[0], c[0]);
    const minZ = Math.min(a[2], b[2], c[2]), maxZ = Math.max(a[2], b[2], c[2]);
    return maxX >= box.x && minX <= box.x + box.w && maxZ >= box.z && minZ <= box.z + box.d;
  };
  const out: Tri[] = [];
  for (const mb of builders) {
    for (const material of mb.materials()) {
      const group = mb.getGroup(material)!;
      const at = (i: number): [number, number, number] => [
        group.positions[i * 3]!, group.positions[i * 3 + 1]!, group.positions[i * 3 + 2]!,
      ];
      for (let i = 0; i + 2 < group.indices.length; i += 3) {
        const ia = group.indices[i]!, ib = group.indices[i + 1]!, ic = group.indices[i + 2]!;
        if (Math.abs(group.normals[ia * 3 + 1]!) < MIN_SLOPE_NORMAL_Y) continue;
        const a = at(ia), b = at(ib), c = at(ic);
        if (intersects(a, b, c)) out.push({ a, b, c, material });
      }
    }
  }
  return out;
}

function clearAbove(faces: readonly Tri[], x: number, y: number, z: number): { clear: number; material: string } {
  let best = { clear: Infinity, material: "" };
  for (const { a, b, c, material } of faces) {
    const divisor = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(divisor) < 1e-12) continue;
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / divisor;
    const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / divisor;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const hit = l1 * a[1] + l2 * b[1] + l3 * c[1] - y;
    if (hit > SURFACE_EPS && hit < best.clear) best = { clear: hit, material };
  }
  return best;
}

export interface StairClearance {
  clear: number;
  material: string;
  step: RunStep;
}

export function stairClearance(
  shaft: UvRect, frame: Frame, steps: readonly RunStep[], builders: readonly MeshBuilder[],
): StairClearance {
  const faces = facesOver(shaft, frame, builders);
  let worst: StairClearance = { clear: Infinity, material: "", step: steps[0]! };
  for (const step of steps) {
    const du = Math.min(PROBE_INSET, step.lu / 2);
    const dv = Math.min(PROBE_INSET, step.lv / 2);
    const probes: Point[] = [
      [step.u + step.lu / 2, step.v + step.lv / 2],
      [step.u + du, step.v + dv], [step.u + step.lu - du, step.v + dv],
      [step.u + du, step.v + step.lv - dv], [step.u + step.lu - du, step.v + step.lv - dv],
    ];
    for (const point of probes) {
      const [x, z] = uvToWorld(point, frame);
      const hit = clearAbove(faces, x, step.y, z);
      if (hit.clear < worst.clear) worst = { ...hit, step };
    }
  }
  return worst;
}
