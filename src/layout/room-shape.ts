import type { Point } from "../core/geom.js";
import { boundaryDistance, clipPolygonToRect, pointInRect, polygonArea, polygonCentroid, rectCorners } from "../core/geom.js";
import { roomFootprintAnchor, roomFootprintArea, roomFootprintClearance, roomFootprintContains } from "../core/room-footprint.js";
import { triangulate } from "../core/triangulate.js";
import type { EdgeName, PlanRoom } from "./plan-types.js";
import type { UvRect } from "./uv.js";
import { pointInUvRect, uvRectCenter, uvRectCorners } from "./uv.js";

export type RoomShape = Pick<PlanRoom, "rect" | "polygon" | "holes">;

export interface RoomEdge {
  a: Point;
  b: Point;
  edge: EdgeName | null;
}

/** Explicit footprints are already fitted to the slab plate by their allocator. */
export function roomPolygon(room: RoomShape, outline?: readonly Point[]): Point[] {
  if (room.polygon) return room.polygon;
  const r = room.rect;
  const clipped = outline ? clipPolygonToRect(outline, { x: r.u, z: r.v, w: r.lu, d: r.lv }) : [];
  return clipped.length >= 3 ? clipped : uvRectCorners(r);
}

export function roomContains(room: RoomShape, point: Point): boolean {
  return room.polygon || room.holes?.length
    ? roomFootprintContains({ polygon: roomPolygon(room), holes: room.holes }, point)
    : pointInUvRect(point, room.rect);
}

export function roomRings(room: RoomShape, outline?: readonly Point[]): Point[][] {
  return [roomPolygon(room, outline), ...(room.holes ?? [])];
}

export function roomArea(room: RoomShape, outline?: readonly Point[]): number {
  return roomFootprintArea({ polygon: roomPolygon(room, outline), holes: room.holes });
}

export function roomClearance(room: RoomShape, point: Point): number {
  return roomFootprintClearance({ polygon: roomPolygon(room), holes: room.holes }, point);
}

export function roomEdges(room: RoomShape, outline?: readonly Point[]): RoomEdge[] {
  return roomRings(room, outline).flatMap(polygon => polygon.flatMap((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!;
    const du = b[0] - a[0], dv = b[1] - a[1];
    if (Math.hypot(du, dv) < 1e-8) return [];
    const edge: EdgeName | null = Math.abs(dv) < 1e-7 ? du > 0 ? "v0" : "v1"
      : Math.abs(du) < 1e-7 ? dv > 0 ? "u1" : "u0" : null;
    return [{ a, b, edge }];
  }));
}

/** A rectangle cannot span a concave notch even when its corners happen to fit. */
export function roomCoversRect(room: RoomShape, rect: UvRect, margin = 0): boolean {
  if (!room.polygon && !room.holes?.length) return rect.u - margin >= room.rect.u - 1e-8 && rect.v - margin >= room.rect.v - 1e-8
    && rect.u + rect.lu + margin <= room.rect.u + room.rect.lu + 1e-8
    && rect.v + rect.lv + margin <= room.rect.v + room.rect.lv + 1e-8;
  const grown = { x: rect.u - margin, z: rect.v - margin, w: rect.lu + 2 * margin, d: rect.lv + 2 * margin };
  const clipped = clipPolygonToRect(roomPolygon(room), grown);
  const wanted = grown.w * grown.d;
  if (clipped.length < 3 || Math.abs(polygonArea(clipped)) < wanted - Math.max(1e-8, wanted * 1e-8)) return false;
  if (!rectCorners(grown).every(point => roomContains(room, point))) return false;
  return (room.holes ?? []).every(hole => !hole.some(point => pointInRect(point, grown, 1e-8))
    && Math.abs(polygonArea(clipPolygonToRect(hole, grown))) < 1e-8);
}

/** Interior target for a room whose bounds center may lie inside its service-room notch. */
export function roomAnchor(room: RoomShape): Point {
  if (room.holes?.length) return roomFootprintAnchor({ polygon: roomPolygon(room), holes: room.holes });
  if (!room.polygon) return uvRectCenter(room.rect);
  const centroid = polygonCentroid(room.polygon);
  if (roomContains(room, centroid)) return centroid;
  let best = room.polygon[0]!, clearance = -Infinity;
  for (const indices of triangulate(room.polygon)) {
    const point: Point = [0, 0];
    for (const index of indices) {
      point[0] += room.polygon[index]![0] / 3;
      point[1] += room.polygon[index]![1] / 3;
    }
    const distance = boundaryDistance(point, room.polygon);
    if (distance > clearance) { best = point; clearance = distance; }
  }
  return best;
}

export interface RoomStretch {
  edge: EdgeName;
  c: number;
  lo: number;
  hi: number;
}

/** Complete shared axis-aligned boundary intervals, including an inboard service-room wall. */
export function sharedRoomEdges(owner: RoomShape, other: RoomShape, outline?: readonly Point[]): RoomStretch[] {
  const out: RoomStretch[] = [];
  for (const a of roomEdges(owner, outline)) {
    if (!a.edge) continue;
    const along = a.edge.startsWith("v") ? 0 : 1;
    const cross = 1 - along;
    for (const b of roomEdges(other, outline)) {
      if (!b.edge || b.edge === a.edge || b.edge[0] !== a.edge[0]) continue;
      if (Math.abs(a.a[cross]! - b.a[cross]!) > 1e-6) continue;
      const lo = Math.max(Math.min(a.a[along]!, a.b[along]!), Math.min(b.a[along]!, b.b[along]!));
      const hi = Math.min(Math.max(a.a[along]!, a.b[along]!), Math.max(b.a[along]!, b.b[along]!));
      if (hi - lo > 1e-6) out.push({ edge: a.edge, c: a.a[cross]!, lo, hi });
    }
  }
  return out.sort((a, b) => b.hi - b.lo - (a.hi - a.lo) || a.edge.localeCompare(b.edge) || a.c - b.c || a.lo - b.lo);
}
