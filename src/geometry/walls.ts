import type { Point } from "../core/geom.js";
import type { BlueprintFloor, FloorInterior } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { WALL } from "../layout/constants.js";
import type { MaterialKeys } from "./materials.js";

/** A hole in a wall line: `at` runs along the line, y absolute. */
export interface WallHole {
  at: number;
  width: number;
  y0: number;
  y1: number;
}

interface WallLine {
  /** "H" walls run along x at z = c; "V" walls run along z at x = c */
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

/** Interior walls of one floor: the union of room edges off the facade, with door holes. */
export function buildInteriorWalls(
  mb: MeshBuilder, keys: MaterialKeys, floor: FloorInterior, outline: Point[],
  extraHoles: { axis: "H" | "V"; c: number; hole: WallHole }[], wallTop: number,
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

  for (const room of floor.rooms) {
    const poly = room.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (onBoundary(mid, outline)) continue;
      if (Math.abs(a[1] - b[1]) < 1e-6) {
        lineFor("H", a[1]).intervals.push([Math.min(a[0], b[0]), Math.max(a[0], b[0])]);
      } else if (Math.abs(a[0] - b[0]) < 1e-6) {
        lineFor("V", a[0]).intervals.push([Math.min(a[1], b[1]), Math.max(a[1], b[1])]);
      }
      // diagonal interior edges cannot occur: rects clipped only by the facade
    }
    for (const door of room.doors) {
      if (door.to === "outside") continue; // hole handled by the facade lining
      const head = floor.elevation + doorHeadHeight(door.leaves, floor.height);
      if (door.angleDeg === 0 || door.angleDeg === 180) {
        lineFor("H", door.position[1]).holes.push({ at: door.position[0], width: door.width, y0: floor.elevation, y1: head });
      } else {
        lineFor("V", door.position[0]).holes.push({ at: door.position[1], width: door.width, y0: floor.elevation, y1: head });
      }
    }
  }
  for (const extra of extraHoles) {
    lineFor(extra.axis, extra.c).holes.push(extra.hole);
  }

  const material = keys.wall();
  for (const line of lines.values()) {
    for (const [a, b] of mergeIntervals(line.intervals)) {
      const holes = line.holes.filter((h) => h.at > a && h.at < b);
      emitWallRun(mb, material, line, a, b, floor.elevation, wallTop, holes);
    }
  }
}

function emitWallRun(
  mb: MeshBuilder, material: string, line: WallLine, a: number, b: number,
  y0: number, y1: number, holes: WallHole[],
): void {
  const sorted = [...holes].sort((h1, h2) => h1.at - h2.at);
  let cursor = a;
  const solid = (s: number, e: number, sy0: number, sy1: number) => {
    if (e - s < 1e-3 || sy1 - sy0 < 1e-3) return;
    if (line.axis === "H") mb.addBox(material, { x: s, z: line.c - WALL / 2, w: e - s, d: WALL }, sy0, sy1);
    else mb.addBox(material, { x: line.c - WALL / 2, z: s, w: WALL, d: e - s }, sy0, sy1);
  };
  for (const hole of sorted) {
    const h0 = Math.max(a, hole.at - hole.width / 2);
    const h1 = Math.min(b, hole.at + hole.width / 2);
    solid(cursor, h0, y0, y1);
    if (hole.y0 > y0) solid(h0, h1, y0, hole.y0);
    if (hole.y1 < y1) solid(h0, h1, hole.y1, y1);
    cursor = h1;
  }
  solid(cursor, b, y0, y1);
}

/** Facade lining: the interior face of the exterior wall, window and door holes included. */
export function buildFacadeLining(
  mb: MeshBuilder, keys: MaterialKeys, bpFloor: BlueprintFloor, wallTop: number,
): void {
  const material = keys.wall();
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
    const piece = (t0: number, t1: number, py0: number, py1: number) => {
      if (t1 - t0 < 1e-3 || py1 - py0 < 1e-3) return;
      mb.addSlab(material, at(t0), at(t1), LINING_THICKNESS, py0, py1);
    };
    for (const o of openings) {
      piece(cursor, o.offset, y0, wallTop);
      if (o.sill > 0) piece(o.offset, o.offset + o.width, y0, y0 + o.sill);
      if (o.sill + o.height < wallTop - y0) piece(o.offset, o.offset + o.width, y0 + o.sill + o.height, wallTop);
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
