import type { Point } from "../core/geom.js";
import { clipPolygonToRect, polygonArea } from "../core/geom.js";
import { SNAP } from "./constants.js";

/** Layout runs in uv space: a world frame rotated so u runs along the building's principal
 *  axis (its longest ground edge) and v across it. Pure rotation about +Y, no reflection,
 *  so CCW polygons stay CCW in both directions. */

export interface Frame {
  /** rotation of the frame's u axis in world, degrees around +Y */
  angleDeg: number;
  cos: number;
  sin: number;
}

export interface UvRect {
  u: number;
  v: number;
  lu: number;
  lv: number;
}

export function makeFrame(angleDeg: number): Frame {
  const rad = (angleDeg * Math.PI) / 180;
  return { angleDeg, cos: Math.cos(rad), sin: Math.sin(rad) };
}

export function worldToUv([x, z]: Point, f: Frame): Point {
  return [x * f.cos + z * f.sin, -x * f.sin + z * f.cos];
}

export function uvToWorld([u, v]: Point, f: Frame): Point {
  return [u * f.cos - v * f.sin, u * f.sin + v * f.cos];
}

export function toUvPolygon(poly: readonly Point[], f: Frame): Point[] {
  return poly.map((p) => worldToUv(p, f));
}

export function toWorldPolygon(poly: readonly Point[], f: Frame): Point[] {
  return poly.map((p) => uvToWorld(p, f));
}

export function uvRectCorners(r: UvRect): Point[] {
  return [[r.u, r.v], [r.u + r.lu, r.v], [r.u + r.lu, r.v + r.lv], [r.u, r.v + r.lv]];
}

export function uvRectCenter(r: UvRect): Point {
  return [r.u + r.lu / 2, r.v + r.lv / 2];
}

/** World axis-aligned bounding box of a uv rect (for grid iteration). */
export function uvRectWorldBounds(r: UvRect, f: Frame): { x: number; z: number; w: number; d: number } {
  const corners = uvRectCorners(r).map((p) => uvToWorld(p, f));
  const xs = corners.map((c) => c[0]);
  const zs = corners.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  return { x: minX, z: minZ, w: Math.max(...xs) - minX, d: Math.max(...zs) - minZ };
}

export function pointInUvRect([u, v]: Point, r: UvRect, margin = 0): boolean {
  return u >= r.u - margin && u <= r.u + r.lu + margin && v >= r.v - margin && v <= r.v + r.lv + margin;
}

/** Center-based world rect for the schema: axis-aligned in the frame, rotated about its
 *  own center by the floor's coreAngleDeg. */
export function uvRectToFrameRect(r: UvRect, f: Frame): { x: number; z: number; w: number; d: number } {
  const [cx, cz] = uvToWorld(uvRectCenter(r), f);
  return { x: cx - r.lu / 2, z: cz - r.lv / 2, w: r.lu, d: r.lv };
}

/** Numerical slack of the coverage test, relative to the rect's own area. Relative, so the
 *  answer composes: when every probe cell of a band passes, so does any rect inside it, and
 *  the corridor scan and the core fit check can never disagree. */
const COVER_EPS = 1e-9;

/** True when the whole rect lies inside the outline. The one geometric truth behind both
 *  the corridor band scan and the vertical core fit check. */
export function coversRect(uvOutline: readonly Point[], r: UvRect): boolean {
  const full = r.lu * r.lv;
  if (full <= 0) return false;
  const clipped = clipPolygonToRect(uvOutline, { x: r.u, z: r.v, w: r.lu, d: r.lv });
  return Math.abs(polygonArea(clipped)) >= full * (1 - COVER_EPS);
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
