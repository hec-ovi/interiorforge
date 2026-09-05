import { distanceToSegment, type Point } from "./geom.js";

export interface SweepObstacle {
  a: Point;
  b: Point;
  clearance: number;
}

function side(a: Point, b: Point, p: Point): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

function opposite(a: number, b: number): boolean {
  return a < 0 && b > 0 || a > 0 && b < 0;
}

function within(p: Point, a: Point, b: Point): boolean {
  return p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
    && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
}

/** Complete closed-segment separation, including point segments and collinear contact. */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const ac = side(a, b, c), ad = side(a, b, d), ca = side(c, d, a), cb = side(c, d, b);
  if (opposite(ac, ad) && opposite(ca, cb)
    || ac === 0 && within(c, a, b) || ad === 0 && within(d, a, b)
    || ca === 0 && within(a, c, d) || cb === 0 && within(b, c, d)) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d),
    distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

/** A continuous swept-center certificate against caller-supplied closed obstacle segments. */
export function segmentSweepClear(a: Point, b: Point, obstacles: readonly SweepObstacle[]): boolean {
  const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
  const minZ = Math.min(a[1], b[1]), maxZ = Math.max(a[1], b[1]);
  for (const obstacle of obstacles) {
    const { a: c, b: d, clearance } = obstacle;
    // Axis separation is a lower bound on Euclidean separation, not a sampled shortcut.
    if (minX - Math.max(c[0], d[0]) > clearance || Math.min(c[0], d[0]) - maxX > clearance
      || minZ - Math.max(c[1], d[1]) > clearance || Math.min(c[1], d[1]) - maxZ > clearance) continue;
    const distance = segmentDistance(a, b, c, d);
    if (distance === 0 || distance < clearance) return false;
  }
  return true;
}
