import { boundaryDistance, polygonArea, polygonCentroid, type Point } from "./geom.js";

/** A room's outer boundary and its unoccupied interior rings, in one coordinate frame. */
export interface RoomFootprint {
  polygon: readonly Point[];
  holes?: readonly (readonly Point[])[];
}

export const ROOM_FOOTPRINT_EPS = 1e-8;

/** Outer boundaries belong to the room; exclusion interiors and boundaries do not. */
export function roomFootprintContains(room: RoomFootprint, point: Point): boolean {
  return boundaryDistance(point, room.polygon) >= -ROOM_FOOTPRINT_EPS
    && (room.holes ?? []).every(hole => boundaryDistance(point, hole) < -ROOM_FOOTPRINT_EPS);
}

/** Signed clearance from every boundary, positive only in the usable footprint. */
export function roomFootprintClearance(room: RoomFootprint, point: Point): number {
  return Math.min(boundaryDistance(point, room.polygon),
    ...(room.holes ?? []).map(hole => -boundaryDistance(point, hole)));
}

export function roomFootprintArea(room: RoomFootprint): number {
  return Math.abs(polygonArea(room.polygon))
    - (room.holes ?? []).reduce((sum, hole) => sum + Math.abs(polygonArea(hole)), 0);
}

/** Finds an interior point even when a central core encloses the bounds centroid. */
export function roomFootprintAnchor(room: RoomFootprint): Point {
  const centroid = polygonCentroid(room.polygon);
  if (roomFootprintClearance(room, centroid) > ROOM_FOOTPRINT_EPS) return centroid;
  const rings = [room.polygon, ...(room.holes ?? [])];
  const levels = [...new Set(rings.flatMap(ring => ring.map(point => point[1])))].sort((a, b) => a - b);
  let best = room.polygon[0]!, clearance = -Infinity;
  for (let i = 1; i < levels.length; i++) {
    const v = (levels[i - 1]! + levels[i]!) / 2;
    const crossings: number[] = [];
    for (const ring of rings) {
      for (let j = 0; j < ring.length; j++) {
        const a = ring[j]!, b = ring[(j + 1) % ring.length]!;
        if ((a[1] > v) === (b[1] > v)) continue;
        crossings.push(a[0] + (b[0] - a[0]) * (v - a[1]) / (b[1] - a[1]));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let j = 1; j < crossings.length; j += 2) {
      const point: Point = [(crossings[j - 1]! + crossings[j]!) / 2, v];
      const distance = roomFootprintClearance(room, point);
      if (distance > clearance) { best = point; clearance = distance; }
    }
  }
  return best;
}
