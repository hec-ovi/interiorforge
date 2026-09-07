import type { Point, Rect } from "./geom.js";
import { ROOM_FOOTPRINT_EPS, roomFootprintContains, type RoomFootprint } from "./room-footprint.js";

/** Closed slab clipping, with the original segment parameter retained. */
export function segmentRectInterval(a: Point, b: Point, rect: Rect): [number, number] | null {
  let start = 0, end = 1;
  for (const axis of [0, 1] as const) {
    const low = axis === 0 ? rect.x : rect.z, high = low + (axis === 0 ? rect.w : rect.d);
    const delta = b[axis] - a[axis];
    if (delta === 0) {
      if (a[axis] < low || a[axis] > high) return null;
      continue;
    }
    const t0 = (low - a[axis]) / delta, t1 = (high - a[axis]) / delta;
    start = Math.max(start, Math.min(t0, t1));
    end = Math.min(end, Math.max(t0, t1));
    if (start > end) return null;
  }
  return [start, end];
}

function cross(ax: number, az: number, bx: number, bz: number): number {
  return ax * bz - az * bx;
}

function ringCrossing(a: Point, b: Point, c: Point, d: Point): [number, number] | null {
  const ux = b[0] - a[0], uz = b[1] - a[1], vx = d[0] - c[0], vz = d[1] - c[1];
  const qx = c[0] - a[0], qz = c[1] - a[1], divisor = cross(ux, uz, vx, vz);
  if (divisor !== 0) {
    // Axis-aligned shared lines have one crossing parameter, independent of edge length.
    const t = vz === 0 ? qz / uz : vx === 0 ? qx / ux : cross(qx, qz, vx, vz) / divisor;
    const u = cross(qx, qz, ux, uz) / divisor;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, t] : null;
  }
  if (cross(qx, qz, ux, uz) !== 0) return null;
  const axis = Math.abs(ux) >= Math.abs(uz) ? 0 : 1, delta = b[axis] - a[axis];
  const t0 = (c[axis] - a[axis]) / delta, t1 = (d[axis] - a[axis]) / delta;
  const start = Math.max(0, Math.min(t0, t1)), end = Math.min(1, Math.max(t0, t1));
  return start <= end ? [start, end] : null;
}

function at(a: Point, b: Point, t: number): Point {
  if (t === 0) return a;
  if (t === 1) return b;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function addInterval(events: Set<number>, interval: [number, number] | null): void {
  if (interval) { events.add(interval[0]); events.add(interval[1]); }
}

function addCircleEvents(events: Set<number>, a: Point, b: Point, center: Point): void {
  const ux = b[0] - a[0], uz = b[1] - a[1], qx = a[0] - center[0], qz = a[1] - center[1];
  const length2 = ux * ux + uz * uz, perpendicular = cross(qx, qz, ux, uz);
  const remaining = ROOM_FOOTPRINT_EPS ** 2 - perpendicular * perpendicular / length2;
  if (remaining < 0) return;
  const closest = -(qx * ux + qz * uz) / length2, half = Math.sqrt(remaining / length2);
  const start = Math.max(0, closest - half), end = Math.min(1, closest + half);
  if (start <= end) addInterval(events, [start, end]);
}

/** The distance-to-edge band is exactly a rectangle and two endpoint disks. */
function addCapsuleEvents(events: Set<number>, a: Point, b: Point, c: Point, d: Point): void {
  const eps = ROOM_FOOTPRINT_EPS;
  if (Math.min(a[0], b[0]) - Math.max(c[0], d[0]) > eps
    || Math.min(c[0], d[0]) - Math.max(a[0], b[0]) > eps
    || Math.min(a[1], b[1]) - Math.max(c[1], d[1]) > eps
    || Math.min(c[1], d[1]) - Math.max(a[1], b[1]) > eps) return;
  addCircleEvents(events, a, b, c);
  if (c[0] === d[0] && c[1] === d[1]) return;
  addCircleEvents(events, a, b, d);
  const dx = d[0] - c[0], dz = d[1] - c[1], length = Math.hypot(dx, dz);
  const alongX = dx / length, alongZ = dz / length;
  const local = (p: Point): Point => {
    const x = p[0] - c[0], z = p[1] - c[1];
    return [x * alongX + z * alongZ, -x * alongZ + z * alongX];
  };
  addInterval(events, segmentRectInterval(local(a), local(b), { x: 0, z: -eps, w: length, d: 2 * eps }));
}

function samePoint(a: Point, b: Point): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Ring crossings and epsilon-capsule roots contain every membership change along the path. */
export function segmentCoveredByFootprints(a: Point, b: Point, footprints: readonly RoomFootprint[]): boolean {
  const covered = (point: Point): boolean => footprints.some(room => roomFootprintContains(room, point));
  if (!covered(a) || !covered(b)) return false;
  if (samePoint(a, b)) return true;
  if (a[0] > b[0] || a[0] === b[0] && a[1] > b[1]) [a, b] = [b, a];
  const events = new Set([0, 1]);
  for (const room of footprints) for (const ring of [room.polygon, ...(room.holes ?? [])]) {
    for (let i = 0; i < ring.length; i++) {
      let c = ring[i]!, d = ring[(i + 1) % ring.length]!;
      // Shared opposite-winding edges must produce identical intersection and band events.
      if (c[0] > d[0] || c[0] === d[0] && c[1] > d[1]) [c, d] = [d, c];
      addInterval(events, ringCrossing(a, b, c, d));
      addCapsuleEvents(events, a, b, c, d);
    }
  }
  const ordered = [...events].sort((x, y) => x - y);
  for (let i = 1; i < ordered.length; i++) {
    const start = at(a, b, ordered[i - 1]!), end = at(a, b, ordered[i]!);
    const midpoint = at(a, b, (ordered[i - 1]! + ordered[i]!) / 2);
    if (samePoint(midpoint, start) || samePoint(midpoint, end)) return false;
    // Ownership is constant on this analytic open interval; event points are separate.
    if (!covered(start) || !covered(midpoint) || !covered(end)) return false;
  }
  return true;
}
