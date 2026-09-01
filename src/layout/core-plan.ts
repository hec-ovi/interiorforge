import { InteriorError } from "../core/errors.js";
import type { Rect } from "../core/geom.js";
import { clipPolygonToRect, polygonArea, polygonBounds } from "../core/geom.js";
import type { FloorAssignment, InteriorRequest, StairStyle } from "../core/types.js";
import { CORRIDOR, ELEVATOR, RISER_SHAFT, ROOM, STAIR, TWO_STAIRS } from "./constants.js";
import type { Axis, UvRect } from "./uv.js";
import { snap, snapDown, snapUp, toUvPolygon, toUvRect, toWorldRect } from "./uv.js";

export interface StairFlights {
  /** risers per floor climb, exact riser height = floorHeight / risers */
  flightsPerFloor: number;
  risersPerFlight: number;
}

export interface CorePlan {
  axis: Axis;
  /** v of the core block's corridor-side face; corridors hang below it, the core above */
  vFace: number;
  /** u range of the whole core block including the service stub */
  u0: number;
  u1: number;
  /** north depth of shaft row */
  depth: number;
  stairStyle: StairStyle;
  stairDepth: number;
  elevatorCount: number;
  /** world rects, identical on every floor */
  stairA: Rect;
  stairB?: Rect;
  elevators: { id: string; rect: Rect }[];
  riser: Rect;
  /** service stub corridor from vFace into the north strip, beside the riser */
  stub: UvRect;
}

const STAIR_WIDTH = 2 * STAIR.flightWidth + STAIR.flightGap; // two flights side by side

/** Places the vertical core once per building; every floor reuses these rects. */
export function planCore(request: InteriorRequest, assignments: FloorAssignment[]): CorePlan {
  const floors = request.blueprint.floors;
  const ground = floors.find((f) => f.index === 0)!;
  const bounds = polygonBounds(ground.outline);
  const axis: Axis = bounds.w >= bounds.d ? "x" : "z";
  const uLen = axis === "x" ? bounds.w : bounds.d;
  const vLen = axis === "x" ? bounds.d : bounds.w;
  const u0b = axis === "x" ? bounds.x : bounds.z;
  const v0b = axis === "x" ? bounds.z : bounds.x;

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
    throw new InteriorError("E_FLOOR_TOO_SMALL", `plate ${uLen}x${vLen} cannot fit core ${blockLen.toFixed(1)}m + corridor + rooms`);
  }

  // corridor band centered so both strips get equal depth
  const vFace = snap(v0b + (vLen + corridorW) / 2);
  const depth = ELEVATOR.shaft;
  // centered, but the whole block (stub included) stays clear of the inline stair B column
  let u0 = snap(u0b + (uLen - blockLen) / 2);
  if (twoStairs) {
    const stairBu = snapDown(u0b + uLen) - stairDepth;
    u0 = Math.min(u0, snapDown(stairBu - blockLen));
  }
  if (u0 < u0b + 0.5) {
    throw new InteriorError("E_FLOOR_TOO_SMALL", "core block and egress stair do not fit along the corridor");
  }

  let u = u0;
  const stairA = toWorldRect({ u, v: vFace, lu: stairDepth, lv: snapUp(STAIR_WIDTH) }, axis);
  u += stairDepth;
  const elevators: CorePlan["elevators"] = [];
  for (let i = 0; i < elevatorCount; i++) {
    elevators.push({ id: `elev-${i}`, rect: toWorldRect({ u, v: vFace, lu: ELEVATOR.shaft, lv: ELEVATOR.shaft }, axis) });
    u += ELEVATOR.shaft;
  }
  const riser = toWorldRect({ u, v: vFace, lu: RISER_SHAFT.w, lv: RISER_SHAFT.d }, axis);
  u += RISER_SHAFT.w;
  const stub: UvRect = { u, v: vFace, lu: CORRIDOR.serviceStub, lv: depth };
  u += CORRIDOR.serviceStub;

  let stairB: Rect | undefined;
  if (twoStairs) {
    // inline at the far end of the corridor band, egress separation from stair A
    const uB = snapDown(u0b + uLen) - stairDepth;
    stairB = toWorldRect({ u: uB, v: vFace - corridorW, lu: stairDepth, lv: corridorW }, axis);
  }

  const plan: CorePlan = {
    axis, vFace, u0, u1: u, depth,
    stairStyle: "u_return", stairDepth, elevatorCount,
    stairA, stairB, elevators, riser, stub,
  };
  ensureCoreFitsAllFloors(request, plan);
  return plan;
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
  const rects: Rect[] = [plan.stairA, plan.riser, toWorldRect(plan.stub, plan.axis), ...plan.elevators.map((e) => e.rect)];
  if (plan.stairB) rects.push(plan.stairB);
  for (const floor of request.blueprint.floors) {
    const uvOutline = toUvPolygon(floor.outline, plan.axis);
    for (const rect of rects) {
      const uv = toUvRect(rect, plan.axis);
      const clipped = clipPolygonToRect(uvOutline, { x: uv.u, z: uv.v, w: uv.lu, d: uv.lv });
      const full = uv.lu * uv.lv;
      if (Math.abs(polygonArea(clipped)) < full - 1e-6) {
        throw new InteriorError("E_FLOOR_TOO_SMALL", "vertical core does not fit inside this floor outline", floor.index);
      }
    }
  }
}
