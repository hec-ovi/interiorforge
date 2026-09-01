import type { Point } from "./geom.js";
import { isCcw } from "./geom.js";

/** Ear-clipping triangulation of a simple polygon (CW or CCW input).
 *  Returns index triples wound CCW in the XZ plane. Deterministic. */
export function triangulate(poly: readonly Point[]): [number, number, number][] {
  const n = poly.length;
  if (n < 3) return [];
  const idx = [...Array(n).keys()];
  if (!isCcw(poly)) idx.reverse();

  const tris: [number, number, number][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length]!;
      const b = idx[i]!;
      const c = idx[(i + 1) % idx.length]!;
      if (isEar(poly, idx, a, b, c)) {
        tris.push([a, b, c]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) break; // degenerate input; emit what we have
  }
  if (idx.length === 3) tris.push([idx[0]!, idx[1]!, idx[2]!]);
  return tris;
}

function isEar(poly: readonly Point[], idx: number[], a: number, b: number, c: number): boolean {
  const [ax, az] = poly[a]!;
  const [bx, bz] = poly[b]!;
  const [cx, cz] = poly[c]!;
  const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  if (cross <= 1e-12) return false; // reflex or collinear
  for (const i of idx) {
    if (i === a || i === b || i === c) continue;
    if (pointInTriangle(poly[i]!, [ax, az], [bx, bz], [cx, cz])) return false;
  }
  return true;
}

function pointInTriangle([px, pz]: Point, a: Point, b: Point, c: Point): boolean {
  const s1 = (b[0] - a[0]) * (pz - a[1]) - (b[1] - a[1]) * (px - a[0]);
  const s2 = (c[0] - b[0]) * (pz - b[1]) - (c[1] - b[1]) * (px - b[0]);
  const s3 = (a[0] - c[0]) * (pz - c[1]) - (a[1] - c[1]) * (px - c[0]);
  return s1 >= -1e-12 && s2 >= -1e-12 && s3 >= -1e-12;
}
