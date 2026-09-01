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

/** Sutherland-Hodgman clip of a polygon by an axis-aligned rect.
 *  Returns the clipped polygon (CCW preserved), or [] when fully outside. */
export function clipPolygonToRect(poly: readonly Point[], r: Rect): Point[] {
  return clipPolygonToConvex(poly, rectCorners(r));
}

/** Sutherland-Hodgman clip of any simple polygon by a convex CCW polygon. CCW preserved;
 *  [] when fully outside. Where the result would be two lobes joined by a zero-width
 *  bridge, the bridge's dangling spikes are pruned. */
export function clipPolygonToConvex(poly: readonly Point[], clipper: readonly Point[]): Point[] {
  let out: Point[] = [...poly];
  for (let i = 0; i < clipper.length; i++) {
    const a = clipper[i]!;
    const b = clipper[(i + 1) % clipper.length]!;
    const side = (p: Point): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j]!;
      const prev = input[(j + input.length - 1) % input.length]!;
      const sc = side(cur);
      const sp = side(prev);
      if (sc >= 0) {
        if (sp < 0) out.push(lerp(prev, cur, sp / (sp - sc)));
        out.push(cur);
      } else if (sp >= 0) {
        out.push(lerp(prev, cur, sp / (sp - sc)));
      }
    }
    if (out.length === 0) return [];
  }
  return dedupe(out);
}

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Drops repeated vertices and spikes (a vertex the boundary reaches and leaves along the
 *  same line), until the polygon is clean or degenerate. */
function dedupe(poly: Point[]): Point[] {
  let out = [...poly];
  for (;;) {
    const n = out.length;
    if (n < 3) return [];
    const i = out.findIndex((p, k) => {
      const prev = out[(k + n - 1) % n]!;
      const next = out[(k + 1) % n]!;
      if (distance(p, prev) < 1e-9) return true;
      const ax = p[0] - prev[0], az = p[1] - prev[1], bx = next[0] - p[0], bz = next[1] - p[1];
      return Math.abs(ax * bz - az * bx) < 1e-9 && ax * bx + az * bz < 0;
    });
    if (i < 0) return out;
    out = out.filter((_, k) => k !== i);
  }
}

/** Signed distance from a point to the polygon boundary: positive inside, negative outside. */
export function boundaryDistance(p: Point, poly: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    best = Math.min(best, distanceToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!));
  }
  return pointInPolygon(p, poly) ? best : -best;
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  return distance(p, footOnSegment(p, a, b));
}

export function footOnSegment(p: Point, a: Point, b: Point): Point {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
  return [a[0] + abx * t, a[1] + abz * t];
}

export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point): number => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** One point per vertex of a CCW polygon, each edge moved `d` toward the interior and the
 *  corners mitred, so vertex i of the result still belongs to vertex i of the input. */
export function mitrePoints(poly: readonly Point[], d: number): Point[] {
  const n = poly.length;
  return poly.map((cur, i) => {
    const prev = poly[(i + n - 1) % n]!;
    const next = poly[(i + 1) % n]!;
    const a = offsetLine(prev, cur, d);
    const b = offsetLine(cur, next, d);
    const det = a.dir[0] * b.dir[1] - a.dir[1] * b.dir[0];
    if (Math.abs(det) < 1e-9) return b.at;
    const t = ((b.at[0] - a.at[0]) * b.dir[1] - (b.at[1] - a.at[1]) * b.dir[0]) / det;
    return [a.at[0] + a.dir[0] * t, a.at[1] + a.dir[1] * t];
  });
}

const INSET_EPS = 1e-7;
const MAX_PUSHES = 8;

interface InsetVertex {
  p: Point;
  pushes: number;
}

/** The plate `d` inside a CCW polygon: every vertex and every edge of the result keeps at
 *  least `d` from the polygon's boundary. Starts from the mitred offset and repairs it: a
 *  fold (two edges crossing) collapses to the crossing, a vertex too close to the boundary
 *  is pushed away from what it is close to (dropped when nothing settles it), and an edge
 *  passing too close to a boundary vertex or crossing the boundary is bent away at the
 *  closest point. Tiny facade steps and sharp corners never pull the plate toward the shell. */
export function insetPolygon(poly: readonly Point[], d: number): Point[] {
  const outline = poly.filter((p, i) => distance(p, poly[(i + poly.length - 1) % poly.length]!) > 1e-9);
  if (outline.length < 3) return [];
  const bisector = mitrePoints(outline, 1).map((m, i): Point => {
    const v = outline[i]!;
    const len = distance(m, v) || 1;
    return [(m[0] - v[0]) / len, (m[1] - v[1]) / len];
  });
  let pts: InsetVertex[] = mitrePoints(outline, d).map((p) => ({ p, pushes: 0 }));
  for (let guard = 0; guard < 500; guard++) {
    if (pts.length < 3) return [];
    const untangled = untangle(pts);
    if (untangled) {
      pts = untangled;
      continue;
    }
    const close = pts.findIndex((v) => boundaryDistance(v.p, outline) < d - INSET_EPS);
    if (close >= 0) {
      const v = pts[close]!;
      if (v.pushes >= MAX_PUSHES) {
        pts = pts.filter((_, k) => k !== close);
        continue;
      }
      const [near, edge] = nearestBoundaryPoint(v.p, outline);
      const gap = distance(v.p, near);
      const dir: Point = gap > 1e-6 ? [(v.p[0] - near[0]) / gap, (v.p[1] - near[1]) / gap] : bisector[edge]!;
      pts[close] = { p: [near[0] + dir[0] * (d + 1e-6), near[1] + dir[1] * (d + 1e-6)], pushes: v.pushes + 1 };
      continue;
    }
    const bent = bendEdgeAway(pts, outline, bisector, d);
    if (!bent) break;
    pts = bent;
  }
  return dedupe(pts.map((v) => v.p));
}

/** Closest boundary point to `p`, with the index of the edge (or its start vertex) it is on. */
function nearestBoundaryPoint(p: Point, outline: readonly Point[]): [Point, number] {
  let best: Point = outline[0]!;
  let bestEdge = 0;
  let bestGap = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const f = footOnSegment(p, outline[i]!, outline[(i + 1) % outline.length]!);
    const gap = distance(p, f);
    if (gap < bestGap) {
      bestGap = gap;
      best = f;
      bestEdge = i;
    }
  }
  return [best, bestEdge];
}

/** First inset edge that comes within `d` of an outline vertex or crosses an outline edge
 *  gets a new vertex at the offending spot, pushed to distance `d`; null when none does. */
function bendEdgeAway(pts: InsetVertex[], outline: readonly Point[], bisector: readonly Point[], d: number): InsetVertex[] | null {
  const n = pts.length;
  const m = outline.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!.p;
    const b = pts[(i + 1) % n]!.p;
    for (let j = 0; j < m; j++) {
      const v = outline[j]!;
      const f = footOnSegment(v, a, b);
      const gap = distance(f, v);
      const crosses = segmentsCross(a, b, v, outline[(j + 1) % m]!);
      if (gap >= d - INSET_EPS && !crosses) continue;
      // push away from the vertex, or along its bisector when the edge runs through it
      const dir: Point = gap > 1e-6 && !crosses
        ? [(f[0] - v[0]) / gap, (f[1] - v[1]) / gap]
        : bisector[j]!;
      const pushed: InsetVertex = { p: [v[0] + dir[0] * (d + 1e-6), v[1] + dir[1] * (d + 1e-6)], pushes: 1 };
      return [...pts.slice(0, i + 1), pushed, ...pts.slice(i + 1)];
    }
  }
  return null;
}

/** A folded corner leaves a small loop where two edges cross: the loop goes, the crossing
 *  stays as the corner. Null when the polygon is already simple. */
function untangle(pts: InsetVertex[]): InsetVertex[] | null {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const a = pts[i]!.p, b = pts[i + 1]!.p, c = pts[j]!.p, e = pts[(j + 1) % n]!.p;
      if (!segmentsCross(a, b, c, e)) continue;
      const x: InsetVertex = { p: intersection(a, b, c, e), pushes: 0 };
      // the loop is the smaller of the two rings the crossing splits off
      const outer = [...pts.slice(0, i + 1), x, ...pts.slice(j + 1)];
      const inner = [x, ...pts.slice(i + 1, j + 1)];
      const area = (ring: InsetVertex[]): number => Math.abs(polygonArea(ring.map((v) => v.p)));
      return area(outer) >= area(inner) ? outer : inner;
    }
  }
  return null;
}

function intersection(a: Point, b: Point, c: Point, d: Point): Point {
  const det = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
  const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / det;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function offsetLine(a: Point, b: Point, d: number): { at: Point; dir: Point } {
  const len = distance(a, b) || 1;
  const dir: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  return { at: [a[0] - dir[1] * d, a[1] + dir[0] * d], dir };
}
