/** 2D geometry on the XZ plane. Point = [x, z]. Rect = axis-aligned, min corner. */

export type Point = [number, number];

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export function polygonArea(poly: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]!;
    const [x2, z2] = poly[(i + 1) % poly.length]!;
    sum += x1 * z2 - x2 * z1;
  }
  return sum / 2;
}

export function isCcw(poly: readonly Point[]): boolean {
  return polygonArea(poly) > 0;
}

export function polygonCentroid(poly: readonly Point[]): Point {
  let cx = 0;
  let cz = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i]!;
    const [x2, z2] = poly[(i + 1) % poly.length]!;
    const cross = x1 * z2 - x2 * z1;
    cx += (x1 + x2) * cross;
    cz += (z1 + z2) * cross;
    a += cross;
  }
  a /= 2;
  return [cx / (6 * a), cz / (6 * a)];
}

export function polygonBounds(poly: readonly Point[]): Rect {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  }
  return { x: minX, z: minZ, w: maxX - minX, d: maxZ - minZ };
}

export function pointInPolygon([px, pz]: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInRect([px, pz]: Point, r: Rect, margin = 0): boolean {
  return px >= r.x - margin && px <= r.x + r.w + margin && pz >= r.z - margin && pz <= r.z + r.d + margin;
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.z < b.z + b.d + gap && b.z < a.z + a.d + gap;
}

export function rectContainsRect(outer: Rect, inner: Rect, margin = 0): boolean {
  return (
    inner.x >= outer.x + margin &&
    inner.z >= outer.z + margin &&
    inner.x + inner.w <= outer.x + outer.w - margin &&
    inner.z + inner.d <= outer.z + outer.d - margin
  );
}

export function rectCorners(r: Rect): Point[] {
  return [
    [r.x, r.z],
    [r.x + r.w, r.z],
    [r.x + r.w, r.z + r.d],
    [r.x, r.z + r.d],
  ];
}

export function rectCenter(r: Rect): Point {
  return [r.x + r.w / 2, r.z + r.d / 2];
}

export function rectInPolygon(r: Rect, poly: readonly Point[], margin = 0): boolean {
  const grown: Rect = { x: r.x - margin, z: r.z - margin, w: r.w + 2 * margin, d: r.d + 2 * margin };
  return rectCorners(grown).every((c) => pointInPolygon(c, poly));
}

export function edgeLength(poly: readonly Point[], edge: number): number {
  const [x1, z1] = poly[edge]!;
  const [x2, z2] = poly[(edge + 1) % poly.length]!;
  return Math.hypot(x2 - x1, z2 - z1);
}

/** Point at `t` meters along edge `edge` from its start vertex. */
export function pointAlongEdge(poly: readonly Point[], edge: number, t: number): Point {
  const [x1, z1] = poly[edge]!;
  const [x2, z2] = poly[(edge + 1) % poly.length]!;
  const len = Math.hypot(x2 - x1, z2 - z1);
  return [x1 + ((x2 - x1) * t) / len, z1 + ((z2 - z1) * t) / len];
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
