import type { Rect3 } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { STAIR } from "../layout/constants.js";
import type { CorePlan } from "../layout/core-plan.js";
import { stairEntryUv } from "../layout/plan-floor.js";
import type { Frame, UvRect } from "../layout/uv.js";
import { uvRectCorners, uvToWorld } from "../layout/uv.js";
import type { UvWallHole } from "./walls.js";
import type { MaterialKeys } from "./materials.js";

const SLAB = 0.18; // structural thickness under treads and landings

/** One tread or landing: axis-aligned rect in the layout frame, y = top surface. */
export interface UvStep {
  u: number;
  v: number;
  lu: number;
  lv: number;
  y: number;
}

/** U-return flights inside one shaft for one climb, frame space. Flights run along u in
 *  two lanes; each pair meets on a half landing. Any climb height (spans included). */
export function computeStairSteps(shaft: UvRect, entryLowEnd: boolean, elevation: number, climb: number): UvStep[] {
  const runLen = shaft.lu;
  const laneW = shaft.lv / 2;

  const totalRisers = Math.ceil(climb / STAIR.riser);
  const flights = 2 * Math.ceil(totalRisers / (2 * STAIR.maxRisersPerFlight));
  const risersPerFlight = Math.ceil(totalRisers / flights);
  const rise = climb / (risersPerFlight * flights);

  const out: UvStep[] = [];
  // local frame: s along the run from the entry end, lane 0 = entry lane
  const step = (s0: number, s1: number, lane0: number, lane1: number, yTop: number): UvStep => {
    const lo = Math.min(s0, s1);
    const hi = Math.max(s0, s1);
    const a = entryLowEnd ? lo : runLen - hi;
    const b = entryLowEnd ? hi : runLen - lo;
    return { u: shaft.u + a, v: shaft.v + lane0 * laneW, lu: b - a, lv: (lane1 - lane0) * laneW, y: yTop };
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
        ? step(tA, tB, lane, lane + 1, y)
        : step(runLen - STAIR.landing - (i + 1) * STAIR.tread, runLen - STAIR.landing - i * STAIR.tread, lane, lane + 1, y));
    }
    if (f < flights - 1) {
      // half landing at the far (or entry) end, spanning both lanes
      out.push(climbingOut
        ? step(runLen - STAIR.landing, runLen, 0, 2, y)
        : step(0, STAIR.landing, 0, 2, y));
      lane = lane === 0 ? 1 : 0;
    }
  }
  return out;
}

export function emitStairMeshes(mb: MeshBuilder, keys: MaterialKeys, frame: Frame, steps: UvStep[]): void {
  const material = keys.concrete();
  for (const s of steps) {
    const corners = uvRectCorners({ u: s.u, v: s.v, lu: s.lu, lv: s.lv }).map((p) => uvToWorld(p, frame));
    mb.addPrism(material, corners, s.y - SLAB, s.y);
  }
}

/** Frame rect (rotate about center by coreAngleDeg) for the floor JSON. */
export function stepToFrameRect(s: UvStep, frame: Frame): Rect3 {
  const [cx, cz] = uvToWorld([s.u + s.lu / 2, s.v + s.lv / 2], frame);
  return {
    x: Math.round((cx - s.lu / 2) * 1000) / 1000,
    y: Math.round(s.y * 1000) / 1000,
    z: Math.round((cz - s.lv / 2) * 1000) / 1000,
    w: Math.round(s.lu * 1000) / 1000,
    d: Math.round(s.lv * 1000) / 1000,
  };
}

/** Entry hole for a stair shaft, uv wall-line format. */
export function stairEntryHole(core: CorePlan, stair: "a" | "b", elevation: number): UvWallHole {
  if (stair === "a") {
    const [u] = stairEntryUv(core, "a");
    return { axis: "H", c: core.vFace, hole: { at: u, width: 1.1, y0: elevation, y1: elevation + 2.1 } };
  }
  const b = core.stairB!;
  const [, v] = stairEntryUv(core, "b");
  return { axis: "V", c: b.u, hole: { at: v, width: 1.1, y0: elevation, y1: elevation + 2.1 } };
}

/** Whether a stair's entry sits at the low-u end of its shaft. */
export function entryAtLowEnd(core: CorePlan, stair: "a" | "b"): boolean {
  const shaft = stair === "a" ? core.stairA : core.stairB!;
  const [u] = stairEntryUv(core, stair);
  return u < shaft.u + shaft.lu / 2;
}
