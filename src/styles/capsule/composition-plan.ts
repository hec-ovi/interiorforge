import { distanceToSegment, pointInPolygon, type Point } from '../../core/geom.js';
import { ArchitectureAccess } from '../../layout/architecture-access.js';
import { doorZonesByRoom } from '../../layout/clearance.js';
import { fixtureAccessPaths } from '../../layout/compact-fixtures.js';
import { overlaps } from '../../layout/bathroom-recipe.js';
import { blockPhysicalReservations, furnitureUvRect } from '../../layout/navgrid.js';
import type { EdgeName, PlanDoor, PlanRoom } from '../../layout/plan-types.js';
import { roomArea, roomCoversRect, roomEdges, roomPolygon } from '../../layout/room-shape.js';
import type { FloorBounds } from '../../layout/shell.js';
import { uvRectCorners, type Frame, type UvRect } from '../../layout/uv.js';
import { rectangles } from '../../placements/surfaces.js';
import { fitResidentialComposition, type ResidentialCompositionProfile, type ResidentialPiece } from './composition.js';

const OPPOSITE: Record<EdgeName, EdgeName> = { u0: 'u1', u1: 'u0', v0: 'v1', v1: 'v0' };
const BODY = .34; // same unchanged player radius + skin used by fixtureAccessPaths

/** Co-design the complete primary living group and its paths. No route is erased:
 * the same physical pieces are present when the shared route solver runs, and
 * the later furniture pass commits the recorded group instead of rerolling it. */
export function planResidentialLivingGroups(access: ArchitectureAccess, rooms: PlanRoom[], frame: Frame,
  bounds: FloorBounds, openingZones: readonly UvRect[], profile: ResidentialCompositionProfile): ArchitectureAccess {
  const primary = new Map<string, PlanRoom>();
  for (const room of rooms) if (room.unit && (room.kind === 'living' || room.kind === 'studio_main')) {
    const previous = primary.get(room.unit);
    if (!previous || roomArea(room) > roomArea(previous)) primary.set(room.unit, room);
  }
  const doorZones = doorZonesByRoom(rooms), reservations: UvRect[] = [];
  for (const room of primary.values()) {
    // Studios first need their sleeping/wet fixtures; their existing complete
    // programme remains owned by the shared furnisher. This pass owns living rooms.
    if (room.kind !== 'living') continue;
    const blocked = [...(doorZones.get(room.id) ?? []).map(zone => zone.rect), ...openingZones, ...(room.furnishingKeepouts ?? [])];
    const usable = usableBounds(room, bounds);
    // Circulation publishes conservative boxes around subsegments up to one
    // physical grid cell long. Reserve that bound as well as the unchanged
    // route radius and furniture gap, so exact commit survives diagonal sweeps.
    const routeClearance = (room.furnishingKeepouts?.length ? 1.2 : .3) + .15 + access.physical.cellSize;
    const doorwayRoom = withIncomingDoors(room, rooms);
    let paths: Point[][] = [];
    const group = fitResidentialComposition(room, usable, profile, (_reservation, pieces) => {
      if (!pieces.every(piece => fitsPiece(room, usable, bounds, blocked, piece))) return false;
      const obstacles = pieces.filter(piece => !(piece.elevation && piece.elevation > 0))
        .map(piece => grow(furnitureUvRect({ ...piece, id: '', room: room.id }), routeClearance - BODY));
      const candidatePaths = fixtureAccessPaths(doorwayRoom, [], obstacles);
      if (!candidatePaths) return false;
      paths = candidatePaths;
      return true;
    });
    // A living room with no complete group that keeps every doorway connected is left
    // to the furnisher, which places what fits after the routes are reserved.
    if (!group) continue;
    room.plannedLiving = { profile, recipe: group.recipe, reservation: group.reservation, pieces: group.pieces, paths, routeClearance };
    // Clip the clearance envelope to its own room. A sofa beside a solid bedroom
    // partition cannot reserve space through that wall in the neighbouring room.
    const cells = rectangles(roomPolygon(room), room.holes);
    for (const piece of group.pieces.filter(piece => !(piece.elevation && piece.elevation > 0))) {
      const inflated = grow(furnitureUvRect({ ...piece, id: '', room: room.id }), routeClearance);
      for (const cell of cells) {
        const u = Math.max(cell.u, inflated.u), v = Math.max(cell.v, inflated.v);
        const lu = Math.min(cell.u + cell.lu, inflated.u + inflated.lu) - u;
        const lv = Math.min(cell.v + cell.lv, inflated.v + inflated.lv) - v;
        if (lu > 1e-7 && lv > 1e-7) reservations.push({ u, v, lu, lv });
      }
    }
  }
  if (!reservations.length) return access;
  blockPhysicalReservations(access.physical, frame, reservations);
  // Membership/flood caches must reflect the chosen solids, not the old empty room.
  return new ArchitectureAccess(access.physical, rooms, frame);
}

function fitsPiece(room: PlanRoom, usable: UvRect, bounds: FloorBounds, blocked: readonly UvRect[], piece: ResidentialPiece): boolean {
  const fp = furnitureUvRect({ ...piece, id: '', room: room.id });
  if (fp.u < usable.u + .05 || fp.v < usable.v + .05 || fp.u + fp.lu > usable.u + usable.lu - .05
    || fp.v + fp.lv > usable.v + usable.lv - .05 || !roomCoversRect(room, fp, .05)
    || !uvRectCorners(fp).every(point => pointInPolygon(point, bounds.inner))) return false;
  const gap = piece.kind === 'display_screen' ? .05 : .15;
  if (blocked.some(rect => overlaps(fp, rect, gap))) return false;
  if (piece.kind !== 'display_screen') return true;
  const behind: EdgeName = piece.rotationDeg === 0 ? 'v0' : piece.rotationDeg === 180 ? 'v1' : piece.rotationDeg === 90 ? 'u0' : 'u1';
  const along = behind.startsWith('v') ? 0 : 1, cross = 1 - along, centre = piece.at[along]!, half = piece.size[0] / 2;
  return roomEdges(room).some(edge => {
    if (edge.edge !== behind || Math.abs(edge.a[cross]! - piece.at[cross]!) > .32) return false;
    const low = Math.min(edge.a[along]!, edge.b[along]!), high = Math.max(edge.a[along]!, edge.b[along]!);
    if (centre - half < low + .05 || centre + half > high - .05) return false;
    const point: Point = along === 0 ? [centre, edge.a[cross]!] : [edge.a[cross]!, centre];
    return !nearBoundary(point, bounds.inner, .05) && !nearBoundary(point, bounds.outline, bounds.facadeDepth + .05);
  });
}

function withIncomingDoors(room: PlanRoom, rooms: readonly PlanRoom[]): PlanRoom {
  const doors = room.doors.map(door => ({ ...door }));
  for (const neighbour of rooms) for (const door of neighbour.doors) {
    if (door.to !== room.id || doors.some(existing => existing.id === door.id) || door.openFront) continue;
    const position: Point = door.position ?? (door.edge === 'v0' ? [door.at, neighbour.rect.v]
      : door.edge === 'v1' ? [door.at, neighbour.rect.v + neighbour.rect.lv]
      : door.edge === 'u0' ? [neighbour.rect.u, door.at] : [neighbour.rect.u + neighbour.rect.lu, door.at]);
    doors.push({ ...door, to: neighbour.id, edge: OPPOSITE[door.edge], position: [...position] } as PlanDoor);
  }
  return { ...room, doors };
}

function grow(rect: UvRect, margin: number): UvRect {
  return { u: rect.u - margin, v: rect.v - margin, lu: rect.lu + 2 * margin, lv: rect.lv + 2 * margin };
}

function nearBoundary(point: Point, polygon: readonly Point[], distance: number): boolean {
  return polygon.some((a, index) => distanceToSegment(point, a, polygon[(index + 1) % polygon.length]!) < distance);
}

function usableBounds(room: PlanRoom, bounds: FloorBounds): UvRect {
  const r = room.rect, inset = (edge: EdgeName): number => {
    const mid: Point = edge === 'v0' ? [r.u + r.lu / 2, r.v] : edge === 'v1' ? [r.u + r.lu / 2, r.v + r.lv]
      : edge === 'u0' ? [r.u, r.v + r.lv / 2] : [r.u + r.lu, r.v + r.lv / 2];
    return nearBoundary(mid, bounds.outline, .25) ? bounds.facadeDepth : 0;
  };
  const left = inset('u0'), right = inset('u1'), low = inset('v0'), high = inset('v1');
  return { u: r.u + left, v: r.v + low, lu: Math.max(0, r.lu - left - right), lv: Math.max(0, r.lv - low - high) };
}
