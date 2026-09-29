import type { Point } from "../../core/geom.js";
import type { EdgeName } from "../plan-types.js";
import type { UvRect } from "../uv.js";

/** The template's local frame inside a target rectangle: v = 0 on the entry edge, v growing
 *  into the space, u along the entry edge; `mirrored` flips u. A pure quarter turn (plus the
 *  optional flip) of the core frame, so rectangles stay rectangles at every building angle. */
export interface LocalFrame {
  rect: UvRect;
  entryEdge: EdgeName;
  mirrored: boolean;
  /** local width along the entry edge and depth into the space */
  width: number;
  depth: number;
}

const NORMAL: Record<EdgeName, Point> = { u0: [-1, 0], u1: [1, 0], v0: [0, -1], v1: [0, 1] };

export function localFrame(rect: UvRect, entryEdge: EdgeName, mirrored: boolean): LocalFrame {
  const alongU = entryEdge === "v0" || entryEdge === "v1";
  return { rect, entryEdge, mirrored, width: alongU ? rect.lu : rect.lv, depth: alongU ? rect.lv : rect.lu };
}

/** Local point -> core uv. Exact at the rectangle bounds (no micron gaps). */
export function toUv(frame: LocalFrame, [x0, y]: Point): Point {
  const { rect: r } = frame;
  const x = frame.mirrored ? frame.width - x0 : x0;
  switch (frame.entryEdge) {
    case "v0": return [r.u + x, r.v + y];
    case "v1": return [r.u + r.lu - x, r.v + r.lv - y];
    case "u0": return [r.u + y, r.v + r.lv - x];
    case "u1": return [r.u + r.lu - y, r.v + x];
  }
}

/** Core uv point -> local. */
export function toLocal(frame: LocalFrame, [u, v]: Point): Point {
  const { rect: r } = frame;
  let x: number, y: number;
  switch (frame.entryEdge) {
    case "v0": x = u - r.u; y = v - r.v; break;
    case "v1": x = r.u + r.lu - u; y = r.v + r.lv - v; break;
    case "u0": y = u - r.u; x = r.v + r.lv - v; break;
    case "u1": y = r.u + r.lu - u; x = v - r.v; break;
  }
  return [frame.mirrored ? frame.width - x : x, y];
}

/** Direction of a local vector in uv (linear part only). */
function dirToUv(frame: LocalFrame, [dx0, dy]: Point): Point {
  const dx = frame.mirrored ? -dx0 : dx0;
  switch (frame.entryEdge) {
    case "v0": return [dx, dy];
    case "v1": return [-dx, -dy];
    case "u0": return [dy, -dx];
    case "u1": return [-dy, dx];
  }
}

function edgeOfNormal([nu, nv]: Point): EdgeName {
  return Math.abs(nu) > 0.5 ? nu > 0 ? "u1" : "u0" : nv > 0 ? "v1" : "v0";
}

/** The uv edge a local edge of a local rectangle becomes. */
export function edgeToUv(frame: LocalFrame, edge: EdgeName): EdgeName {
  return edgeOfNormal(dirToUv(frame, NORMAL[edge]));
}

export function edgeToLocal(frame: LocalFrame, edge: EdgeName): EdgeName {
  return (["u0", "u1", "v0", "v1"] as EdgeName[]).find(local => edgeToUv(frame, local) === edge)!;
}

/** Local rectangle [x0, x1] × [y0, y1] -> uv rectangle, snapped exactly onto the target
 *  bounds where it meets them. */
export function rectToUv(frame: LocalFrame, x0: number, x1: number, y0: number, y1: number): UvRect {
  const a = toUv(frame, [x0, y0]), b = toUv(frame, [x1, y1]);
  const r = frame.rect;
  const snapU = (value: number) => snapTo(value, [r.u, r.u + r.lu]);
  const snapV = (value: number) => snapTo(value, [r.v, r.v + r.lv]);
  const u0 = snapU(Math.min(a[0], b[0])), u1 = snapU(Math.max(a[0], b[0]));
  const v0 = snapV(Math.min(a[1], b[1])), v1 = snapV(Math.max(a[1], b[1]));
  return { u: u0, v: v0, lu: u1 - u0, lv: v1 - v0 };
}

function snapTo(value: number, anchors: number[]): number {
  for (const anchor of anchors) if (Math.abs(value - anchor) < 1e-6) return anchor;
  return Math.round(value * 1e6) / 1e6;
}

/** Local rotation (back to the local v0 wall = 0) -> uv rotation (back to uv v0 = 0). */
export function rotationToUv(frame: LocalFrame, rotationDeg: 0 | 90 | 180 | 270): 0 | 90 | 180 | 270 {
  // a piece faces away from its back wall: rotation 0 faces +v, 90 faces +u, 180 -v, 270 -u
  const facing: Record<number, Point> = { 0: [0, 1], 90: [1, 0], 180: [0, -1], 270: [-1, 0] };
  const [fu, fv] = dirToUv(frame, facing[rotationDeg]!);
  return Math.abs(fu) > 0.5 ? fu > 0 ? 90 : 270 : fv > 0 ? 0 : 180;
}

/** Coordinate of local axis position along uv: which uv axis local x (or y) runs on, and
 *  the uv coordinate of local 0 plus its direction, for grid phasing. */
export function axisToUv(frame: LocalFrame, axis: "u" | "v"): { uvAxis: 0 | 1; origin: number; sign: 1 | -1 } {
  const zero = toUv(frame, [0, 0]);
  const dir = dirToUv(frame, axis === "u" ? [1, 0] : [0, 1]);
  const uvAxis: 0 | 1 = Math.abs(dir[0]) > 0.5 ? 0 : 1;
  return { uvAxis, origin: zero[uvAxis], sign: dir[uvAxis]! > 0 ? 1 : -1 };
}
