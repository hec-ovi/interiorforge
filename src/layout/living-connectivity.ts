import { distanceToSegment, type Point } from '../core/geom.js';
import { roomPolygon, type RoomShape } from './room-shape.js';

const STEP = .25;
const CAPACITY = 4096;
const cache = new Map<string, boolean>();

/** Exact geometry only: entry positions, furniture and the search order cannot
 * change this predicate. Keep the cache bounded across repeated floor plans. */
export function livingConnected(room: RoomShape): boolean {
  const key = JSON.stringify([room.rect, roomPolygon(room), room.holes ?? []]);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  // Retain every existing rejection, then detect real body-sized components
  // which fall between quarter-grid samples (notably one-metre living arms).
  const result = computeConnectivity(room, STEP, true) && computeConnectivity(room, STEP / 2, false);
  if (cache.size >= CAPACITY) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

/** The original quarter-metre sample positions and both clearance thresholds are
 * retained. Compute each distance once, then flood both masks with integer cells
 * instead of rebuilding polygons and allocating coordinate strings twice. */
function computeConnectivity(room: RoomShape, step: number, wide: boolean): boolean {
  const r = room.rect, us: number[] = [], vs: number[] = [];
  for (let u = r.u + step / 2; u < r.u + r.lu; u += step) us.push(u);
  for (let v = r.v + step / 2; v < r.v + r.lv; v += step) vs.push(v);
  const columns = us.length, rows = vs.length, mask = new Uint8Array(columns * rows);
  const rings = [roomPolygon(room), ...(room.holes ?? [])];
  const lowerBound = (coordinates: number[], value: number): number => {
    let low = 0, high = coordinates.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (coordinates[mid]! < value) low = mid + 1; else high = mid;
    }
    return low;
  };
  // The same ray-crossing arithmetic as pointInPolygon, evaluated once per row.
  // Fill the outer ring, then remove each hole (not XOR: overlapping exclusions
  // must never become usable floor). Boundary samples are removed below.
  rings.forEach((ring, index) => {
    for (let row = 0; row < rows; row++) {
      const v = vs[row]!, crossings: number[] = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, zi] = ring[i]!, [xj, zj] = ring[j]!;
        if (zi > v !== zj > v) crossings.push(((xj - xi) * (v - zi)) / (zj - zi) + xi);
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2)
        mask.fill(index ? 0 : wide ? 3 : 1, row * columns + lowerBound(us, crossings[i]!),
          row * columns + lowerBound(us, crossings[i + 1]!));
    }
  });
  // A sample farther than the wider threshold from a segment's bounding box
  // cannot fail either clearance. Exact distances are needed only in this band.
  const band = wide ? .85 : .39;
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    const lowU = lowerBound(us, Math.min(a[0], b[0]) - band), highU = lowerBound(us, Math.max(a[0], b[0]) + band);
    const lowV = lowerBound(vs, Math.min(a[1], b[1]) - band), highV = lowerBound(vs, Math.max(a[1], b[1]) + band);
    for (let row = lowV; row < highV; row++) for (let column = lowU; column < highU; column++) {
      const at = row * columns + column;
      if (!mask[at]) continue;
      const point: Point = [us[column]!, vs[row]!];
      const distance = distanceToSegment(point, a, b);
      if (distance < .39 - 1e-6) mask[at] = 0;
      else if (wide && distance < .85 - 1e-6) mask[at] = mask[at]! & ~2;
    }
  }
  const count: [number, number] = [0, 0];
  for (const value of mask) { if (value & 1) count[0]++; if (value & 2) count[1]++; }
  if (!count[0] || wide && !count[1]) return false;
  const queue = new Int32Array(mask.length);
  const connected = (bit: number, expected: number): boolean => {
    const start = mask.findIndex(value => (value & bit) !== 0);
    let head = 0, tail = 0;
    queue[tail++] = start;
    mask[start] = mask[start]! & ~bit;
    const visit = (at: number): void => {
      if (!(mask[at]! & bit)) return;
      mask[at] = mask[at]! & ~bit;
      queue[tail++] = at;
    };
    while (head < tail) {
      const at = queue[head++]!, column = at % columns;
      if (column > 0) visit(at - 1);
      if (column + 1 < columns) visit(at + 1);
      if (at >= columns) visit(at - columns);
      if (at + columns < mask.length) visit(at + columns);
    }
    return tail === expected;
  };
  return connected(1, count[0]!) && (!wide || connected(2, count[1]!));
}
