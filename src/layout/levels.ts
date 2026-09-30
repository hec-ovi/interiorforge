import type { Point } from "../core/geom.js";
import { polygonBounds } from "../core/geom.js";
import { DOOR } from "./constants.js";
import { doorUvPoint } from "./plan-floor.js";
import type { PlanRoom } from "./plan-types.js";
import type { UvRect } from "./uv.js";

/** Level zones on the plan side (uv): a raised zone inside a room is a place NPCs do not
 *  walk in v1 and routes go around, its furniture stands at the zone's height, and it
 *  never takes a door's approach. The placement side builds it (`styles/systems/levels.ts`). */

/** Zones at least this high are closed to the nav grid (a step, not a finish change). */
export const NAV_LEVEL_MIN = 0.05;
/** One riser the body walks up without a flight (`RISE_MAX` of the level system). */
export const WALK_RISE = 0.18;

type Zone = NonNullable<PlanRoom["levels"]>[number];

/** A platform one stepped riser high (the C7 kitchen's tiled lip, the B3 bar): people walk
 *  onto it, so it stays open to routes and may meet a door's approach, its edge there being
 *  the threshold's nosing. Deeper zones, pits and guarded edges never do. */
export function walkableZone(zone: Pick<Zone, "delta" | "edge">): boolean {
  return zone.edge === "step" && zone.delta > 0 && zone.delta <= WALK_RISE + 1e-9;
}

export function zoneUvRect(zone: Pick<Zone, "polygon">): UvRect {
  const b = polygonBounds(zone.polygon);
  return { u: b.x, v: b.z, lu: b.w, lv: b.d };
}

/** Rectangles of the room's raised and sunken zones that close nav cells (a walkable
 *  platform does not). */
export function raisedZoneRects(room: Pick<PlanRoom, "levels">): UvRect[] {
  return (room.levels ?? []).filter(zone => Math.abs(zone.delta) >= NAV_LEVEL_MIN && !walkableZone(zone)).map(zoneUvRect);
}

const overlaps = (a: UvRect, b: UvRect) =>
  a.u < b.u + b.lu - 1e-6 && b.u < a.u + a.lu - 1e-6 && a.v < b.v + b.lv - 1e-6 && b.v < a.v + a.lv - 1e-6;

/** The approach a door keeps clear on both sides: its width by `DOOR.clearance` each way. */
export function doorApproach(door: PlanRoom["doors"][number], room: PlanRoom): UvRect {
  const [u, v] = doorUvPoint(door, room);
  const depth = DOOR.clearance;
  return door.edge.startsWith("v")
    ? { u: u - door.width / 2, v: v - depth, lu: door.width, lv: 2 * depth }
    : { u: u - depth, v: v - door.width / 2, lu: 2 * depth, lv: door.width };
}

/** The room's zones that keep every approach clear (its own doors and `keep`, e.g. stair
 *  and lift entries); a zone over an approach is left out, so the floor stays flat there,
 *  unless it is a walkable platform. */
export function admissibleLevels(room: PlanRoom, keep: readonly UvRect[] = []): Zone[] {
  const approaches = [...room.doors.map(door => doorApproach(door, room)), ...keep];
  return (room.levels ?? []).filter(zone => walkableZone(zone) || !approaches.some(rect => overlaps(zoneUvRect(zone), rect)));
}

/** The furniture height at a uv point of the room: the highest raised zone under it. */
export function levelAt(room: Pick<PlanRoom, "levels">, [u, v]: Point): number {
  let at = 0;
  for (const zone of room.levels ?? []) {
    const r = zoneUvRect(zone);
    if (u > r.u + 1e-6 && u < r.u + r.lu - 1e-6 && v > r.v + 1e-6 && v < r.v + r.lv - 1e-6) at = Math.max(at, zone.delta);
  }
  return at;
}
