import { CORRIDOR, ELEVATOR, RISER_SHAFT } from "./constants.js";
import type { CoreMode } from "./core-plan.js";
import { SHAFT_WIDTH } from "./stair-plan.js";
import { snapUp, type UvRect } from "./uv.js";

export interface CoreComponents {
  stairA: UvRect;
  stairB?: UvRect;
  elevators: { id: string; rect: UvRect }[];
  riser: UvRect;
  stub: UvRect;
  u1: number;
}

/** One component recipe for feasibility, final placement and occupied-solid checks. */
export function coreComponents(
  mode: CoreMode, u0: number, vFace: number, stairDepth: number, twoStairs: boolean, elevatorCount: number,
): CoreComponents {
  const col = snapUp(SHAFT_WIDTH);
  const stairA: UvRect = { u: u0, v: vFace, lu: mode === "compact" ? col : stairDepth, lv: mode === "compact" ? stairDepth : col };
  let u = u0 + stairA.lu;
  const elevators: CoreComponents["elevators"] = [];
  for (let i = 0; i < elevatorCount; i++) {
    elevators.push({ id: `elev-${i}`, rect: { u, v: vFace, lu: ELEVATOR.shaft, lv: ELEVATOR.shaft } });
    u += ELEVATOR.shaft;
  }
  const riser: UvRect = { u, v: vFace, lu: RISER_SHAFT.w, lv: RISER_SHAFT.d };
  u += RISER_SHAFT.w;
  const stub: UvRect = { u, v: vFace, lu: CORRIDOR.serviceStub, lv: ELEVATOR.shaft };
  u += CORRIDOR.serviceStub;
  let stairB: UvRect | undefined;
  if (twoStairs && mode === "compact") {
    stairB = { u, v: vFace, lu: col, lv: stairDepth };
    u += col;
  }
  return { stairA, stairB, elevators, riser, stub, u1: u };
}

export function coreSolids(parts: CoreComponents): [string, UvRect][] {
  return [
    ["stair-a", parts.stairA], ...parts.elevators.map((e): [string, UvRect] => [e.id, e.rect]),
    ["riser", parts.riser], ...(parts.stairB ? [["stair-b", parts.stairB] as [string, UvRect]] : []),
  ];
}
