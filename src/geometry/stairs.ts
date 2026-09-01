import type { Rect3 } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { STAIR, stairSlab } from "../layout/constants.js";
import type { CorePlan } from "../layout/core-plan.js";
import { stairAccess } from "../layout/core-plan.js";
import type { Frame, UvRect } from "../layout/uv.js";
import { uvRectCorners, uvToWorld } from "../layout/uv.js";
import type { UvWallHole } from "./walls.js";
import type { MaterialKeys } from "./materials.js";

/** One tread or landing: axis-aligned rect in the layout frame, y = top surface. */
export interface UvStep {
  u: number;
  v: number;
  lu: number;
  lv: number;
  y: number;
}

/** The shaft's local run: s along the flights from the entry end, lanes across it. */
interface Run {
  runLen: number;
  laneWidth: number;
  step(s0: number, s1: number, lane0: number, lane1: number, yTop: number): UvStep;
}

function runOf(shaft: UvRect, entryLowEnd: boolean): Run {
  const alongU = shaft.lu >= shaft.lv;
  const runLen = alongU ? shaft.lu : shaft.lv;
  const laneWidth = (alongU ? shaft.lv : shaft.lu) / 2;
  return {
    runLen,
    laneWidth,
    step(s0, s1, lane0, lane1, yTop) {
      const lo = Math.min(s0, s1);
      const hi = Math.max(s0, s1);
      const a = entryLowEnd ? lo : runLen - hi;
      const b = entryLowEnd ? hi : runLen - lo;
      return alongU
        ? { u: shaft.u + a, v: shaft.v + lane0 * laneWidth, lu: b - a, lv: (lane1 - lane0) * laneWidth, y: yTop }
        : { u: shaft.u + lane0 * laneWidth, v: shaft.v + a, lu: (lane1 - lane0) * laneWidth, lv: b - a, y: yTop };
    },
  };
}

/** Clear width of one flight: what the player capsule has to pass through. */
export function stairClearWidth(shaft: UvRect): number {
  return Math.min(shaft.lu, shaft.lv) / 2;
}

/** Landing at the walk-in end, at floor level, as deep as the climb leaving it allows. Only
 *  the lowest served floor needs its own; every floor above stands on the landing the climb
 *  below arrives on. */
export function baseLanding(shaft: UvRect, entryLowEnd: boolean, elevation: number, climb: number): UvStep {
  const run = runOf(shaft, entryLowEnd);
  const depth = climb > 0 ? flightPlan(run.runLen, climb).landing : STAIR.landing;
  return run.step(0, depth, 0, 2, elevation);
}

interface FlightPlan {
  flights: number;
  risersPerFlight: number;
  rise: number;
  landing: number;
  flightLen: number;
}

/** How one climb splits into flights inside a run: even flight count, comfortable risers,
 *  landings giving up depth (never below a flight's own width) before the flights split. */
function flightPlan(runLen: number, climb: number): FlightPlan {
  const totalRisers = Math.ceil(climb / STAIR.riser);
  let flights = 2 * Math.ceil(totalRisers / (2 * STAIR.maxRisersPerFlight));
  let landing = STAIR.landing;
  while (Math.ceil(totalRisers / flights) * STAIR.tread > runLen - 2 * landing && flights < 40) {
    const room = (runLen - Math.ceil(totalRisers / flights) * STAIR.tread) / 2;
    if (room >= STAIR.flightWidth) {
      landing = room;
      break;
    }
    flights += 2;
  }
  const risersPerFlight = Math.ceil(totalRisers / flights);
  return {
    flights, risersPerFlight, landing,
    rise: climb / (risersPerFlight * flights),
    flightLen: risersPerFlight * STAIR.tread,
  };
}

/** U-return flights inside one shaft for one climb, frame space. Flights run along the
 *  shaft's LONG dimension in two lanes and meet on landings that stretch to the flight they
 *  serve, so the walk line has no gap; the last step is the landing the climb arrives on.
 *  Any climb height (spans included); row shafts run along u, compact columns along v. */
export function computeStairSteps(shaft: UvRect, entryLowEnd: boolean, elevation: number, climb: number): UvStep[] {
  const run = runOf(shaft, entryLowEnd);
  const { flights, risersPerFlight, rise, landing, flightLen } = flightPlan(run.runLen, climb);
  // both flights of a turn share the same stretch of run, side by side in the two lanes, and
  // the entry landing is always the same depth: landings line up storey over storey, so a
  // flight never runs low over the landing below it
  const farStart = landing + flightLen;

  const out: UvStep[] = [];
  let y = elevation;
  let lane = 0;
  for (let f = 0; f < flights; f++) {
    const climbingOut = f % 2 === 0; // away from the entry end
    for (let i = 0; i < risersPerFlight; i++) {
      y += rise;
      const tA = climbingOut ? landing + i * STAIR.tread : farStart - (i + 1) * STAIR.tread;
      out.push(run.step(tA, tA + STAIR.tread, lane, lane + 1, y));
    }
    // the turn landing fills the rest of the run; the entry landing receives the way down
    out.push(climbingOut ? run.step(farStart, run.runLen, 0, 2, y) : run.step(0, landing, 0, 2, y));
    if (f < flights - 1) lane = lane === 0 ? 1 : 0;
  }
  return out;
}

export function emitStairMeshes(
  mb: MeshBuilder, keys: MaterialKeys, frame: Frame, steps: UvStep[], slab: number,
): void {
  const material = keys.concrete();
  for (const s of steps) {
    const corners = uvRectCorners({ u: s.u, v: s.v, lu: s.lu, lv: s.lv }).map((p) => uvToWorld(p, frame));
    mb.addPrism(material, corners, s.y - slab, s.y);
  }
}

/** Anything less than this above a tread is the stair you are climbing, not a ceiling. */
const OVERHEAD_MIN_RISE = 1.0;

/** One step of a run with the structural thickness under it, in frame space where every
 *  step is axis aligned whatever the parcel's rotation. */
export interface RunStep extends UvStep {
  slab: number;
}

/** Smallest clear height over any tread or landing of one stair: the distance to the
 *  underside of the flight passing overhead. Infinity when nothing passes over. */
export function minHeadroom(steps: readonly RunStep[]): number {
  const sorted = [...steps].sort((a, b) => a.y - b.y);
  let worst = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const below = sorted[i]!;
    for (let j = i + 1; j < sorted.length; j++) {
      const above = sorted[j]!;
      const rise = above.y - below.y;
      if (rise < OVERHEAD_MIN_RISE) continue;
      if (rise - STAIR.slab >= worst) break; // sorted by y: nothing closer follows
      if (!overlaps(below, above)) continue;
      worst = rise - above.slab;
    }
  }
  return worst;
}

function overlaps(a: UvStep, b: UvStep): boolean {
  return a.u < b.u + b.lu && b.u < a.u + a.lu && a.v < b.v + b.lv && b.v < a.v + a.lv;
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

/** Entry hole for a stair shaft, uv wall-line format, from the shared access definition. */
export function stairEntryHole(core: CorePlan, stair: "a" | "b", elevation: number): UvWallHole {
  const access = stairAccess(core, stair);
  return {
    axis: access.axis, c: access.c,
    hole: { at: access.at, width: 1.1, y0: elevation, y1: elevation + STAIR.headroom },
  };
}

/** Whether a stair's entry sits at the low end of its shaft's run dimension. */
export function entryAtLowEnd(core: CorePlan, stair: "a" | "b"): boolean {
  const shaft = stair === "a" ? core.stairA : core.stairB!;
  const { entry } = stairAccess(core, stair);
  return shaft.lu >= shaft.lv
    ? entry[0] < shaft.u + shaft.lu / 2
    : entry[1] < shaft.v + shaft.lv / 2;
}
