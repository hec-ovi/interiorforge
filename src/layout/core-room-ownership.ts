import { InteriorError } from "../core/errors.js";
import { clipPolygonToRect, polygonArea, type Point } from "../core/geom.js";
import type { CorePlan } from "./core-plan.js";
import { coreRectsOf } from "./pier-align.js";
import type { PlanRoom } from "./plan-types.js";
import { RoomRegion } from "./room-region.js";
import { roomPolygon } from "./room-shape.js";
import type { UvRect } from "./uv.js";

/** Actual core footprints own the complete shaft width, including its reserved rails. */
export function fitRoomCoreOwnership(
  rooms: PlanRoom[], sealedGroups: UvRect[][], core: CorePlan, plate: readonly Point[], floor: number,
): void {
  const solids = coreRectsOf(core);
  for (const room of rooms) {
    const polygon = roomPolygon(room, plate);
    const cuts = solids.filter(rect => overlapArea(polygon, rect)
      - (room.holes ?? []).reduce((sum, hole) => sum + overlapArea(hole, rect), 0) > 1e-8);
    if (!cuts.length) continue;
    const shapes = new RoomRegion(polygon, room.holes).subtract(cuts);
    if (shapes.length !== 1) throw new InteriorError("E_FLOOR_TOO_SMALL",
      `core footprint separates ${room.id} into ${shapes.length} room regions`, floor);
    Object.assign(room, shapes[0]);
  }
  for (const sealed of sealedGroups) {
    const fitted = sealed.flatMap(rect => solids.reduce((parts, cut) => parts.flatMap(part => subtract(part, cut)), [rect]));
    sealed.splice(0, sealed.length, ...fitted);
  }
}

function overlapArea(polygon: readonly Point[], rect: UvRect): number {
  return Math.abs(polygonArea(clipPolygonToRect(polygon, { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv })));
}

/** Rectangular sealed ownership retains every residual strip without adding a room. */
function subtract(rect: UvRect, cut: UvRect): UvRect[] {
  const u0 = Math.max(rect.u, cut.u), u1 = Math.min(rect.u + rect.lu, cut.u + cut.lu);
  const v0 = Math.max(rect.v, cut.v), v1 = Math.min(rect.v + rect.lv, cut.v + cut.lv);
  if (u1 - u0 <= 1e-8 || v1 - v0 <= 1e-8) return [rect];
  return [
    { u: rect.u, v: rect.v, lu: u0 - rect.u, lv: rect.lv },
    { u: u1, v: rect.v, lu: rect.u + rect.lu - u1, lv: rect.lv },
    { u: u0, v: rect.v, lu: u1 - u0, lv: v0 - rect.v },
    { u: u0, v: v1, lu: u1 - u0, lv: rect.v + rect.lv - v1 },
  ].filter(part => part.lu > 1e-8 && part.lv > 1e-8);
}
