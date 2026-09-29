import { boundaryDistance, clipPolygonToRect, polygonArea } from '../core/geom.js';
import type { BlueprintFloor, InteriorRequest } from '../core/types.js';
import type { BuildingPlan } from '../layout/index.js';
import { zoneUvRect } from '../layout/levels.js';
import type { PlanRoom } from '../layout/plan-types.js';
import { roomPolygon } from '../layout/room-shape.js';
import type { UvRect } from '../layout/uv.js';
import type { Point } from '../core/geom.js';
import { constructionPlate, shellWallDepth } from '../layout/shell.js';
import { PIT_MAX, TRAY_HANG } from '../styles/systems/levels.js';
import { templateTrace } from '../layout/templates/fit.js';

/** Air a pit's tray keeps above the finished ceiling of the room under it. */
const CLEAR = .015;
/** Lowest clear height a room keeps when it lowers its ceiling under a pit above. */
const MIN_CLEAR = 2.6;
/** Lowest clear height under a bulkhead. */
const BULKHEAD_CLEAR = 2.3;
/** Distance a bulkhead keeps from the facade, whose glass rises to the ceiling. */
const FACADE_KEEP = .6;
/** Shallowest pit worth building; a zone the storey cannot hold deeper stays a finish. */
const PIT_MIN = .1;

/** Where a floor's layout was planned: the index of the sampled floor it shares. */
export type LayoutSource = (floor: number) => number | undefined;

/** A pit hangs its tray into the depth between its storey and the ceiling of the room
 *  under it, on every floor that shares its layout. Where that depth is short, the room
 *  under the pit lowers its finished ceiling (the plenum a reference storey has under a
 *  sunken lounge); a room held at its window heads hangs a bulkhead under the pit instead,
 *  where the pit stands clear of the facade; failing both, the pit itself is made as
 *  shallow as the storey holds, with the pieces standing in it. Runs once per building, after every sampled floor is planned
 *  and before any is placed. Returns the zones it made shallower, for diagnostics. */
export function seatPits(plan: BuildingPlan, request: InteriorRequest, floors: readonly BlueprintFloor[],
  sourceOf: LayoutSource): { floor: number; room: string; from: number; to: number }[] {
  const shallower: { floor: number; room: string; from: number; to: number }[] = [];
  const byIndex = new Map(floors.map(floor => [floor.index, floor]));
  const ordered = [...floors].sort((a, b) => a.index - b.index);
  const depth = shellWallDepth(request.blueprint.facade);
  // The highest window head of every floor sharing a layout: a facade room's ceiling never
  // drops below it (the placement's own rule).
  const heads = new Map<number, number>();
  for (const floor of floors) {
    const source = sourceOf(floor.index);
    if (source === undefined) continue;
    heads.set(source, Math.max(heads.get(source) ?? 0, ...floor.openings.map(o => o.sill + o.height)));
  }
  const plates = new Map<number, ReturnType<typeof constructionPlate>>();
  const plateOf = (source: number) => {
    let plate = plates.get(source);
    if (!plate) plates.set(source, plate = constructionPlate(byIndex.get(source)!, plan.core.frame, depth));
    return plate;
  };
  for (const [position, floor] of ordered.entries()) {
    if (position === 0) continue;
    const source = sourceOf(floor.index), below = ordered[position - 1]!, under = sourceOf(below.index);
    if (source === undefined || under === undefined) continue;
    const rooms = plan.uvFloors.get(source)?.rooms ?? [], lower = plan.uvFloors.get(under)?.rooms ?? [];
    const lowerFloor = plan.floors.find(item => item.floor === under);
    if (!lowerFloor) continue;
    const ceilingY = lowerFloor.ceilingElevation - lowerFloor.elevation;
    const head = heads.get(under) ?? 0;
    for (const room of rooms) for (const zone of room.levels ?? []) {
      if (zone.delta >= 0) continue;
      const pit = zoneUvRect(zone), needed = -zone.delta * TRAY_HANG + CLEAR;
      let hold = Infinity;
      for (const other of lower) {
        if (Math.abs(polygonArea(clipPolygonToRect(roomPolygon(other, plateOf(under)), { x: pit.u, z: pit.v, w: pit.lu, d: pit.lv }))) < .01) continue;
        const facade = roomPolygon(other, plateOf(under)).some(point => boundaryDistance(point, plateOf(under)) < .3);
        const drop = other.ceilingDrop ?? 0;
        const effective = Math.max(0, facade ? Math.min(drop, ceilingY - head) : drop);
        const gap = below.height - ceilingY + effective;
        if (gap >= needed - 1e-6) continue;
        const wanted = effective + needed - gap;
        const limit = Math.min(facade ? ceilingY - head : Infinity, Math.max(effective, ceilingY - MIN_CLEAR));
        if (wanted <= limit + 1e-6) { setDrop(plan, under, other, Math.ceil(wanted * 100) / 100); continue; }
        // A room at the window heads keeps its ceiling and hangs a bulkhead under the pit
        // instead, where the pit stands clear of the facade.
        const box = clipRect(pit, other.rect), extra = Math.ceil((needed - gap) * 100) / 100;
        if (box && !touchesFacade(box, plateOf(under)) && ceilingY - effective - extra >= BULKHEAD_CLEAR - 1e-6) {
          const same = (other.bulkheads ??= []).find(item => Math.abs(item.rect.u - box.u) + Math.abs(item.rect.v - box.v)
            + Math.abs(item.rect.lu - box.lu) + Math.abs(item.rect.lv - box.lv) < 1e-6);
          if (same) same.drop = Math.max(same.drop, extra); else other.bulkheads.push({ rect: box, drop: extra });
          continue;
        }
        templateTrace(`pit ${room.id} over ${other.id}: needs ${(needed - gap).toFixed(2)} m more, ${box ? touchesFacade(box, plateOf(under)) ? 'bulkhead at the facade' : 'bulkhead too low' : 'no bulkhead'}`);
        hold = Math.min(hold, below.height - ceilingY + Math.max(effective, Math.min(limit, wanted)));
      }
      if (!Number.isFinite(hold)) continue;
      const deepest = Math.floor(Math.max(0, hold - CLEAR) / TRAY_HANG * 100) / 100;
      const to = -Math.max(PIT_MIN, Math.min(-zone.delta, deepest, PIT_MAX));
      if (to <= zone.delta + 1e-6) continue;
      shallower.push({ floor: floor.index, room: room.id, from: zone.delta, to });
      lift(plan, source, room, zone, to);
    }
  }
  return shallower;
}

function setDrop(plan: BuildingPlan, source: number, room: PlanRoom, drop: number): void {
  room.ceilingDrop = drop;
  const published = plan.floors.find(item => item.floor === source)?.rooms.find(item => item.id === room.id);
  if (published) published.ceilingDrop = drop;
}

/** Makes one pit shallower, with the furniture standing in it (plan and published) and
 *  the lights those pieces carry. */
function lift(plan: BuildingPlan, source: number, room: PlanRoom, zone: NonNullable<PlanRoom['levels']>[number], to: number): void {
  const from = zone.delta, rect = zoneUvRect(zone), shift = to - from;
  const index = room.levels!.indexOf(zone);
  zone.delta = to;
  const uv = plan.uvFloors.get(source)!, floor = plan.floors.find(item => item.floor === source)!;
  const published = floor.rooms.find(item => item.id === room.id)?.levels?.[index];
  if (published) published.delta = to;
  const moved = new Set<string>();
  for (const piece of uv.furniture) {
    if (piece.room !== room.id || piece.elevation === undefined || Math.abs(piece.elevation - from) > 1e-6) continue;
    const [u, v] = piece.at;
    if (u <= rect.u || u >= rect.u + rect.lu || v <= rect.v || v >= rect.v + rect.lv) continue;
    piece.elevation = to;
    moved.add(piece.id);
  }
  for (const piece of floor.furniture) if (moved.has(piece.id)) piece.elevation = to;
  for (const light of floor.lights) if (light.furniture && moved.has(light.furniture)) light.position[1] += shift;
}

function clipRect(a: UvRect, b: UvRect): UvRect | null {
  const u0 = Math.max(a.u, b.u), u1 = Math.min(a.u + a.lu, b.u + b.lu), v0 = Math.max(a.v, b.v), v1 = Math.min(a.v + a.lv, b.v + b.lv);
  return u1 - u0 > .05 && v1 - v0 > .05 ? { u: u0, v: v0, lu: u1 - u0, lv: v1 - v0 } : null;
}

function touchesFacade(rect: UvRect, plate: Point[]): boolean {
  const corners: Point[] = [[rect.u, rect.v], [rect.u + rect.lu, rect.v], [rect.u + rect.lu, rect.v + rect.lv], [rect.u, rect.v + rect.lv]];
  const edges: [Point, Point][] = corners.map((corner, i) => [corner, corners[(i + 1) % 4]!]);
  return edges.some(([a, b]) => [0, .25, .5, .75, 1].some(t => boundaryDistance([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], plate) < FACADE_KEEP));
}
