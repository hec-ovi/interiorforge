import type { Point, Rect } from "../core/geom.js";
import { polygonArea, polygonBounds, rectsOverlap } from "../core/geom.js";
import { triangulate } from "../core/triangulate.js";
import { InteriorError } from "../core/errors.js";

interface Patch {
  polygon: Point[];
  bounds: Rect;
}

/** Finished ceilings own their exposed plane. Concrete soffits retain only the uncovered
 *  area at that same exported height, including service rooms and changing floor plates. */
export class CeilingCoverage {
  private readonly planes = new Map<number, Patch[]>();

  add(polygon: Point[], elevation: number): void {
    const key = Math.fround(elevation);
    const patches = this.planes.get(key) ?? [];
    patches.push(...triangles(polygon));
    this.planes.set(key, patches);
  }

  exposed(polygon: Point[], elevation: number): Point[][] {
    const bounds = polygonBounds(polygon);
    const masks = (this.planes.get(Math.fround(elevation)) ?? [])
      .filter((mask) => rectsOverlap(bounds, mask.bounds));
    if (masks.length === 0) return [polygon];
    let remaining = triangles(polygon);
    for (const mask of masks) {
      remaining = remaining.flatMap((piece) => rectsOverlap(piece.bounds, mask.bounds)
        ? subtract(piece.polygon, mask.polygon).map(patch)
        : [piece]);
      if (remaining.length === 0) break;
    }
    return remaining.flatMap((piece) => triangles(piece.polygon).map((part) => part.polygon));
  }
}

function triangles(polygon: Point[]): Patch[] {
  const ring = cleanRing(polygon);
  const parts = triangulate(ring).map((indices) => patch(indices.map((i) => ring[i]!)));
  const expected = Math.abs(polygonArea(polygon));
  const actual = parts.reduce((area, part) => area + polygonArea(part.polygon), 0);
  if (Math.abs(expected - actual) > Math.max(1e-7, expected * 1e-8)) {
    throw new InteriorError("E_SHELL_BREACH", "ceiling coverage cannot triangulate the complete floor polygon");
  }
  return parts;
}

function patch(polygon: Point[]): Patch {
  const ring = cleanRing(polygon);
  const ccw = polygonArea(ring) >= 0 ? ring : ring.reverse();
  return { polygon: ccw, bounds: polygonBounds(ccw) };
}

/** Half-plane intersections can repeat a vertex or leave several points on one edge. */
function cleanRing(polygon: Point[]): Point[] {
  const ring = [...polygon];
  for (let changed = true; changed && ring.length >= 3;) {
    changed = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length]!, b = ring[i]!, c = ring[(i + 1) % ring.length]!;
      const ab: Point = [b[0] - a[0], b[1] - a[1]], bc: Point = [c[0] - b[0], c[1] - b[1]];
      const cross = ab[0] * bc[1] - ab[1] * bc[0];
      const length = Math.hypot(...ab) + Math.hypot(...bc);
      if (Math.abs(cross) <= 1e-10 * length && ab[0] * bc[0] + ab[1] * bc[1] >= -1e-12) {
        ring.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return ring;
}

/** Both polygons are convex. Each clipping edge contributes the outside part and passes
 *  only its inside part to the next edge, producing disjoint convex fragments. */
function subtract(subject: Point[], mask: Point[]): Point[][] {
  const outside: Point[][] = [];
  let inside = subject;
  for (let i = 0; i < mask.length && inside.length >= 3; i++) {
    const a = mask[i]!, b = mask[(i + 1) % mask.length]!;
    const split = splitAtEdge(inside, a, b);
    if (hasArea(split.outside)) outside.push(split.outside);
    inside = split.inside;
  }
  return outside;
}

function splitAtEdge(polygon: Point[], a: Point, b: Point): { inside: Point[]; outside: Point[] } {
  const inside: Point[] = [], outside: Point[] = [];
  const side = (p: Point): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!;
    const dp = side(p), dq = side(q);
    if (dp >= 0) inside.push(p);
    if (dp <= 0) outside.push(p);
    if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
      const t = dp / (dp - dq);
      const hit: Point = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
      inside.push(hit);
      outside.push(hit);
    }
  }
  return { inside, outside };
}

function hasArea(polygon: Point[]): boolean {
  return polygon.length >= 3 && Math.abs(polygonArea(polygon)) > 1e-8;
}
