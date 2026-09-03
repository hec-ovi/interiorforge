import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import { insetPolygon, polygonArea, polygonBounds } from "../core/geom.js";
import type { FloorAssignment, InteriorRequest } from "../core/types.js";
import type { StairStyle } from "../core/types.js";
import { CORRIDOR, ELEVATOR, RISER_SHAFT, ROOM, SINGLE_LOADED_BELOW, TWO_STAIRS, WALKUP } from "./constants.js";
import { fullCoverageU } from "./frame.js";
import { isStreetAccess } from "./openings.js";
import { facadeDepth } from "./shell.js";
import { SHAFT_WIDTH, shaftDepthFor } from "./stair-plan.js";
import type { Frame, UvRect } from "./uv.js";
import { coversRect, makeFrame, snap, snapDown, snapUp, toUvPolygon, worldToUv } from "./uv.js";

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

const MARGIN = 0.5;
const SCAN_RANGE = 8; // how far vFace may move from its ideal to find a fitting band

/** Shared inputs behind planCore and coreFeasibility: same frame, same candidate bands. */
interface CoreEnvelope {
  frame: Frame;
  uvFloors: Point[][];
  vMin: number;
  vMax: number;
  vLen: number;
  area: number;
  aboveFloors: number;
  topElevation: number;
  twoStairs: boolean;
  stairDepth: number;
  crossDepthOk: boolean;
  /** shallowest floor plate across the frame, and the floor it belongs to */
  plateDepth: number;
  plateDepthFloor: number;
  idealVFace: number;
  candidates: number[];
}

/** Plate depth every floor needs across the frame: one room strip, the corridor, the shaft
 *  row. The core is identical on every floor, so the shallowest floor decides. */
const MIN_CROSS_DEPTH = ELEVATOR.shaft + CORRIDOR.width + ROOM.minStripDepth;

/** Plate depth the compact core needs on a rectangular plate: room strip and corridor in
 *  front of the corridor face, the stair columns behind it. */
function minCompactDepth(env: CoreEnvelope): number {
  return ROOM.minStripDepth + CORRIDOR.width + env.stairDepth;
}

/** The plates the core may stand on: every floor outline behind the facade lining. */
function platesOf(floors: InteriorRequest["blueprint"]["floors"], frame: Frame, depth: number): Point[][] {
  return floors.map((f) => insetPolygon(toUvPolygon(f.outline, frame), depth));
}

function envelopeOf(floors: InteriorRequest["blueprint"]["floors"], frame: Frame, depth: number, bulkheadV: number | null = null): CoreEnvelope {
  const uvFloors = platesOf(floors, frame, depth);
  const groundIndex = floors.findIndex((f) => f.index === 0);
  const bounds = polygonBounds(uvFloors[groundIndex]!);
  const vLen = bounds.d;
  const area = polygonArea(floors[groundIndex]!.outline);
  const aboveFloors = floors.filter((f) => f.index >= 0).length;
  const twoStairs = area > TWO_STAIRS.areaOver || aboveFloors > TWO_STAIRS.floorsOver;

  // the row the stair head wants: centred under the roof housing when the exterior published one
  const idealVFace = vLen < SINGLE_LOADED_BELOW
    ? snapDown(bounds.z + vLen - ELEVATOR.shaft)
    : bulkheadV !== null ? snap(bulkheadV - snapUp(SHAFT_WIDTH) / 2) : snap(bounds.z + (vLen + CORRIDOR.width) / 2);
  const vMin = snapUp(bounds.z + ROOM.minStripDepth + CORRIDOR.width);
  const vMax = snapDown(bounds.z + vLen - ELEVATOR.shaft);
  // ideal first, then outward in 0.5 steps (lower side first on ties), clamped
  const candidates: number[] = [];
  for (let offset = 0; offset <= SCAN_RANGE; offset += 0.5) {
    for (const v of offset === 0 ? [idealVFace] : [idealVFace - offset, idealVFace + offset]) {
      if (v >= vMin && v <= vMax && !candidates.includes(v)) candidates.push(v);
    }
  }

  let plateDepth = Infinity;
  let plateDepthFloor = 0;
  uvFloors.forEach((poly, i) => {
    const d = poly.length < 3 ? 0 : polygonBounds(poly).d;
    if (d < plateDepth) {
      plateDepth = d;
      plateDepthFloor = floors[i]!.index;
    }
  });

  return {
    frame, uvFloors, vMin, vMax, vLen, area, aboveFloors,
    topElevation: floors.at(-1)!.elevation,
    twoStairs, stairDepth: stairShaftDepth(floors),
    crossDepthOk: MIN_CROSS_DEPTH <= plateDepth,
    plateDepth, plateDepthFloor,
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
  const stairCols = (env.twoStairs ? 2 : 1) * snapUp(SHAFT_WIDTH);
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

/** u extent of the core block for a car count. planCore lays the block out here and the
 *  selector validates it, so the gate and the generator place the same rects. */
function blockSpan(env: CoreEnvelope, p: Placement, elevatorCount: number): { u0: number; len: number } {
  const colW = snapUp(SHAFT_WIDTH);
  const stairALen = p.mode === "compact" ? colW : env.stairDepth;
  const len = stairALen + elevatorCount * ELEVATOR.shaft + RISER_SHAFT.w + CORRIDOR.serviceStub
    + (p.mode === "compact" && env.twoStairs ? colW : 0);
  let u0 = snap(p.bandU0 + (p.bandLen - len) / 2);
  if (p.mode !== "compact" && env.twoStairs) u0 = Math.min(u0, snapDown(inlineStairU(env, p) - len));
  return { u0: Math.max(u0, snapUp(p.bandU0)), len };
}

/** Inline egress stair B (row cores): flush against the far end of the corridor band. */
function inlineStairU(env: CoreEnvelope, p: Placement): number {
  return snapDown(p.bandU1) - env.stairDepth;
}

function placeAt(mode: CoreMode, vFace: number, bandU0: number, bandU1: number, fixed: number): Placement {
  return {
    mode, vFace, bandU0, bandU1, bandLen: bandU1 - bandU0,
    maxElevators: mode === "walkup" ? 0 : Math.max(0, Math.floor((bandU1 - bandU0 - fixed) / ELEVATOR.shaft)),
  };
}

/** Compact stair columns reach past the shaft row into the rear strip: that depth has to be
 *  inside every floor over the whole block, whatever car count the building asks for. */
function compactColumnsFit(env: CoreEnvelope, candidate: Placement): boolean {
  const span = blockSpan(env, candidate, candidate.maxElevators);
  const columns: UvRect = { u: span.u0, v: candidate.vFace, lu: span.len, lv: env.stairDepth };
  return env.uvFloors.every((poly) => coversRect(poly, columns));
}

/** The compact placement at one corridor position, when its band and column depth hold. */
function compactAt(env: CoreEnvelope, vFace: number): Placement | null {
  const fixed = compactFixedLen(env);
  const [u0, u1] = bandAt(env, vFace);
  if (u1 - u0 < fixed + ELEVATOR.shaft) return null;
  const candidate = placeAt("compact", vFace, u0, u1, fixed);
  return compactColumnsFit(env, candidate) ? candidate : null;
}

/** The single mode-and-position selector shared by planCore and coreFeasibility. */
function selectPlacement(env: CoreEnvelope): Placement | null {
  const rowFixed = rowFixedLen(env);
  for (const vFace of env.candidates) {
    const [u0, u1] = bandAt(env, vFace);
    if (u1 - u0 >= rowFixed + ELEVATOR.shaft) return placeAt("standard", vFace, u0, u1, rowFixed);
  }
  for (const vFace of env.candidates) {
    const compact = compactAt(env, vFace);
    if (compact) return compact;
  }
  let best: [number, number, number] | null = null;
  for (const vFace of env.candidates) {
    const [u0, u1] = bandAt(env, vFace);
    if (!best || u1 - u0 > best[2] - best[1]) best = [vFace, u0, u1];
  }
  if (best && best[2] - best[1] >= rowFixed) return placeAt("walkup", best[0], best[1], best[2], rowFixed);
  return null;
}

const MODE_RANK: Record<CoreMode, number> = { standard: 0, compact: 1, walkup: 2 };
/** Rotated fallback: how far apart the tried frames are, over a half turn. */
const SWEEP_STEP_DEG = 5;

/** Frames to try: the principal one first, then a half turn in coarse steps. Parcels whose
 *  fitting core rectangle is skewed off the longest edge still find it. */
function frameAngles(base: number): number[] {
  const out = [base];
  for (let k = 1; k * SWEEP_STEP_DEG < 180; k++) {
    const a = (((base + k * SWEEP_STEP_DEG + 90) % 180) + 180) % 180 - 90;
    out.push(Math.round(a * 100) / 100);
  }
  return out;
}

interface CoreChoice {
  env: CoreEnvelope;
  placement: Placement | null;
}

function withinCap(env: CoreEnvelope, placement: Placement): boolean {
  return placement.mode !== "walkup" || env.aboveFloors <= WALKUP.maxFloors;
}

/** The one frame-and-placement decision behind both planCore and coreFeasibility. The
 *  principal frame wins whenever it holds a core, so nothing that already builds changes;
 *  only parcels it cannot serve pay for the rotated sweep. */
function selectEnvelope(blueprint: InteriorRequest["blueprint"]): CoreChoice {
  const floors = blueprint.floors;
  const depth = facadeDepth(blueprint.facade);
  const ground = floors.find((f) => f.index === 0)! as Ground;
  const base = principalAngle(ground.outline);
  // the roof housing's row in a frame, when the exterior published one
  const bulkhead = blueprint.roof?.bulkhead;
  const bulkV = (frame: Frame): number | null => (bulkhead ? worldToUv(bulkhead.center, frame)[1] : null);
  const firstFrame = frameAt(base, ground);
  const first = envelopeOf(floors, firstFrame, depth, bulkV(firstFrame));
  const firstPlacement = first.crossDepthOk ? selectPlacement(first) : null;
  if (firstPlacement && withinCap(first, firstPlacement)) return { env: first, placement: firstPlacement };

  let best: CoreChoice | null = null;
  let bestRank = Infinity;
  for (const angle of frameAngles(base).slice(1)) {
    const frame = frameAt(angle, ground);
    const env = envelopeOf(floors, frame, depth, bulkV(frame));
    if (!env.crossDepthOk) continue;
    const placement = selectPlacement(env);
    if (!placement || !withinCap(env, placement)) continue;
    const rank = MODE_RANK[placement.mode] * 1000 - Math.min(999, placement.bandLen);
    if (rank < bestRank) {
      bestRank = rank;
      best = { env, placement };
    }
    if (placement.mode === "standard") break;
  }
  return best ?? { env: first, placement: firstPlacement };
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

/** The nearest miss when a blueprint does not fit, in the order standard, compact, walkup:
 *  cross_depth: a floor plate is shallower than minCrossDepth, no mode can start.
 *  compact_depth: a band holds the compact core length but its stair columns find no depth
 *  behind the corridor face on every floor.
 *  walkup_floors: only a walkup band exists and the floor count is over walkupMaxFloors.
 *  band: no corridor position holds even the walkup core length. */
export type CoreBlocker = "cross_depth" | "band" | "compact_depth" | "walkup_floors";

export interface CoreFeasibility {
  /** whether THIS blueprint (its floor count included) generates */
  fits: boolean;
  /** standard: elevator core in the shaft row. compact: stair columns, elevators kept.
   *  walkup: stair-only, floors capped at walkupMaxFloors. none: not buildable. */
  mode: CoreMode | "none";
  /** present when fits is false */
  blocker?: CoreBlocker;
  frameAngleDeg: number;
  /** chosen corridor-face position and its band (after the vFace scan) */
  bandLength: number;
  /** row core: stair + one car + riser + stub (+ egress stair) + margin */
  minCoreLength: number;
  /** compact core: stair columns + one car + riser + stub + margin */
  minCompactCoreLength: number;
  /** row core without the car */
  minWalkupCoreLength: number;
  walkupMaxFloors: number;
  maxElevators: number;
  /** shallowest floor plate across the frame, and the floor it belongs to */
  plateDepth: number;
  plateDepthFloor: number;
  /** plate depth every mode needs on every floor: shaft row + corridor + one room strip */
  minCrossDepth: number;
  crossDepthOk: boolean;
  /** plate depth the compact core needs on a rectangular plate: room strip + corridor +
   *  stairShaftDepth for its columns; compactDepthOk is the exact per-floor column test */
  minCompactDepth: number;
  compactDepthOk: boolean;
}

function blockerOf(env: CoreEnvelope, placement: Placement | null): CoreBlocker | undefined {
  if (placement && withinCap(env, placement)) return undefined;
  if (!env.crossDepthOk) return "cross_depth";
  const band = bestBandLen(env);
  if (band >= compactFixedLen(env) + ELEVATOR.shaft) return "compact_depth";
  if (band >= rowFixedLen(env)) return "walkup_floors";
  return "band";
}

/** Whether some corridor position holds the compact core with its column depth (step 8). */
function compactDepthOk(env: CoreEnvelope): boolean {
  return env.crossDepthOk && env.candidates.some((vFace) => compactAt(env, vFace) !== null);
}

/** The gate's message for an unfit blueprint, quoting the recipe's own numbers. */
function unfitDetail(env: CoreEnvelope, blocker: CoreBlocker, placement: Placement | null): string {
  const m = (n: number) => `${n.toFixed(1)}m`;
  const band = m(placement ? placement.bandLen : bestBandLen(env));
  const mins = `standard minimum ${m(rowFixedLen(env) + ELEVATOR.shaft)}, compact minimum ${m(compactFixedLen(env) + ELEVATOR.shaft)}, walkup minimum ${m(rowFixedLen(env))}; see schemas/core-feasibility.json`;
  switch (blocker) {
    case "cross_depth":
      return `plate depth ${m(env.plateDepth)} on floor ${env.plateDepthFloor} is below the ${m(MIN_CROSS_DEPTH)} minimum for a room strip, the corridor and the shaft row in the layout frame`;
    case "compact_depth":
      return `band ${band} holds a compact core but its stair columns need ${m(env.stairDepth)} behind the corridor face on every floor (plate depth ${m(env.plateDepth)}, compact needs ${m(minCompactDepth(env))} on a rectangular plate; ${mins})`;
    case "walkup_floors":
      return `walkup core (band ${band}, ${mins}) allows at most ${WALKUP.maxFloors} floors, blueprint has ${env.aboveFloors}`;
    case "band":
      return `no corridor position holds a core: best band ${band} is below the walkup minimum ${m(rowFixedLen(env))} (${mins})`;
  }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Assembler pre-check mirroring planCore exactly: same frame, same vFace scan, same
 *  thresholds (see schemas/core-feasibility.json). */
export function coreFeasibility(blueprint: InteriorRequest["blueprint"]): CoreFeasibility {
  const { env, placement } = selectEnvelope(blueprint);
  const blocker = blockerOf(env, placement);
  return {
    fits: blocker === undefined,
    mode: placement?.mode ?? "none",
    ...(blocker ? { blocker } : {}),
    frameAngleDeg: env.frame.angleDeg,
    bandLength: round2(placement ? placement.bandLen : bestBandLen(env)),
    minCoreLength: round2(rowFixedLen(env) + ELEVATOR.shaft),
    minCompactCoreLength: round2(compactFixedLen(env) + ELEVATOR.shaft),
    minWalkupCoreLength: round2(rowFixedLen(env)),
    walkupMaxFloors: WALKUP.maxFloors,
    maxElevators: placement?.maxElevators ?? 0,
    plateDepth: round2(env.plateDepth),
    plateDepthFloor: env.plateDepthFloor,
    minCrossDepth: MIN_CROSS_DEPTH,
    crossDepthOk: env.crossDepthOk,
    minCompactDepth: round2(minCompactDepth(env)),
    compactDepthOk: compactDepthOk(env),
  };
}

/** Places the vertical core once per building; every floor reuses these rects. */
export function planCore(request: InteriorRequest, assignments: FloorAssignment[]): CorePlan {
  const { env, placement } = selectEnvelope(request.blueprint);
  const { frame, twoStairs, stairDepth } = env;

  const blocker = blockerOf(env, placement);
  if (!placement || blocker) {
    throw new InteriorError("E_FLOOR_TOO_SMALL", unfitDetail(env, blocker ?? "band", placement));
  }

  const { mode, vFace } = placement;
  const elevatorCount = mode === "walkup" ? 0
    : Math.min(elevatorsFor(request, env.area, env.aboveFloors, env.topElevation), Math.max(1, placement.maxElevators));

  const stairColW = snapUp(SHAFT_WIDTH);
  const span = blockSpan(env, placement, elevatorCount);
  // The stair head meets the roof housing the exterior published: the block slides along its
  // band so stair A is centred under it, as far as the band allows.
  const bulkhead = request.blueprint.roof?.bulkhead;
  const stairALen = mode === "compact" ? stairColW : env.stairDepth;
  const u0 = bulkhead
    ? Math.min(snapDown(placement.bandU1 - span.len), Math.max(snapUp(placement.bandU0), snap(worldToUv(bulkhead.center, env.frame)[0] - stairALen / 2)))
    : span.u0;

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
      stairB = { u: inlineStairU(env, placement), v: vFace - CORRIDOR.width, lu: stairDepth, lv: CORRIDOR.width };
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

type Ground = { outline: [number, number][]; openings: { kind: string; edge: number; offset: number; width: number }[] };

/** Direction of the longest ground edge, in (-90, 90]. */
function principalAngle(outline: [number, number][]): number {
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
  return Math.round(angle * 100) / 100;
}

/** Layout frame at one angle, flipped so the street entrance (when the ground floor has one)
 *  lies on the low-v side, where the hall and corridor face. */
function frameAt(angle: number, ground: Ground): Frame {
  const outline = ground.outline;
  let frame = makeFrame(angle);

  const access = ground.openings.find(isStreetAccess);
  if (access) {
    const p0 = outline[access.edge % outline.length]!;
    const p1 = outline[(access.edge + 1) % outline.length]!;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
    const t = (access.offset + access.width / 2) / len;
    const accessWorld: [number, number] = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
    const uvAccess = worldToUv(accessWorld, frame);
    const vs = outline.map((p) => worldToUv(p, frame)[1]);
    if (uvAccess[1] > (Math.min(...vs) + Math.max(...vs)) / 2) {
      const flipped = angle > 0 ? angle - 180 : angle + 180;
      frame = makeFrame(Math.round(flipped * 100) / 100);
    }
  }
  return frame;
}

/** Every climb the stair may have to take: one storey, or two where an assignment spans.
 *  Read off the blueprint alone, so the gate and the generator size the same shaft. */
function climbCandidates(floors: InteriorRequest["blueprint"]["floors"]): number[] {
  const heights = floors.map((f) => f.height);
  const out = [...heights];
  for (let i = 0; i + 1 < heights.length; i++) out.push(heights[i]! + heights[i + 1]!);
  return out;
}

/** Deep enough for the longest flight the building will ever need. A short storey uses
 *  fewer flights, so its flights are LONGER than a tall storey's: the shaft has to take the
 *  worst climb of this blueprint, not the tallest floor. */
function stairShaftDepth(floors: InteriorRequest["blueprint"]["floors"]): number {
  return shaftDepthFor(climbCandidates(floors));
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

/** Final invariant: every core rect sits inside every floor. The selector already proved it
 *  with the same predicate on the same band, so a throw here means a layout bug, not a
 *  parcel the gate approved. */
function ensureCoreFitsAllFloors(request: InteriorRequest, plan: CorePlan): void {
  const named: [string, UvRect][] = [
    ["stair-a", plan.stairA], ["riser", plan.riser], ["service stub", plan.stub],
    ...plan.elevators.map((e) => [e.id, e.rect] as [string, UvRect]),
    ...(plan.stairB ? [["stair-b", plan.stairB] as [string, UvRect]] : []),
  ];
  const plates = platesOf(request.blueprint.floors, plan.frame, facadeDepth(request.blueprint.facade));
  for (const [i, floor] of request.blueprint.floors.entries()) {
    for (const [id, rect] of named) {
      if (!coversRect(plates[i]!, rect)) {
        throw new InteriorError(
          "E_FLOOR_TOO_SMALL",
          `${plan.mode} core does not fit inside this floor outline: ${id} spans u ${rect.u.toFixed(1)}..${(rect.u + rect.lu).toFixed(1)}m, v ${rect.v.toFixed(1)}..${(rect.v + rect.lv).toFixed(1)}m in the layout frame (${plan.frame.angleDeg} deg)`,
          floor.index,
        );
      }
    }
  }
}
