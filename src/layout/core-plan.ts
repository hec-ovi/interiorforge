import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import { clipPolygonToRect, polygonArea, polygonBounds } from "../core/geom.js";
import type { FloorAssignment, InteriorRequest } from "../core/types.js";
import type { StairStyle } from "../core/types.js";
import { CORRIDOR, ELEVATOR, RISER_SHAFT, ROOM, SINGLE_LOADED_BELOW, STAIR, TWO_STAIRS, WALKUP } from "./constants.js";
import { fullCoverageU } from "./frame.js";
import type { Frame, UvRect } from "./uv.js";
import { makeFrame, snap, snapDown, snapUp, toUvPolygon, worldToUv } from "./uv.js";

export interface StairFlights {
  flightsPerFloor: number;
  risersPerFlight: number;
}

/** standard: elevator core in the shaft row. compact: stairs turn into columns reaching
 *  into the rear strip so near-miss bands keep elevators. walkup: stair-only, capped. */
export type CoreMode = "standard" | "compact" | "walkup";

/** Building-wide vertical core, all in uv (frame) space; identical on every floor. */
export interface CorePlan {
  frame: Frame;
  mode: CoreMode;
  /** v of the core block's corridor-side face; corridors hang below it, the core above */
  vFace: number;
  /** u range of the whole core block including the service stub */
  u0: number;
  u1: number;
  depth: number;
  stairStyle: StairStyle;
  stairDepth: number;
  elevatorCount: number;
  stairA: UvRect;
  stairB?: UvRect;
  elevators: { id: string; rect: UvRect }[];
  riser: UvRect;
  stub: UvRect;
}

const STAIR_WIDTH = 2 * STAIR.flightWidth + STAIR.flightGap; // two flights side by side
const MARGIN = 0.5;
const SCAN_RANGE = 8; // how far vFace may move from its ideal to find a fitting band

/** Shared inputs behind planCore and coreFeasibility: same frame, same candidate bands. */
interface CoreEnvelope {
  frame: Frame;
  uvFloors: Point[][];
  vMin: number;
  vMax: number;
  vLen: number;
  vTopMin: number;
  area: number;
  aboveFloors: number;
  topElevation: number;
  twoStairs: boolean;
  stairDepth: number;
  crossDepthOk: boolean;
  idealVFace: number;
  candidates: number[];
}

function envelopeOf(floors: InteriorRequest["blueprint"]["floors"]): CoreEnvelope {
  const ground = floors.find((f) => f.index === 0)!;
  const frame = principalFrame(ground);
  const uvFloors = floors.map((f) => toUvPolygon(f.outline, frame));
  const bounds = polygonBounds(uvFloors[floors.findIndex((f) => f.index === 0)]!);
  const vLen = bounds.d;
  const vTopMin = Math.min(...uvFloors.map((poly) => {
    const b = polygonBounds(poly);
    return b.z + b.d;
  }));

  const area = polygonArea(ground.outline);
  const aboveFloors = floors.filter((f) => f.index >= 0).length;
  const twoStairs = area > TWO_STAIRS.areaOver || aboveFloors > TWO_STAIRS.floorsOver;
  const hMax = Math.max(...floors.map((f) => f.height));

  const idealVFace = vLen < SINGLE_LOADED_BELOW
    ? snapDown(bounds.z + vLen - ELEVATOR.shaft)
    : snap(bounds.z + (vLen + CORRIDOR.width) / 2);
  const vMin = snapUp(bounds.z + ROOM.minStripDepth + CORRIDOR.width);
  const vMax = snapDown(bounds.z + vLen - ELEVATOR.shaft);
  // ideal first, then outward in 0.5 steps (lower side first on ties), clamped
  const candidates: number[] = [];
  for (let offset = 0; offset <= SCAN_RANGE; offset += 0.5) {
    for (const v of offset === 0 ? [idealVFace] : [idealVFace - offset, idealVFace + offset]) {
      if (v >= vMin && v <= vMax && !candidates.includes(v)) candidates.push(v);
    }
  }

  return {
    frame, uvFloors, vMin, vMax, vLen, vTopMin, area, aboveFloors,
    topElevation: floors.at(-1)!.elevation,
    twoStairs, stairDepth: stairShaftDepth(hMax),
    crossDepthOk: ELEVATOR.shaft + CORRIDOR.width + ROOM.minStripDepth <= vLen,
    idealVFace, candidates,
  };
}

function bandAt(env: CoreEnvelope, vFace: number): [number, number] {
  let u0 = -Infinity;
  let u1 = Infinity;
  for (const poly of env.uvFloors) {
    const [a, b] = fullCoverageU(poly, vFace - CORRIDOR.width, vFace + ELEVATOR.shaft);
    u0 = Math.max(u0, a);
    u1 = Math.min(u1, b);
  }
  return [u0, u1];
}

/** Row core (standard, walkup): everything the block needs beyond its elevators. */
function rowFixedLen(env: CoreEnvelope): number {
  return env.stairDepth + RISER_SHAFT.w + CORRIDOR.serviceStub + (env.twoStairs ? env.stairDepth : 0) + MARGIN;
}

/** Compact core: stairs become 2.5 m columns reaching stairDepth into the rear strip. */
function compactFixedLen(env: CoreEnvelope): number {
  const stairCols = (env.twoStairs ? 2 : 1) * snapUp(STAIR_WIDTH);
  return stairCols + RISER_SHAFT.w + CORRIDOR.serviceStub + MARGIN;
}

interface Placement {
  mode: CoreMode;
  vFace: number;
  bandU0: number;
  bandU1: number;
  bandLen: number;
  maxElevators: number;
}

/** The single mode-and-position selector shared by planCore and coreFeasibility. */
function selectPlacement(env: CoreEnvelope): Placement | null {
  const rowFixed = rowFixedLen(env);
  const compactFixed = compactFixedLen(env);
  const place = (mode: CoreMode, vFace: number, bandU0: number, bandU1: number, fixed: number): Placement => ({
    mode, vFace, bandU0, bandU1, bandLen: bandU1 - bandU0,
    maxElevators: mode === "walkup" ? 0 : Math.max(0, Math.floor((bandU1 - bandU0 - fixed) / ELEVATOR.shaft)),
  });

  for (const vFace of env.candidates) {
    const [u0, u1] = bandAt(env, vFace);
    if (u1 - u0 >= rowFixed + ELEVATOR.shaft) return place("standard", vFace, u0, u1, rowFixed);
  }
  for (const vFace of env.candidates) {
    if (env.vTopMin - vFace < env.stairDepth + 0.5) continue; // stair columns need rear depth
    const [u0, u1] = bandAt(env, vFace);
    if (u1 - u0 >= compactFixed + ELEVATOR.shaft) return place("compact", vFace, u0, u1, compactFixed);
  }
  let best: [number, number, number] | null = null;
  for (const vFace of env.candidates) {
    const [u0, u1] = bandAt(env, vFace);
    if (!best || u1 - u0 > best[2] - best[1]) best = [vFace, u0, u1];
  }
  if (best && best[2] - best[1] >= rowFixed) return place("walkup", best[0], best[1], best[2], rowFixed);
  return null;
}

/** Longest band any corridor position offers; reported when no mode fits. */
function bestBandLen(env: CoreEnvelope): number {
  let best = 0;
  for (const vFace of env.candidates) {
    const [u0, u1] = bandAt(env, vFace);
    best = Math.max(best, u1 - u0);
  }
  return best;
}

export interface CoreFeasibility {
  /** whether THIS blueprint (its floor count included) generates */
  fits: boolean;
  /** standard: elevator core in the shaft row. compact: stair columns, elevators kept.
   *  walkup: stair-only, floors capped at walkupMaxFloors. none: not buildable. */
  mode: CoreMode | "none";
  frameAngleDeg: number;
  /** chosen corridor-face position and its band (after the vFace scan) */
  bandLength: number;
  /** row core: stair + one car + riser + stub (+ egress stair) + margin */
  minCoreLength: number;
  /** compact core: stair columns + one car + riser + stub + margin; also needs
   *  rear depth >= stairShaftDepth above the corridor face */
  minCompactCoreLength: number;
  /** row core without the car */
  minWalkupCoreLength: number;
  walkupMaxFloors: number;
  maxElevators: number;
  crossDepthOk: boolean;
}

/** Assembler pre-check mirroring planCore exactly: same frame, same vFace scan, same
 *  thresholds (see schemas/core-feasibility.json). */
export function coreFeasibility(blueprint: InteriorRequest["blueprint"]): CoreFeasibility {
  const env = envelopeOf(blueprint.floors);
  const placement = env.crossDepthOk ? selectPlacement(env) : null;
  const mode = placement?.mode ?? "none";
  return {
    fits: mode === "standard" || mode === "compact" ||
      (mode === "walkup" && env.aboveFloors <= WALKUP.maxFloors),
    mode,
    frameAngleDeg: env.frame.angleDeg,
    bandLength: Math.round((placement ? placement.bandLen : bestBandLen(env)) * 100) / 100,
    minCoreLength: Math.round((rowFixedLen(env) + ELEVATOR.shaft) * 100) / 100,
    minCompactCoreLength: Math.round((compactFixedLen(env) + ELEVATOR.shaft) * 100) / 100,
    minWalkupCoreLength: Math.round(rowFixedLen(env) * 100) / 100,
    walkupMaxFloors: WALKUP.maxFloors,
    maxElevators: placement?.maxElevators ?? 0,
    crossDepthOk: env.crossDepthOk,
  };
}

/** Places the vertical core once per building; every floor reuses these rects. */
export function planCore(request: InteriorRequest, assignments: FloorAssignment[]): CorePlan {
  const floors = request.blueprint.floors;
  const env = envelopeOf(floors);
  const { frame, twoStairs, stairDepth } = env;

  if (!env.crossDepthOk) {
    throw new InteriorError("E_FLOOR_TOO_SMALL", `plate depth ${env.vLen.toFixed(1)}m is below the ${(ELEVATOR.shaft + CORRIDOR.width + ROOM.minStripDepth).toFixed(1)}m minimum for corridor, shafts and rooms`);
  }
  const placement = selectPlacement(env);
  if (!placement) {
    throw new InteriorError("E_FLOOR_TOO_SMALL", `no corridor position holds a core: best band ${bestBandLen(env).toFixed(1)}m is below the walkup minimum ${rowFixedLen(env).toFixed(1)}m (standard minimum ${(rowFixedLen(env) + ELEVATOR.shaft).toFixed(1)}m, compact minimum ${(compactFixedLen(env) + ELEVATOR.shaft).toFixed(1)}m; see schemas/core-feasibility.json)`);
  }
  if (placement.mode === "walkup" && env.aboveFloors > WALKUP.maxFloors) {
    throw new InteriorError("E_FLOOR_TOO_SMALL", `walkup core (band ${placement.bandLen.toFixed(1)}m, standard minimum ${(rowFixedLen(env) + ELEVATOR.shaft).toFixed(1)}m, compact minimum ${(compactFixedLen(env) + ELEVATOR.shaft).toFixed(1)}m) allows at most ${WALKUP.maxFloors} floors, blueprint has ${env.aboveFloors}`);
  }

  const { mode, vFace, bandU0, bandU1 } = placement;
  const elevatorCount = mode === "walkup" ? 0
    : Math.min(elevatorsFor(request, env.area, env.aboveFloors, env.topElevation), Math.max(1, placement.maxElevators));

  const stairColW = snapUp(STAIR_WIDTH);
  const stairALen = mode === "compact" ? stairColW : stairDepth;
  const blockLen = stairALen + elevatorCount * ELEVATOR.shaft + RISER_SHAFT.w + CORRIDOR.serviceStub
    + (mode === "compact" && twoStairs ? stairColW : 0);

  const inlineStairBu = snapDown(bandU1) - stairDepth;
  let u0 = snap(bandU0 + (bandU1 - bandU0 - blockLen) / 2);
  if (mode !== "compact" && twoStairs) u0 = Math.min(u0, snapDown(inlineStairBu - blockLen));
  u0 = Math.max(u0, snapUp(bandU0));

  let u = u0;
  const stairA: UvRect = mode === "compact"
    ? { u, v: vFace, lu: stairColW, lv: stairDepth }
    : { u, v: vFace, lu: stairDepth, lv: stairColW };
  u += stairA.lu;
  const elevators: CorePlan["elevators"] = [];
  for (let i = 0; i < elevatorCount; i++) {
    elevators.push({ id: `elev-${i}`, rect: { u, v: vFace, lu: ELEVATOR.shaft, lv: ELEVATOR.shaft } });
    u += ELEVATOR.shaft;
  }
  const riser: UvRect = { u, v: vFace, lu: RISER_SHAFT.w, lv: RISER_SHAFT.d };
  u += RISER_SHAFT.w;
  const stub: UvRect = { u, v: vFace, lu: CORRIDOR.serviceStub, lv: ELEVATOR.shaft };
  u += CORRIDOR.serviceStub;

  let stairB: UvRect | undefined;
  if (twoStairs) {
    if (mode === "compact") {
      stairB = { u, v: vFace, lu: stairColW, lv: stairDepth };
      u += stairColW;
    } else {
      // inline at the far end of the corridor band, egress separation from stair A
      stairB = { u: inlineStairBu, v: vFace - CORRIDOR.width, lu: stairDepth, lv: CORRIDOR.width };
    }
  }

  const plan: CorePlan = {
    frame, mode, vFace, u0, u1: u, depth: ELEVATOR.shaft,
    stairStyle: "u_return", stairDepth, elevatorCount,
    stairA, stairB, elevators, riser, stub,
  };
  ensureCoreFitsAllFloors(request, plan);
  return plan;
}

/** Where a stair is entered: the walk-in point plus the wall line its door pierces. */
export function stairAccess(
  core: CorePlan, which: "a" | "b",
): { entry: Point; axis: "H" | "V"; c: number; at: number } {
  const shaft = which === "a" ? core.stairA : core.stairB!;
  if (core.mode === "compact" || which === "a") {
    // door on the corridor face
    const at = core.mode === "compact" ? shaft.u + shaft.lu / 2 : shaft.u + shaft.lu - 0.7;
    return { entry: [at, core.vFace - 0.6], axis: "H", c: core.vFace, at };
  }
  // inline stair B: door on the face looking down the corridor
  const at = shaft.v + shaft.lv / 2;
  return { entry: [shaft.u - 0.6, at], axis: "V", c: shaft.u, at };
}

/** Frame aligned to the longest ground edge, flipped so the street entrance (when the
 *  ground floor has one) lies on the low-v side, where the hall and corridor face. */
function principalFrame(ground: { outline: [number, number][]; openings: { kind: string; edge: number; offset: number; width: number }[] }): Frame {
  const outline = ground.outline;
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  const a = outline[best]!;
  const b = outline[(best + 1) % outline.length]!;
  let angle = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  if (angle <= -90) angle += 180;
  if (angle > 90) angle -= 180;
  let frame = makeFrame(Math.round(angle * 100) / 100);

  const door = ground.openings.find((o) => o.kind === "door");
  if (door) {
    const p0 = outline[door.edge % outline.length]!;
    const p1 = outline[(door.edge + 1) % outline.length]!;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    const t = (door.offset + door.width / 2) / len;
    const doorWorld: [number, number] = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
    const uvDoor = worldToUv(doorWorld, frame);
    const vs = outline.map((p) => worldToUv(p, frame)[1]);
    if (uvDoor[1] > (Math.min(...vs) + Math.max(...vs)) / 2) {
      const flipped = angle > 0 ? angle - 180 : angle + 180;
      frame = makeFrame(Math.round(flipped * 100) / 100);
    }
  }
  return frame;
}

/** Exact flight split for one floor height: even flight count, comfortable risers. */
export function stairFlights(floorHeight: number): StairFlights {
  const totalRisers = Math.ceil(floorHeight / STAIR.riser);
  const flightsPerFloor = 2 * Math.ceil(totalRisers / (2 * STAIR.maxRisersPerFlight));
  return { flightsPerFloor, risersPerFlight: Math.ceil(totalRisers / flightsPerFloor) };
}

function stairShaftDepth(hMax: number): number {
  const { risersPerFlight } = stairFlights(hMax);
  return snapUp(risersPerFlight * STAIR.tread + 2 * STAIR.landing);
}

function elevatorsFor(request: InteriorRequest, area: number, aboveFloors: number, topElevation: number): number {
  const type = request.building.type;
  let cars: number;
  if (type === "residential" || type === "hotel") {
    const units = (area / ELEVATOR.unitAreaGuess) * aboveFloors;
    cars = Math.ceil(units / ELEVATOR.unitsPerCar);
  } else {
    cars = Math.ceil((area * aboveFloors) / ELEVATOR.officeAreaPerCar);
  }
  if (topElevation > ELEVATOR.serviceAboveElevation) cars += 1;
  return Math.min(ELEVATOR.maxCars, Math.max(1, cars));
}

function ensureCoreFitsAllFloors(request: InteriorRequest, plan: CorePlan): void {
  const rects: UvRect[] = [plan.stairA, plan.riser, plan.stub, ...plan.elevators.map((e) => e.rect)];
  if (plan.stairB) rects.push(plan.stairB);
  for (const floor of request.blueprint.floors) {
    const uvOutline = toUvPolygon(floor.outline, plan.frame);
    for (const rect of rects) {
      const clipped = clipPolygonToRect(uvOutline, { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv });
      const full = rect.lu * rect.lv;
      if (Math.abs(polygonArea(clipped)) < full - 1e-6) {
        throw new InteriorError("E_FLOOR_TOO_SMALL", "vertical core does not fit inside this floor outline", floor.index);
      }
    }
  }
}
