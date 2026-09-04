import type { Point } from "../core/geom.js";
import { clipPolygonToRect, polygonBounds } from "../core/geom.js";
import type { BlueprintFloor, FloorKind } from "../core/types.js";
import { CORRIDOR } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import type { FloorFrame } from "./plan-types.js";
import { coversRect, snapDown, snapUp, toUvPolygon } from "./uv.js";

/** Floors laid out as one hall plus back of house. */
export const HALL_FLOOR_KINDS: ReadonlySet<FloorKind> = new Set([
  "lobby", "restaurant", "coffee_shop", "gym", "retail", "terrace", "parking", "mechanical",
]);

/** Commercial family: hall floors plus mall floors, whose shop units line a concourse. */
export const VENUE_KINDS: ReadonlySet<FloorKind> = new Set([...HALL_FLOOR_KINDS, "mall_floor"]);

/** Usable u range of a v band: bounds of the outline clipped to that band. Partial-depth
 *  slivers are included; rooms there get clipped polygons. */
export function usableU(uvOutline: readonly Point[], v0: number, v1: number): [number, number] {
  const b = usableBounds(uvOutline, v0, v1);
  if (!b) return [0, 0];
  return [snapUp(b.x), snapDown(b.x + b.w)];
}

function usableBounds(uvOutline: readonly Point[], v0: number, v1: number) {
  const clipped = clipPolygonToRect(uvOutline, { x: -1e7, z: v0, w: 2e7, d: v1 - v0 });
  return clipped.length === 0 ? null : polygonBounds(clipped);
}

/** Exact right edge of the full-depth plate joined to `start`. Rooms stay on the snapped
 *  grid, but a landing beside an inline stair must meet the facade without a floor seam. */
function coveredRightEdge(plate: readonly Point[], start: number, v0: number, v1: number): number {
  const bounds = usableBounds(plate, v0, v1);
  if (!bounds || bounds.x + bounds.w <= start) return start;
  let low = start;
  let high = bounds.x + bounds.w;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    if (coversRect(plate, { u: start, v: v0, lu: mid - start, lv: v1 - v0 })) low = mid;
    else high = mid;
  }
  return low;
}

/** Longest u run where the band's FULL depth is inside the outline. Shafts and corridors
 *  must live here; tapered parcel cuts shrink this well below usableU. */
export function fullCoverageU(uvOutline: readonly Point[], v0: number, v1: number): [number, number] {
  const [a, b] = usableU(uvOutline, v0, v1);
  if (b - a < 0.5) return [a, a];
  const step = 0.5;
  const depth = v1 - v0;
  let runStart = a;
  let best: [number, number] = [a, a];
  let u = a;
  while (u < b - 1e-9) {
    const w = Math.min(step, b - u);
    if (!coversRect(uvOutline, { u, v: v0, lu: w, lv: depth })) {
      if (u - runStart > best[1] - best[0]) best = [runStart, u];
      runStart = u + w;
    }
    u += w;
  }
  if (b - runStart > best[1] - best[0]) best = [runStart, b];
  return best;
}

/** Structural bands of one floor around the building-wide core, uv space. */
export function buildFrame(core: CorePlan, floor: BlueprintFloor, slabPlate = toUvPolygon(floor.outline, core.frame)): FloorFrame {
  const uvOutline = toUvPolygon(floor.outline, core.frame);
  const b = polygonBounds(uvOutline);
  const v0 = snapUp(b.z);
  const v1 = snapDown(b.z + b.d);
  const w = CORRIDOR.width;
  const vFace = core.vFace;

  // the corridor is the walkable spine: it only spans full-depth coverage
  const [cu0, cu1] = fullCoverageU(uvOutline, vFace - w, vFace);
  // compact mode keeps both stairs as columns in the core row: nothing sits in the band
  const stairB = core.mode !== "compact" ? core.stairB : undefined;
  const corridorEnd = stairB ? Math.min(cu1, stairB.u) : cu1;
  const corridor = { u: cu0, v: vFace - w, lu: corridorEnd - cu0, lv: w };
  const tailStart = stairB ? stairB.u + stairB.lu : cu1;
  const tailEnd = stairB ? coveredRightEdge(slabPlate, tailStart, vFace - w, vFace) : tailStart;
  const corridorTail = tailEnd - tailStart > 1e-4
    ? { u: tailStart, v: vFace - w, lu: tailEnd - tailStart, lv: w }
    : undefined;

  const [su0, su1] = usableU(uvOutline, v0, vFace - w);
  const south = vFace - w - v0 >= 1.6
    ? { u: su0, v: v0, lu: su1 - su0, lv: vFace - w - v0 }
    : { u: 0, v: 0, lu: 0, lv: 0 };

  const [nu0, nu1] = usableU(uvOutline, vFace, v1);
  const northSegments = [];
  if (core.u0 - nu0 >= 2) northSegments.push({ u: nu0, v: vFace, lu: core.u0 - nu0, lv: v1 - vFace });
  if (nu1 - core.u1 >= 2) northSegments.push({ u: core.u1, v: vFace, lu: nu1 - core.u1, lv: v1 - vFace });

  return {
    corridorU: [cu0, cu1],
    corridor,
    ...(corridorTail ? { corridorTail } : {}),
    stairB,
    south,
    northSegments,
    coreBlock: { u: core.u0, v: vFace, lu: core.u1 - core.u0, lv: v1 - vFace },
  };
}
