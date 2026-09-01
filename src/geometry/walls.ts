import type { Point } from "../core/geom.js";
import { clipPolygonToRect } from "../core/geom.js";
import type { BlueprintFloor } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { WALL } from "../layout/constants.js";
import { doorUvPoint } from "../layout/plan-floor.js";
import type { PlanRoom } from "../layout/plan-types.js";
import type { Frame, UvRect } from "../layout/uv.js";
import { uvRectCorners, uvToWorld } from "../layout/uv.js";
import type { MaterialKeys } from "./materials.js";
import type { WallBands } from "./wall-detail.js";
import type { Exposed } from "./wall-detail.js";
import { layerBands } from "./wall-detail.js";

/** A hole in a wall line: `at` runs along the line in uv, y absolute. */
export interface WallHole {
  at: number;
  width: number;
  y0: number;
  y1: number;
}

/** Wall lines live in uv space: "H" runs along u at v = c, "V" along v at u = c. */
export interface UvWallHole {
  axis: "H" | "V";
  c: number;
  hole: WallHole;
}

interface WallLine {
  axis: "H" | "V";
  c: number;
  intervals: [number, number][];
  holes: WallHole[];
}

const LINING_THICKNESS = 0.08;
const LINING_INSET = 0.02; // keeps the lining off the shell skin, no coplanar faces

export function doorHeadHeight(leaves: number, floorHeight: number): number {
  const head = leaves >= 3 ? 2.4 : leaves === 2 ? 2.2 : 2.1;
  return Math.min(head, floorHeight - 0.3);
}

/** Interior walls of one floor: the union of room edges off the facade, with door holes.
 *  Extraction runs in uv space where rooms are axis-aligned; emission rotates to world. */
export function buildInteriorWalls(
  mb: MeshBuilder, keys: MaterialKeys, rooms: PlanRoom[], uvOutline: Point[], frame: Frame,
  elevation: number, wallTop: number, floorHeight: number, ceilingY: number, extraHoles: UvWallHole[],
): void {
  const lines = new Map<string, WallLine>();
  const lineFor = (axis: "H" | "V", c: number): WallLine => {
    const key = `${axis}:${c.toFixed(3)}`;
    let line = lines.get(key);
    if (!line) {
      line = { axis, c, intervals: [], holes: [] };
      lines.set(key, line);
    }
    return line;
  };

  for (const room of rooms) {
    const clipped = clipPolygonToRect(uvOutline, {
      x: room.rect.u, z: room.rect.v, w: room.rect.lu, d: room.rect.lv,
    });
    const poly = clipped.length >= 3 ? clipped : uvRectCorners(room.rect);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (onBoundary(mid, uvOutline)) continue;
      if (Math.abs(a[1] - b[1]) < 1e-6) {
        lineFor("H", a[1]).intervals.push([Math.min(a[0], b[0]), Math.max(a[0], b[0])]);
      } else if (Math.abs(a[0] - b[0]) < 1e-6) {
        lineFor("V", a[0]).intervals.push([Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
      }
      // other angles only occur on the facade, which the boundary test skipped
    }
    for (const door of room.doors) {
      if (door.to === "outside") continue; // hole handled by the facade lining
      const [u, v] = doorUvPoint(door, room);
      const head = elevation + doorHeadHeight(door.leaves, floorHeight);
      if (door.edge.startsWith("v")) {
        lineFor("H", v).holes.push({ at: u, width: door.width, y0: elevation, y1: head });
      } else {
        lineFor("V", u).holes.push({ at: v, width: door.width, y0: elevation, y1: head });
      }
    }
  }
  for (const extra of extraHoles) {
    lineFor(extra.axis, extra.c).holes.push(extra.hole);
  }

  const bands: WallBands = {
    y0: elevation, ceilingY,
    field: keys.wall(), accent: keys.accent(), trim: keys.trim(),
  };
  for (const line of lines.values()) {
    for (const [a, b] of mergeIntervals(line.intervals)) {
      const holes = line.holes.filter((h) => h.at > a && h.at < b);
      emitWallRun(mb, bands, frame, line, a, b, elevation, wallTop, holes);
    }
  }
}

function emitWallRun(
  mb: MeshBuilder, bands: WallBands, frame: Frame, line: WallLine, a: number, b: number,
  y0: number, y1: number, holes: WallHole[],
): void {
  const sorted = [...holes].sort((h1, h2) => h1.at - h2.at);
  let cursor = a;
  const solid = (s: number, e: number, sy0: number, sy1: number, exposed: Exposed = {}) => {
    if (e - s < 1e-3 || sy1 - sy0 < 1e-3) return;
    layerBands(bands, sy0, Math.min(sy1, y1), (material, proud, by0, by1, caps) => {
      const thickness = WALL + 2 * proud;
      const rect: UvRect = line.axis === "H"
        ? { u: s, v: line.c - thickness / 2, lu: e - s, lv: thickness }
        : { u: line.c - thickness / 2, v: s, lu: thickness, lv: e - s };
      mb.addPrism(material, uvRectCorners(rect).map((p) => uvToWorld(p, frame)), by0, by1, "world", caps);
    }, exposed);
  };
  for (const hole of sorted) {
    const h0 = Math.max(a, hole.at - hole.width / 2);
    const h1 = Math.min(b, hole.at + hole.width / 2);
    solid(cursor, h0, y0, y1);
    if (hole.y0 > y0) solid(h0, h1, y0, hole.y0, { top: true });
    if (hole.y1 < y1) solid(h0, h1, hole.y1, y1, { bottom: true });
    cursor = h1;
  }
  solid(cursor, b, y0, y1);
}

/** Facade lining: the interior face of the exterior wall, window and door holes included.
 *  Works on the world outline directly, any edge angle. */
export function buildFacadeLining(
  mb: MeshBuilder, keys: MaterialKeys, bpFloor: BlueprintFloor, wallTop: number, ceilingY: number,
): void {
  const bands: WallBands = {
    y0: bpFloor.elevation, ceilingY,
    field: keys.wall(), accent: keys.accent(), trim: keys.trim(),
  };
  const outline = bpFloor.outline;
  const y0 = bpFloor.elevation;
  for (let e = 0; e < outline.length; e++) {
    const p0 = outline[e]!;
    const p1 = outline[(e + 1) % outline.length]!;
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const dir: Point = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
    const inward: Point = [-dir[1], dir[0]];
    const base: Point = [p0[0] + inward[0] * LINING_INSET, p0[1] + inward[1] * LINING_INSET];
    const at = (t: number): Point => [base[0] + dir[0] * t, base[1] + dir[1] * t];

    const openings = bpFloor.openings
      .filter((o) => o.edge === e)
      .sort((o1, o2) => o1.offset - o2.offset);
    let cursor = 0;
    const piece = (t0: number, t1: number, py0: number, py1: number, exposed: Exposed = {}) => {
      if (t1 - t0 < 1e-3 || py1 - py0 < 1e-3) return;
      layerBands(bands, py0, Math.min(py1, wallTop), (material, proud, by0, by1, caps) => {
        mb.addSlab(material, at(t0), at(t1), LINING_THICKNESS + proud, by0, by1, caps);
      }, exposed);
    };
    for (const o of openings) {
      piece(cursor, o.offset, y0, wallTop);
      if (o.sill > 0) piece(o.offset, o.offset + o.width, y0, y0 + o.sill, { top: true });
      if (o.sill + o.height < wallTop - y0) {
        piece(o.offset, o.offset + o.width, y0 + o.sill + o.height, wallTop, { bottom: true });
      }
      cursor = o.offset + o.width;
    }
    piece(cursor, len, y0, wallTop);
  }
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]!.slice() as [number, number]];
  for (const [a, b] of sorted.slice(1)) {
    const last = out.at(-1)!;
    if (a <= last[1] + 1e-6) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function onBoundary(p: Point, outline: readonly Point[]): boolean {
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    if (distToSegment(p, a, b) < 0.04) return true;
  }
  return false;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
}
