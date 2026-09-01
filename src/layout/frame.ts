import type { Point, Rect } from "../core/geom.js";
import { clipPolygonToRect, polygonBounds } from "../core/geom.js";
import type { BlueprintFloor, FloorKind } from "../core/types.js";
import { CORRIDOR } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import type { FloorFrame } from "./plan-types.js";
import { snapDown, snapUp, toUvPolygon, toUvRect } from "./uv.js";

export const VENUE_KINDS: ReadonlySet<FloorKind> = new Set([
  "lobby", "restaurant", "coffee_shop", "gym", "terrace", "parking", "mechanical",
]);

/** Usable u range of a v band: bounds of the outline clipped to that band. */
export function usableU(uvOutline: readonly Point[], v0: number, v1: number): [number, number] {
  const clipped = clipPolygonToRect(uvOutline, { x: -1e6, z: v0, w: 2e6, d: v1 - v0 });
  if (clipped.length === 0) return [0, 0];
  const b = polygonBounds(clipped);
  return [snapUp(b.x), snapDown(b.x + b.w)];
}

/** Structural bands of one floor around the building-wide core. */
export function buildFrame(core: CorePlan, floor: BlueprintFloor): FloorFrame {
  const uvOutline = toUvPolygon(floor.outline, core.axis);
  const b = polygonBounds(uvOutline as Point[]);
  const v0 = snapUp(b.z);
  const v1 = snapDown(b.z + b.d);
  const w = CORRIDOR.width;
  const vFace = core.vFace;

  const [cu0, cu1] = usableU(uvOutline, vFace - w, vFace);
  const stairB = core.stairB ? toUvRect(core.stairB, core.axis) : undefined;
  const corridorEnd = stairB ? Math.min(cu1, stairB.u) : cu1;
  const corridor = { u: cu0, v: vFace - w, lu: corridorEnd - cu0, lv: w };

  const [su0, su1] = usableU(uvOutline, v0, vFace - w);
  const south: Rect | null = vFace - w - v0 >= 1.6 ? { x: su0, z: v0, w: su1 - su0, d: vFace - w - v0 } : null;

  const [nu0, nu1] = usableU(uvOutline, vFace, v1);
  const northSegments = [];
  if (core.u0 - nu0 >= 2) northSegments.push({ u: nu0, v: vFace, lu: core.u0 - nu0, lv: v1 - vFace });
  if (nu1 - core.u1 >= 2) northSegments.push({ u: core.u1, v: vFace, lu: nu1 - core.u1, lv: v1 - vFace });

  return {
    corridorU: [cu0, cu1],
    corridor,
    stairB,
    south: south ? { u: south.x, v: south.z, lu: south.w, lv: south.d } : { u: 0, v: 0, lu: 0, lv: 0 },
    northSegments,
    coreBlock: { u: core.u0, v: vFace, lu: core.u1 - core.u0, lv: v1 - vFace },
  };
}
