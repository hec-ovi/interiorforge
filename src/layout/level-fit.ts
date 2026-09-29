import { clipPolygonToRect, isCcw, polygonArea, polygonBounds, type Point } from "../core/geom.js";
import type { LevelZone } from "../core/types.js";
import { coverRectangles } from "../placements/surfaces.js";
import type { BuildingPlan } from "./index.js";
import type { PlanRoom } from "./plan-types.js";
import { toWorldPolygon, uvToWorld, uvRectCorners, type Frame } from "./uv.js";

/** A zone left narrower than this, or with less than this share of its planned floor, is no
 *  level any more and is dropped. */
const MIN_SIDE = 1;
const MIN_SHARE = .5;

/**
 * A template lays a room's level zones (a lounge pit, a raised bar) on the room it fitted,
 * and later passes can pull that room's walls back, off the core for instance. A zone then
 * runs out through the room's own wall, into the shafts beyond it, with the wall's foot left
 * open over the pit. Once the building is planned, each zone is cut back to the largest
 * rectangle its room still holds, so its curb lines the wall it now meets; a zone that
 * loses most of itself is dropped.
 */
export function fitLevelZones(plan: BuildingPlan): void {
  const frame = plan.core.frame;
  for (const floor of plan.floors) {
    const uv = plan.uvFloors.get(floor.floor);
    if (!uv) continue;
    for (const room of uv.rooms) {
      if (!room.levels?.length || !room.polygon) continue;
      const kept = room.levels.flatMap(zone => fitted(zone, room));
      if (kept.length === room.levels.length && kept.every((zone, i) => zone === room.levels![i])) continue;
      room.levels = kept;
      const published = floor.rooms.find(item => item.id === room.id);
      if (!published) continue;
      if (kept.length) published.levels = kept.map(zone => toWorld(zone, frame));
      else delete published.levels;
    }
  }
}

function fitted(zone: NonNullable<PlanRoom["levels"]>[number], room: PlanRoom): NonNullable<PlanRoom["levels"]> {
  const b = polygonBounds(zone.polygon), area = b.w * b.d;
  const clipped = clipPolygonToRect(room.polygon!, b);
  if (clipped.length >= 3 && Math.abs(polygonArea(clipped)) > area - 1e-6) return [zone];
  const best = clipped.length >= 3 ? coverRectangles(clipped, (room.holes ?? []).map(hole => clipPolygonToRect(hole, b))
    .filter(hole => hole.length >= 3))[0] : undefined;
  if (!best || best.lu < MIN_SIDE || best.lv < MIN_SIDE || best.lu * best.lv < MIN_SHARE * area) return [];
  return [{ ...zone, polygon: uvRectCorners(best) }];
}

function toWorld(zone: NonNullable<PlanRoom["levels"]>[number], frame: Frame): LevelZone {
  let ring = toWorldPolygon(zone.polygon, frame).map(round);
  if (!isCcw(ring)) ring = ring.reverse();
  return { polygon: ring, delta: zone.delta, edge: zone.edge,
    ...(zone.stair ? { stair: { at: round(uvToWorld(zone.stair.at, frame)), axis: zone.stair.axis, width: zone.stair.width } } : {}) };
}

function round([x, z]: Point): Point {
  return [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000];
}
