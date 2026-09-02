import type { Point } from "../core/geom.js";
import { clipPolygonToRect, distanceToSegment } from "../core/geom.js";
import type { Rng } from "../core/rng.js";
import type { RoomKind } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { WALL } from "../layout/constants.js";
import { doorUvPoint } from "../layout/plan-floor.js";
import type { EdgeName, PlanRoom } from "../layout/plan-types.js";
import type { Frame, UvRect } from "../layout/uv.js";
import { toWorldPolygon, uvRectCorners } from "../layout/uv.js";
import type { MaterialKeys } from "./materials.js";
import type { Exposed, WallBands } from "./wall-detail.js";
import { layerBands } from "./wall-detail.js";

/** Casing members around a doorway: this wide, standing this proud of each wall face. */
const CASING = { width: 0.08, proud: 0.02 };

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

/** A stretch of one wall line covered by a room's edge. `accent` marks the room's feature
 *  wall, which takes the accent tone over its whole stretch, corner to corner. */
interface WallInterval {
  a: number;
  b: number;
  accent: boolean;
}

interface WallLine {
  axis: "H" | "V";
  c: number;
  intervals: WallInterval[];
  holes: WallHole[];
}

/** One interior segment of a room's clipped outline, and which edge of the room it lies on. */
interface RoomSegment {
  axis: "H" | "V";
  c: number;
  a: number;
  b: number;
  edge: EdgeName | null;
}

/** Door heads: 2.5 m for one or two leaves, 3 m for wider portals. A space too low for that
 *  carries the opening up to a lintel of one casing band under its ceiling, so a low storey
 *  gets a tall opening rather than a stubby one. */
export function doorHeadHeight(leaves: number, clearHeight: number): number {
  const head = leaves >= 3 ? 3.0 : 2.5;
  return Math.min(head, clearHeight - 2 * CASING.width);
}

/** Interior walls of one floor: the union of room edges off the facade, with door holes.
 *  Extraction runs in uv space where rooms are axis-aligned; emission clips every band to
 *  `envelope` (the plate inside the facade lining) and rotates to world. */
export function buildInteriorWalls(
  mb: MeshBuilder, keys: MaterialKeys, rooms: PlanRoom[], uvOutline: Point[], envelope: Point[],
  frame: Frame, elevation: number, wallTop: number, ceilingY: number,
  program: RoomKind, extraHoles: UvWallHole[], rng: Rng,
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
    const segments = roomSegments(room, uvOutline);
    const accent = accentEdge(room, segments, rng);
    for (const s of segments) {
      lineFor(s.axis, s.c).intervals.push({ a: s.a, b: s.b, accent: s.edge !== null && s.edge === accent });
    }
    for (const door of room.doors) {
      if (door.to === "outside") continue; // hole handled by the facade lining
      const [u, v] = doorUvPoint(door, room);
      const head = elevation + doorHeadHeight(door.leaves, ceilingY - elevation);
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
    field: keys.wall(), accent: keys.accent(program), trim: keys.trim(),
    casing: keys.door(), frame: keys.windowFrame(),
  };
  for (const line of lines.values()) {
    const accents = mergeIntervals(line.intervals.filter((i) => i.accent));
    for (const [a, b] of mergeIntervals(line.intervals)) {
      for (const piece of accentPieces(a, b, accents, line.holes)) {
        const holes = line.holes.filter((h) => h.at > piece.a && h.at < piece.b);
        const run = piece.accent ? { ...bands, field: bands.accent } : bands;
        emitWallRun(mb, run, frame, envelope, line, piece.a, piece.b, elevation, wallTop, holes);
      }
    }
  }
}

/** The interior segments of a room's outline: its clipped polygon edges off the facade,
 *  each tagged with the room edge it lies on (a clip cut lies on none). */
function roomSegments(room: PlanRoom, uvOutline: readonly Point[]): RoomSegment[] {
  const r = room.rect;
  const clipped = clipPolygonToRect(uvOutline, { x: r.u, z: r.v, w: r.lu, d: r.lv });
  const poly = clipped.length >= 3 ? clipped : uvRectCorners(r);
  const on = (c: number, at: number): boolean => Math.abs(c - at) < 1e-6;
  const out: RoomSegment[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (onBoundary(mid, uvOutline)) continue;
    if (Math.abs(a[1] - b[1]) < 1e-6) {
      const edge = on(a[1], r.v) ? "v0" : on(a[1], r.v + r.lv) ? "v1" : null;
      out.push({ axis: "H", c: a[1], a: Math.min(a[0], b[0]), b: Math.max(a[0], b[0]), edge });
    } else if (Math.abs(a[0] - b[0]) < 1e-6) {
      const edge = on(a[0], r.u) ? "u0" : on(a[0], r.u + r.lu) ? "u1" : null;
      out.push({ axis: "V", c: a[0], a: Math.min(a[1], b[1]), b: Math.max(a[1], b[1]), edge });
    }
    // other angles only occur on the facade, which the boundary test skipped
  }
  return out;
}

/** The room's feature wall: one interior edge without a door, picked by seed, so a room
 *  reads as colour-blocked rather than four identical planes. Small rooms take none. */
function accentEdge(room: PlanRoom, segments: RoomSegment[], rng: Rng): EdgeName | null {
  if (room.rect.lu < 1.6 || room.rect.lv < 1.6) return null;
  const doors = new Set(room.doors.map((d) => d.edge));
  const edges: EdgeName[] = ["v0", "v1", "u0", "u1"];
  const candidates = edges.filter((e) => !doors.has(e) && segments.some((s) => s.edge === e));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng.range(0, candidates.length))]!;
}

interface RunPiece {
  a: number;
  b: number;
  accent: boolean;
}

/** Splits a wall run into its accent and plain stretches. A cut lands on the partition line
 *  where the accent room's edge ends, never inside a doorway, so the tone changes at a
 *  corner or a jamb and never mid surface. */
function accentPieces(
  a: number, b: number, accents: [number, number][], holes: WallHole[],
): RunPiece[] {
  const cuts = new Map<string, number>();
  for (const [s, e] of accents) {
    for (const raw of [s, e]) {
      const c = outOfHoles(raw, holes);
      if (c > a + 1e-6 && c < b - 1e-6) cuts.set(c.toFixed(6), c);
    }
  }
  const bounds = [a, ...[...cuts.values()].sort((x, y) => x - y), b];
  const pieces: RunPiece[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const [s, e] = [bounds[i]!, bounds[i + 1]!];
    if (e - s < 1e-3) continue;
    const mid = (s + e) / 2;
    pieces.push({ a: s, b: e, accent: accents.some(([x, y]) => mid > x && mid < y) });
  }
  return pieces;
}

/** A material boundary inside a doorway would cut the opening in two: push it to the jamb. */
function outOfHoles(c: number, holes: WallHole[]): number {
  for (const h of holes) {
    const [lo, hi] = [h.at - h.width / 2, h.at + h.width / 2];
    if (c > lo && c < hi) return c - lo < hi - c ? lo : hi;
  }
  return c;
}

function emitWallRun(
  mb: MeshBuilder, bands: WallBands, frame: Frame, envelope: Point[], line: WallLine,
  a: number, b: number, y0: number, y1: number, holes: WallHole[],
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
      // a run ending on the facade is cut flush with the lining, whatever the facade's angle
      const footprint = clipPolygonToRect(envelope, { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv });
      if (footprint.length < 3) return;
      mb.addPrism(material, toWorldPolygon(footprint, frame), by0, by1, "world", caps);
    }, exposed);
  };
  // a casing member: a box on the wall line standing proud of both faces, clipped like the wall
  const member = (s: number, e: number, my0: number, my1: number) => {
    if (e - s < 1e-3 || my1 - my0 < 1e-3) return;
    const thickness = WALL + 2 * CASING.proud;
    const rect: UvRect = line.axis === "H"
      ? { u: s, v: line.c - thickness / 2, lu: e - s, lv: thickness }
      : { u: line.c - thickness / 2, v: s, lu: thickness, lv: e - s };
    const footprint = clipPolygonToRect(envelope, { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv });
    if (footprint.length >= 3) mb.addPrism(bands.casing, toWorldPolygon(footprint, frame), my0, my1, "world");
  };
  for (const hole of sorted) {
    const h0 = Math.max(a, hole.at - hole.width / 2);
    const h1 = Math.min(b, hole.at + hole.width / 2);
    solid(cursor, h0, y0, y1);
    if (hole.y0 > y0) solid(h0, h1, y0, hole.y0, { top: true });
    if (hole.y1 < y1) solid(h0, h1, hole.y1, y1, { bottom: true });
    // the doorway's casing: two jambs and a head
    member(h0 - CASING.width, h0, hole.y0, hole.y1 + CASING.width);
    member(h1, h1 + CASING.width, hole.y0, hole.y1 + CASING.width);
    member(h0, h1, hole.y1, hole.y1 + CASING.width);
    cursor = h1;
  }
  solid(cursor, b, y0, y1);
}

function mergeIntervals(intervals: WallInterval[]): [number, number][] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].map((i) => [i.a, i.b] as [number, number]).sort((a, b) => a[0] - b[0]);
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
    if (distanceToSegment(p, outline[i]!, outline[(i + 1) % outline.length]!) < 0.04) return true;
  }
  return false;
}
