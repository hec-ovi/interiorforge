import type { Rng } from "../core/rng.js";
import type { EdgeName, PlanRoom } from "./plan-types.js";
import { roomEdges } from "./room-shape.js";
import type { UvRect } from "./uv.js";
import { WALL } from "./constants.js";
import { BAND_PROUD } from "./shell.js";

type BathroomKind = "toilet" | "sink" | "shower";
type Size = [number, number, number];

export const BATHROOM_WALL_CLEARANCE = WALL / 2 + 2 * BAND_PROUD;

export interface BathroomPlacement {
  kind: BathroomKind;
  footprint: UvRect;
  rotationDeg: 0 | 90 | 180 | 270;
  operation: UvRect;
}

/** Fixed modules and their standing space. Operation areas can share clear floor. */
const RECIPE: readonly { kind: BathroomKind; clearWidth: number; front: number }[] = [
  { kind: "shower", clearWidth: 0.9, front: 0.7 },
  { kind: "toilet", clearWidth: 0.8, front: 0.6 },
  { kind: "sink", clearWidth: 0.6, front: 0.6 },
];

/** Returns a complete recipe or nothing; trying a layout never consumes furniture IDs. */
export function fitBathroomRecipe(
  room: PlanRoom, sizes: Record<BathroomKind, Size>, rng: Rng,
  fits: (footprint: UvRect, kind: BathroomKind) => boolean,
  covers: (operation: UvRect) => boolean,
): BathroomPlacement[] | null {
  const walls = rng.shuffle(roomEdges(room).filter(wall => wall.edge !== null));
  const candidates = RECIPE.map(module => {
    const [width, depth] = sizes[module.kind];
    const out: BathroomPlacement[] = [];
    for (const wall of walls) {
      const edge = wall.edge!;
      const horizontal = edge.startsWith("v");
      const along = horizontal ? 0 : 1, across = 1 - along;
      const low = Math.min(wall.a[along]!, wall.b[along]!);
      const length = Math.abs(wall.b[along]! - wall.a[along]!);
      const available = length - width - 0.2;
      if (available < 0) continue;
      // Include both ends and center, then the intervening quarter-metre positions.
      const offsets = new Set([0, available, available / 2]);
      for (let offset = 0.25; offset < available; offset += 0.25) offsets.add(offset);
      for (const offset of offsets) {
        const footprint = wallFootprint(edge, wall.a[across]!, low + 0.1 + offset, width, depth);
        const operation = operationFootprint(footprint, edge, module.clearWidth, module.front);
        if (fits(footprint, module.kind) && covers(operation)) {
          out.push({ kind: module.kind, footprint, operation, rotationDeg: rotation(edge) });
        }
      }
    }
    return out;
  });
  const chosen: BathroomPlacement[] = [];
  const search = (index: number): boolean => {
    if (index === candidates.length) return true;
    for (const candidate of candidates[index]!) {
      if (chosen.some(other => overlaps(candidate.footprint, other.footprint, 0.15)
        || overlaps(candidate.footprint, other.operation)
        || overlaps(candidate.operation, other.footprint))) continue;
      chosen.push(candidate);
      if (search(index + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  return search(0) ? chosen : null;
}

function wallFootprint(edge: EdgeName, wall: number, along: number, width: number, depth: number): UvRect {
  const inset = BATHROOM_WALL_CLEARANCE + 0.01;
  switch (edge) {
    case "v0": return { u: along, v: wall + inset, lu: width, lv: depth };
    case "v1": return { u: along, v: wall - inset - depth, lu: width, lv: depth };
    case "u0": return { u: wall + inset, v: along, lu: depth, lv: width };
    case "u1": return { u: wall - inset - depth, v: along, lu: depth, lv: width };
  }
}

function operationFootprint(fp: UvRect, edge: EdgeName, width: number, front: number): UvRect {
  const along = edge.startsWith("v") ? fp.lu : fp.lv;
  const side = Math.max(0, (width - along) / 2);
  switch (edge) {
    case "v0": return { u: fp.u - side, v: fp.v, lu: fp.lu + 2 * side, lv: fp.lv + front };
    case "v1": return { u: fp.u - side, v: fp.v - front, lu: fp.lu + 2 * side, lv: fp.lv + front };
    case "u0": return { u: fp.u, v: fp.v - side, lu: fp.lu + front, lv: fp.lv + 2 * side };
    case "u1": return { u: fp.u - front, v: fp.v - side, lu: fp.lu + front, lv: fp.lv + 2 * side };
  }
}

function overlaps(a: UvRect, b: UvRect, gap = 0): boolean {
  return a.u < b.u + b.lu + gap - 1e-8 && a.u + a.lu + gap > b.u + 1e-8
    && a.v < b.v + b.lv + gap - 1e-8 && a.v + a.lv + gap > b.v + 1e-8;
}

function rotation(edge: EdgeName): BathroomPlacement["rotationDeg"] {
  return edge === "v0" ? 0 : edge === "v1" ? 180 : edge === "u0" ? 90 : 270;
}
