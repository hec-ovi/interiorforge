import type { Point, Rect } from "../core/geom.js";
import { SNAP } from "./constants.js";

/** Layout runs in uv space: u along the corridor axis, v across it.
 *  axis "x": u = x, v = z. axis "z": u = z, v = x. Pure coordinate swap, no rotation. */

export type Axis = "x" | "z";

export interface UvRect {
  u: number;
  v: number;
  lu: number;
  lv: number;
}

export function toUvPoint(p: Point, axis: Axis): Point {
  return axis === "x" ? [p[0], p[1]] : [p[1], p[0]];
}

export function toWorldPoint(p: Point, axis: Axis): Point {
  return axis === "x" ? [p[0], p[1]] : [p[1], p[0]];
}

export function toWorldRect(r: UvRect, axis: Axis): Rect {
  return axis === "x"
    ? { x: r.u, z: r.v, w: r.lu, d: r.lv }
    : { x: r.v, z: r.u, w: r.lv, d: r.lu };
}

export function toUvRect(r: Rect, axis: Axis): UvRect {
  return axis === "x"
    ? { u: r.x, v: r.z, lu: r.w, lv: r.d }
    : { u: r.z, v: r.x, lu: r.d, lv: r.w };
}

export function toUvPolygon(poly: readonly Point[], axis: Axis): Point[] {
  return poly.map((p) => toUvPoint(p, axis));
}

export function snap(value: number): number {
  return Math.round(value / SNAP) * SNAP;
}

export function snapDown(value: number): number {
  return Math.floor(value / SNAP + 1e-9) * SNAP;
}

export function snapUp(value: number): number {
  return Math.ceil(value / SNAP - 1e-9) * SNAP;
}
