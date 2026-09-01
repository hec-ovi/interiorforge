import { InteriorError } from "../core/errors.js";
import { clipPolygonToRect, polygonArea, polygonBounds } from "../core/geom.js";
import type { FloorAssignment, InteriorRequest } from "../core/types.js";
import type { StairStyle } from "../core/types.js";
import { CORRIDOR, ELEVATOR, RISER_SHAFT, ROOM, STAIR, TWO_STAIRS } from "./constants.js";
import { fullCoverageU } from "./frame.js";
import type { Frame, UvRect } from "./uv.js";
import { makeFrame, snap, snapDown, snapUp, toUvPolygon, worldToUv } from "./uv.js";

export interface StairFlights {
  flightsPerFloor: number;
  risersPerFlight: number;
}

/** Building-wide vertical core, all in uv (frame) space; identical on every floor. */
export interface CorePlan {
  frame: Frame;
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

/** Places the vertical core once per building; every floor reuses these rects. */
export function planCore(request: InteriorRequest, assignments: FloorAssignment[]): CorePlan {
  const floors = request.blueprint.floors;
  const ground = floors.find((f) => f.index === 0)!;
  const frame = principalFrame(ground);
  const uvOutline = toUvPolygon(ground.outline, frame);
  const bounds = polygonBounds(uvOutline);
  const uLen = bounds.w;
  const vLen = bounds.d;
  const u0b = bounds.x;
  const v0b = bounds.z;

  const area = polygonArea(ground.outline);
  const aboveFloors = floors.filter((f) => f.index >= 0).length;
  const top = floors.at(-1)!;

  const twoStairs = area > TWO_STAIRS.areaOver || aboveFloors > TWO_STAIRS.floorsOver;

  const hMax = Math.max(...floors.map((f) => f.height));
  const stairDepth = stairShaftDepth(hMax);

  // demand-driven car count, capped by what the plate fits alongside the stairs
  const fixedLen = stairDepth + RISER_SHAFT.w + CORRIDOR.serviceStub + (twoStairs ? stairDepth : 0) + 1;
  const carsThatFit = Math.floor((uLen - fixedLen) / ELEVATOR.shaft);
  const elevatorCount = Math.min(elevatorsFor(request, area, aboveFloors, top.elevation), Math.max(1, carsThatFit));

  const coreLen = stairDepth + elevatorCount * ELEVATOR.shaft + RISER_SHAFT.w;
  const blockLen = coreLen + CORRIDOR.serviceStub;
  const corridorW = CORRIDOR.width;
  if (blockLen > uLen - 1 || ELEVATOR.shaft + corridorW + ROOM.minStripDepth > vLen) {
    throw new InteriorError("E_FLOOR_TOO_SMALL", `plate ${uLen.toFixed(1)}x${vLen.toFixed(1)} cannot fit core ${blockLen.toFixed(1)}m + corridor + rooms`);
  }

  // corridor band centered so both strips get equal depth
  const vFace = snap(v0b + (vLen + corridorW) / 2);
  const depth = ELEVATOR.shaft;

  // the core must sit in the u-range that is actually inside EVERY floor outline at its
  // band (irregular parcels cut diagonals into the plate)
  let bandU0 = -Infinity;
  let bandU1 = Infinity;
  for (const floor of floors) {
    const uvFloor = toUvPolygon(floor.outline, frame);
    const [a, b] = fullCoverageU(uvFloor, vFace - corridorW, vFace + depth);
    bandU0 = Math.max(bandU0, a);
    bandU1 = Math.min(bandU1, b);
  }
  const bandLen = bandU1 - bandU0;
  if (blockLen + (twoStairs ? stairDepth : 0) > bandLen - 0.5) {
    throw new InteriorError("E_FLOOR_TOO_SMALL", `core band ${bandLen.toFixed(1)}m cannot fit core ${blockLen.toFixed(1)}m plus egress stair`);
  }
  // centered in the band, but the whole block (stub included) stays clear of stair B
  let u0 = snap(bandU0 + (bandLen - blockLen) / 2);
  const stairBu = snapDown(bandU1) - stairDepth;
  if (twoStairs) u0 = Math.min(u0, snapDown(stairBu - blockLen));
  u0 = Math.max(u0, snapUp(bandU0));

  let u = u0;
  const stairA: UvRect = { u, v: vFace, lu: stairDepth, lv: snapUp(STAIR_WIDTH) };
  u += stairDepth;
  const elevators: CorePlan["elevators"] = [];
  for (let i = 0; i < elevatorCount; i++) {
    elevators.push({ id: `elev-${i}`, rect: { u, v: vFace, lu: ELEVATOR.shaft, lv: ELEVATOR.shaft } });
    u += ELEVATOR.shaft;
  }
  const riser: UvRect = { u, v: vFace, lu: RISER_SHAFT.w, lv: RISER_SHAFT.d };
  u += RISER_SHAFT.w;
  const stub: UvRect = { u, v: vFace, lu: CORRIDOR.serviceStub, lv: depth };
  u += CORRIDOR.serviceStub;

  let stairB: UvRect | undefined;
  if (twoStairs) {
    // inline at the far end of the corridor band, egress separation from stair A
    stairB = { u: stairBu, v: vFace - corridorW, lu: stairDepth, lv: corridorW };
  }

  const plan: CorePlan = {
    frame, vFace, u0, u1: u, depth,
    stairStyle: "u_return", stairDepth, elevatorCount,
    stairA, stairB, elevators, riser, stub,
  };
  ensureCoreFitsAllFloors(request, plan);
  return plan;
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
