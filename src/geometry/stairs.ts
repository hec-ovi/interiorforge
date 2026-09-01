import type { Rect } from "../core/geom.js";
import type { Rect3, StairCore } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { STAIR } from "../layout/constants.js";
import type { MaterialKeys } from "./materials.js";

const SLAB = 0.18; // structural thickness under treads and landings

/** U-return flights inside one shaft for one climb. Flights run along the shaft's long
 *  dimension in two lanes; each pair of flights meets on a half landing at the far end.
 *  Handles any climb height (multiple pairs for double-height floors). */
export function computeStairSteps(shaft: Rect, entryLowEnd: boolean, elevation: number, climb: number): Rect3[] {
  const alongX = shaft.w >= shaft.d;
  const runLen = alongX ? shaft.w : shaft.d;
  const width = alongX ? shaft.d : shaft.w;
  const laneW = width / 2;

  const totalRisers = Math.ceil(climb / STAIR.riser);
  const flights = 2 * Math.ceil(totalRisers / (2 * STAIR.maxRisersPerFlight));
  const risersPerFlight = Math.ceil(totalRisers / flights);
  const rise = climb / (risersPerFlight * flights);

  const out: Rect3[] = [];
  // local frame: s along the run from the entry end, lane 0 = entry lane
  const rect = (s0: number, s1: number, lane0: number, lane1: number, yTop: number): Rect3 => {
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    const a = entryLowEnd ? lo : runLen - hi;
    const b = entryLowEnd ? hi : runLen - lo;
    return alongX
      ? { x: shaft.x + a, y: yTop, z: shaft.z + lane0 * laneW, w: b - a, d: (lane1 - lane0) * laneW }
      : { x: shaft.x + lane0 * laneW, y: yTop, z: shaft.z + a, w: (lane1 - lane0) * laneW, d: b - a };
  };

  let y = elevation;
  let lane = 0;
  for (let f = 0; f < flights; f++) {
    const climbingOut = f % 2 === 0; // away from the entry end
    const s0 = STAIR.landing;
    for (let i = 0; i < risersPerFlight; i++) {
      y += rise;
      const tA = s0 + i * STAIR.tread;
      const tB = tA + STAIR.tread;
      out.push(climbingOut
        ? rect(tA, tB, lane, lane + 1, y)
        : rect(runLen - STAIR.landing - (i + 1) * STAIR.tread, runLen - STAIR.landing - i * STAIR.tread, lane, lane + 1, y));
    }
    if (f < flights - 1) {
      // half landing at the far (or entry) end, spanning both lanes
      out.push(climbingOut
        ? rect(runLen - STAIR.landing, runLen, 0, 2, y)
        : rect(0, STAIR.landing, 0, 2, y));
      lane = lane === 0 ? 1 : 0;
    }
  }
  return out;
}

export function emitStairMeshes(mb: MeshBuilder, keys: MaterialKeys, steps: Rect3[]): void {
  const material = keys.concrete();
  for (const s of steps) {
    mb.addBox(material, { x: s.x, z: s.z, w: s.w, d: s.d }, s.y - SLAB, s.y);
  }
}

/** Entry hole for a stair shaft on the wall line its entry point faces. */
export function stairEntryHole(
  stair: StairCore, elevation: number,
): { axis: "H" | "V"; c: number; hole: { at: number; width: number; y0: number; y1: number } } {
  const r = stair.rect;
  const [ex, ez] = stair.entry;
  const candidates: { axis: "H" | "V"; c: number; at: number; dist: number }[] = [
    { axis: "H", c: r.z, at: ex, dist: Math.abs(ez - r.z) },
    { axis: "H", c: r.z + r.d, at: ex, dist: Math.abs(ez - (r.z + r.d)) },
    { axis: "V", c: r.x, at: ez, dist: Math.abs(ex - r.x) },
    { axis: "V", c: r.x + r.w, at: ez, dist: Math.abs(ex - (r.x + r.w)) },
  ];
  const best = candidates.sort((a, b) => a.dist - b.dist)[0]!;
  return {
    axis: best.axis, c: best.c,
    hole: { at: best.at, width: 1.1, y0: elevation, y1: elevation + 2.1 },
  };
}

/** Whether the entry sits at the low end of the shaft's long dimension. */
export function entryAtLowEnd(stair: StairCore): boolean {
  const r = stair.rect;
  const alongX = r.w >= r.d;
  const center = alongX ? r.x + r.w / 2 : r.z + r.d / 2;
  const entry = alongX ? stair.entry[0] : stair.entry[1];
  return entry < center;
}
