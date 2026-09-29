import { isCcw, polygonBounds, type Point } from "../core/geom.js";
import { roomFootprintContains } from "../core/room-footprint.js";
import type { BlueprintFloor, FloorInterior, InteriorRequest } from "../core/types.js";
import { shellOwnsFacade } from "../architecture/recipes.js";
import type { BuildingPlan } from "./index.js";
import type { OpenAir } from "./plan-floor.js";
import type { PlanRoom } from "./plan-types.js";
import { doorUvPoint } from "./plan-floor.js";
import { RoomRegion } from "./room-region.js";
import { roomPolygon } from "./room-shape.js";
import { constructionPlate, facadeDepth, SHELL_SEAM, shellFace, shellWallDepth } from "./shell.js";
import { toWorldPolygon, uvToWorld, worldToUv, type Frame, type UvRect } from "./uv.js";

/** Far enough past any floor for a strip that runs out through the facade. */
const FAR = 1e4;

/**
 * Exterior fits each floor's rooms into the largest rectangle on its building grid that
 * clears the shell and every facade notch, so the plate the rooms are planned on can stand
 * a metre or more behind the shell's inner face. Left alone, that band is a slot between
 * every room and the facade: partitions, floors and ceilings stop short of the shell, and
 * the band joins the corridor and every home on the floor behind closed doors.
 *
 * Once every floor is planned (and paired lofts installed), each room, sealed void, core
 * shaft and loft void that stands on the edge of that rectangle reaches out to the face:
 * the shell's own inner face where the shell closes the facade, the lining's where Interior
 * lines it. A point of the band belongs to whatever stands where the point, pulled straight
 * back into the rectangle, lands, so partitions carry on straight to the face and the band
 * is shared out without a seam. Furniture, doors between rooms and the circulation keep
 * their planned places; a door to the street moves out with its wall to the face.
 *
 * Rooms take their reach as their footprint. Sealed voids and core shafts take theirs as
 * sealed voids of the floor. Loft voids take theirs as open air: the upper floor lays no
 * floor there, the lower one hangs no ceiling.
 */
export function reachShell(plan: BuildingPlan, request: InteriorRequest): void {
  const frame = plan.core.frame;
  for (const floor of plan.floors) {
    const uv = plan.uvFloors.get(floor.floor);
    const bp = request.blueprint.floors.find(item => item.index === floor.floor);
    if (!uv || !bp?.roomEnvelope || !uv.rooms.length) continue;
    reachFloor(plan, request, floor, bp, frame);
  }
}

/** The face a floor's rooms reach: the shell's, or the lining's where Interior lines it. */
export function shellFaceDepth(request: InteriorRequest, bp: BlueprintFloor): number {
  return shellOwnsFacade(request, bp)
    ? shellWallDepth(request.blueprint.facade) + SHELL_SEAM : facadeDepth(request.blueprint.facade);
}

function reachFloor(plan: BuildingPlan, request: InteriorRequest, floor: FloorInterior, bp: BlueprintFloor, frame: Frame): void {
  const uv = plan.uvFloors.get(floor.floor)!;
  const plate = constructionPlate(bp, frame, shellWallDepth(request.blueprint.facade));
  const core = plan.core;
  const rooms = uv.rooms.map(room => ({ room, polygon: roomPolygon(room, plate) }));
  const voids = loftVoids(floor, frame);
  const shafts: UvRect[] = [core.stairA, ...(core.stairB ? [core.stairB] : []), core.riser, ...core.elevators.map(e => e.rect)];
  const standing = [...rooms.map(item => item.polygon), ...uv.sealed.map(corners), ...shafts.map(corners),
    ...voids.filter(item => item.level === 'upper').map(item => corners(item.rect))];
  const bounds = polygonBounds(standing.flat());
  const rect = { u0: bounds.x, v0: bounds.z, u1: bounds.x + bounds.w, v1: bounds.z + bounds.d };
  const breaks = {
    u: [...new Set(standing.flat().map(point => point[0]))],
    v: [...new Set(standing.flat().map(point => point[1]))],
  };
  const face = shellFace(bp, frame, shellFaceDepth(request, bp), breaks);
  // A face that does not hold the whole rectangle is not a band around it.
  if (face.length < 3 || !corners({ u: rect.u0, v: rect.v0, lu: bounds.w, lv: bounds.d })
    .every(point => roomFootprintContains({ polygon: face }, point) || onRing(point, face))) return;
  const region = new RoomRegion(face);
  const reach = (polygon: Point[], holes: Point[][] = []) => extend(region, rect, polygon, holes);

  const changed = new Map<string, PlanRoom>();
  for (const { room, polygon } of rooms) {
    if (!touches(polygon, rect)) continue;
    const shape = reach(polygon, room.holes ?? []);
    if (!shape) continue;
    // Doors keep their planned places; only a street door moves out with its wall.
    for (const door of room.doors) {
      if (door.openFront || door.position) continue;
      door.position = doorUvPoint(door, room);
    }
    for (const door of room.doors) {
      if (door.to !== 'outside' || door.openFront || !door.position) continue;
      door.position = outward(door.position, door.edge, shape.polygon);
    }
    const b = polygonBounds(shape.polygon);
    room.polygon = shape.polygon;
    room.rect = { u: b.x, v: b.z, lu: b.w, lv: b.d };
    if (shape.holes.length) room.holes = shape.holes;
    changed.set(room.id, room);
  }
  const sealed: UvRect[] = [];
  for (const solid of [...uv.sealed, ...shafts]) {
    if (!touches(corners(solid), rect)) continue;
    const shape = reach(corners(solid));
    if (shape) sealed.push(...beyond(shape.polygon, solid));
  }
  const air: OpenAir[] = [];
  for (const item of voids) {
    if (!touches(corners(item.rect), rect)) continue;
    const shape = reach(corners(item.rect));
    if (!shape) continue;
    let parts;
    try {
      parts = new RoomRegion(shape.polygon).subtract([item.rect]);
    } catch {
      continue;
    }
    for (const part of parts) air.push({ polygon: part.polygon!, level: item.level, slice: item.slice, unit: item.unit,
      void: item.rect, gap: item.gap });
    // The upper floor publishes the void as air: it is air out to the shell.
    const published = item.level === 'upper' ? floor.rooms.find(room => room.id === `${item.slice}-air-${item.index}`) : undefined;
    if (published) published.polygon = ccw(toWorldPolygon(shape.polygon, frame).map(round));
  }
  uv.face = face;
  if (sealed.length) uv.sealed = [...uv.sealed, ...sealed];
  if (air.length) uv.openAir = air;
  for (const room of floor.rooms) {
    const planned = changed.get(room.id);
    if (!planned) continue;
    room.polygon = ccw(toWorldPolygon(planned.polygon!, frame).map(round));
    if (planned.holes?.length) room.holes = planned.holes.map(hole => {
      const ring = toWorldPolygon(hole, frame).map(round);
      return isCcw(ring) ? ring.reverse() : ring;
    });
    for (const door of room.doors) {
      const source = planned.doors.find(item => item.id === door.id && item.to === door.to);
      if (source?.to === 'outside' && source.position && !source.openFront) door.position = round(uvToWorld(source.position, frame));
    }
  }
}

/** The part of the face that pulls back into `polygon`: the face less every strip, corner
 *  or cell of the rectangle the polygon does not stand on. */
function extend(region: RoomRegion, rect: { u0: number; v0: number; u1: number; v1: number }, polygon: Point[], holes: Point[][]):
  { polygon: Point[]; holes: Point[][] } | null {
  const us = [...new Set([rect.u0, rect.u1, ...polygon.map(p => p[0]), ...holes.flat().map(p => p[0])])]
    .filter(u => u >= rect.u0 - 1e-9 && u <= rect.u1 + 1e-9).sort((a, b) => a - b);
  const vs = [...new Set([rect.v0, rect.v1, ...polygon.map(p => p[1]), ...holes.flat().map(p => p[1])])]
    .filter(v => v >= rect.v0 - 1e-9 && v <= rect.v1 + 1e-9).sort((a, b) => a - b);
  const others: UvRect[] = [];
  for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
    const u0 = us[i]!, u1 = us[i + 1]!, v0 = vs[j]!, v1 = vs[j + 1]!;
    if (u1 - u0 < 1e-9 || v1 - v0 < 1e-9) continue;
    if (roomFootprintContains({ polygon, holes }, [(u0 + u1) / 2, (v0 + v1) / 2])) continue;
    // A cell on the rectangle's edge owns the band out beyond it.
    const lo = u0 <= rect.u0 + 1e-9 ? rect.u0 - FAR : u0, hi = u1 >= rect.u1 - 1e-9 ? rect.u1 + FAR : u1;
    const low = v0 <= rect.v0 + 1e-9 ? rect.v0 - FAR : v0, high = v1 >= rect.v1 - 1e-9 ? rect.v1 + FAR : v1;
    others.push({ u: lo, v: low, lu: hi - lo, lv: high - low });
  }
  let shapes;
  try {
    shapes = region.subtract(others);
  } catch {
    return null;
  }
  const inner = interiorPoint(polygon, holes);
  const own = shapes.filter(shape => roomFootprintContains({ polygon: shape.polygon!, holes: shape.holes ?? [] }, inner));
  if (own.length !== 1) return null;
  const reached = own[0]!.polygon!, holesOf = own[0]!.holes ?? [];
  // The reach only ever adds band: a shape smaller than the planned room is a failed cut.
  if (!polygon.every(point => roomFootprintContains({ polygon: reached }, point) || onRing(point, reached))) return null;
  return { polygon: reached, holes: holesOf };
}

/** The planned polygon's cells from the rectangle edge outward: what the reach added. */
function beyond(polygon: Point[], planned: UvRect): UvRect[] {
  const us = [...new Set(polygon.map(p => p[0]))].sort((a, b) => a - b);
  const vs = [...new Set(polygon.map(p => p[1]))].sort((a, b) => a - b);
  const out: UvRect[] = [];
  for (let i = 0; i + 1 < us.length; i++) {
    let start: number | undefined;
    for (let j = 0; j < vs.length; j++) {
      const u0 = us[i]!, u1 = us[i + 1]!, v0 = vs[j]!, v1 = vs[j + 1];
      const mid: Point = [(u0 + u1) / 2, v1 === undefined ? 0 : (v0 + v1) / 2];
      const open = v1 !== undefined && roomFootprintContains({ polygon }, mid)
        && !(mid[0] > planned.u && mid[0] < planned.u + planned.lu && mid[1] > planned.v && mid[1] < planned.v + planned.lv);
      if (open && start === undefined) start = v0;
      if (!open && start !== undefined) {
        out.push({ u: u0, v: start, lu: u1 - u0, lv: v0 - start });
        start = undefined;
      }
    }
  }
  return out.filter(rect => rect.lu > 1e-6 && rect.lv > 1e-6);
}

/** A loft void's rectangle on the floor it opens: the upper floor's air, the lower's
 *  ceiling hole. */
function loftVoids(floor: FloorInterior, frame: Frame): (Omit<OpenAir, 'polygon' | 'void'> & { rect: UvRect; index: number })[] {
  return (floor.duplexes ?? []).flatMap(slice => [...slice.loungeVoids, slice.stairOpening].map((ring, index) => {
    const b = polygonBounds(ring.map(point => worldToUv(point, frame)));
    return { rect: { u: b.x, v: b.z, lu: b.w, lv: b.d }, level: slice.level, slice: slice.id, unit: slice.unit,
      gap: slice.lowerCeilingGap ?? .2, index };
  }));
}

/** Whether a polygon stands on the rectangle's edge. */
function touches(polygon: Point[], rect: { u0: number; v0: number; u1: number; v1: number }): boolean {
  return polygon.some(([u, v]) => Math.abs(u - rect.u0) < 1e-6 || Math.abs(u - rect.u1) < 1e-6
    || Math.abs(v - rect.v0) < 1e-6 || Math.abs(v - rect.v1) < 1e-6);
}

/** A street door on a wall that reached the face stands on the face, where its wall is now. */
function outward(position: Point, edge: string, polygon: Point[]): Point {
  const axis = edge.startsWith('v') ? 1 : 0, along = 1 - axis, sign = edge.endsWith('0') ? -1 : 1;
  const at = (point: Point, index: number): number => point[index]!;
  let best = at(position, axis);
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    if (Math.abs(at(a, axis) - at(b, axis)) > 1e-9) continue;
    const lo = Math.min(at(a, along), at(b, along)), hi = Math.max(at(a, along), at(b, along));
    if (at(position, along) < lo - 1e-9 || at(position, along) > hi + 1e-9) continue;
    if ((at(a, axis) - best) * sign > 1e-9) best = at(a, axis);
  }
  return axis === 1 ? [position[0], best] : [best, position[1]];
}

function interiorPoint(polygon: Point[], holes: Point[][]): Point {
  const us = [...new Set(polygon.map(p => p[0]))].sort((a, b) => a - b);
  const vs = [...new Set(polygon.map(p => p[1]))].sort((a, b) => a - b);
  for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
    const point: Point = [(us[i]! + us[i + 1]!) / 2, (vs[j]! + vs[j + 1]!) / 2];
    if (roomFootprintContains({ polygon, holes }, point)) return point;
  }
  return polygon[0]!;
}

function onRing(point: Point, ring: Point[]): boolean {
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const du = b[0] - a[0], dv = b[1] - a[1], length2 = du * du + dv * dv;
    const t = length2 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * du + (point[1] - a[1]) * dv) / length2)) : 0;
    if (Math.hypot(point[0] - a[0] - du * t, point[1] - a[1] - dv * t) < 1e-6) return true;
  }
  return false;
}

function corners(rect: UvRect): Point[] {
  return [[rect.u, rect.v], [rect.u + rect.lu, rect.v], [rect.u + rect.lu, rect.v + rect.lv], [rect.u, rect.v + rect.lv]];
}

function ccw(polygon: Point[]): Point[] {
  return isCcw(polygon) ? polygon : polygon.reverse();
}

function round([x, z]: Point): Point {
  return [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000];
}
