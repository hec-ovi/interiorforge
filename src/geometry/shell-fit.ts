import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import { boundaryDistance, clipPolygonToConvex, distance } from "../core/geom.js";
import type { BlueprintFloor, Opening } from "../core/types.js";
import type { MeshBuilder } from "../glb/mesh-builder.js";
import { SOFFIT_DEPTH } from "../layout/constants.js";
import { SHELL_WALL } from "../layout/shell.js";

/** How the interior fits inside the shell: every vertex stays behind the shell's wall depth,
 *  except the reveal returns inside an opening, which run back to the skin clearance and
 *  keep out of the neighbouring walls. */

/** GLB positions are Float32. At city-scale coordinates their rounding is below 0.1 mm. */
const EPS = 1e-4;
/** an edge's wall zone reaches this far out through its skin: everything outside counts */
const OUTSIDE = 1e4;

/** One outline edge as a frame: `t` runs along it from its start, depth runs inward. */
export interface EdgeFrame {
  a: Point;
  len: number;
  dir: Point;
  inward: Point;
}

export function edgeFrame(outline: readonly Point[], e: number): EdgeFrame {
  const a = outline[e]!;
  const b = outline[(e + 1) % outline.length]!;
  const len = distance(a, b) || 1;
  const dir: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  return { a, len, dir, inward: [-dir[1], dir[0]] };
}

export function edgePoint(f: EdgeFrame, t: number, depth: number): Point {
  return [f.a[0] + f.dir[0] * t + f.inward[0] * depth, f.a[1] + f.dir[1] * t + f.inward[1] * depth];
}

function along(f: EdgeFrame, p: Point): number {
  return (p[0] - f.a[0]) * f.dir[0] + (p[1] - f.a[1]) * f.dir[1];
}

function across(f: EdgeFrame, p: Point): number {
  return (p[0] - f.a[0]) * f.inward[0] + (p[1] - f.a[1]) * f.inward[1];
}

/** The lining's hole for one opening, along its edge (t) and above the floor (y): the shell's
 *  opening shrunk by the recess, closed from either end where its reveal would stand in
 *  another edge's wall. A sill at floor level and a head at the ceiling stay put. */
export interface OpeningHole {
  t0: number;
  t1: number;
  y0: number;
  y1: number;
}

export function openingHole(floor: BlueprintFloor, o: Opening, wallDepth: number): OpeningHole {
  if (o.kind === "openFront") {
    const portal = o.portal!; // request validation requires it for this variant
    const side = (o.width - portal.clearWidth) / 2;
    const [r0, r1] = revealRun(floor.outline, o.edge, wallDepth);
    return {
      t0: Math.max(o.offset + side, r0),
      t1: Math.min(o.offset + o.width - side, r1),
      y0: 0,
      y1: portal.clearHeight,
    };
  }
  const top = o.sill + o.height;
  const [r0, r1] = revealRun(floor.outline, o.edge, wallDepth);
  return {
    t0: Math.max(o.offset + SHELL_WALL.recess, r0),
    t1: Math.min(o.offset + o.width - SHELL_WALL.recess, r1),
    y0: o.sill > EPS ? o.sill + SHELL_WALL.recess : 0,
    y1: top < floor.height - EPS ? top - SHELL_WALL.recess : floor.height,
  };
}

/** Along edge `e`, the run where a reveal may stand: its jamb, square to the edge from the
 *  skin clearance back to the wall depth, keeps out of every other edge's wall. The band the
 *  jambs sweep is clipped by each other wall zone; a clip reaching an end of the edge closes
 *  the run from that end. */
function revealRun(outline: readonly Point[], e: number, wallDepth: number): [number, number] {
  const f = edgeFrame(outline, e);
  const band = [
    edgePoint(f, 0, SHELL_WALL.skinClear), edgePoint(f, f.len, SHELL_WALL.skinClear),
    edgePoint(f, f.len, wallDepth), edgePoint(f, 0, wallDepth),
  ];
  const cuts: [number, number][] = [];
  for (let k = 0; k < outline.length; k++) {
    if (k === e) continue;
    const ts = clipPolygonToConvex(band, wallZone(edgeFrame(outline, k), wallDepth)).map((p) => along(f, p));
    if (ts.length > 0) cuts.push([Math.min(...ts), Math.max(...ts)]);
  }
  let t0 = 0;
  let t1 = f.len;
  for (let moved = true; moved;) {
    moved = false;
    for (const [lo, hi] of cuts) {
      if (lo <= t0 + EPS && hi > t0 + EPS) {
        t0 = hi;
        moved = true;
      }
      if (hi >= t1 - EPS && lo < t1 - EPS) {
        t1 = lo;
        moved = true;
      }
    }
  }
  return [t0, t1];
}

/** An edge's wall as the interior keeps out of it: the strip behind its skin to the wall
 *  depth, and everything outside through that skin. CCW. */
function wallZone(f: EdgeFrame, wallDepth: number): Point[] {
  return [edgePoint(f, 0, -OUTSIDE), edgePoint(f, f.len, -OUTSIDE), edgePoint(f, f.len, wallDepth), edgePoint(f, 0, wallDepth)];
}

function inWallZone(f: EdgeFrame, p: Point, wallDepth: number): boolean {
  const t = along(f, p);
  return t > EPS && t < f.len - EPS && across(f, p) < wallDepth - EPS;
}

function inHole(f: EdgeFrame, p: Point, y: number, hole: OpeningHole): boolean {
  if (y < hole.y0 - EPS || y > hole.y1 + EPS) return false;
  const t = along(f, p);
  return t >= hole.t0 - EPS && t <= hole.t1 + EPS;
}

/** One floor's shell as the fit check reads it: its edge frames and the holes its openings
 *  leave in the lining. */
class FloorShell {
  private readonly frames: EdgeFrame[];
  private readonly holes: { edge: number; hole: OpeningHole }[];

  constructor(readonly floor: BlueprintFloor, private readonly wallDepth: number) {
    this.frames = floor.outline.map((_, e) => edgeFrame(floor.outline, e));
    this.holes = floor.openings.map((o) => ({ edge: o.edge, hole: openingHole(floor, o, wallDepth) }));
  }

  /** True when a point `y` above the floor stands behind the shell wall, or in an opening's
   *  reveal and out of every other edge's wall. */
  holds(p: Point, y: number): boolean {
    const d = boundaryDistance(p, this.floor.outline);
    if (d >= this.wallDepth - EPS) return true;
    if (d < SHELL_WALL.skinClear - EPS) return false;
    return this.holes.some(({ edge, hole }) =>
      inHole(this.frames[edge]!, p, y, hole)
      && this.frames.every((f, k) => k === edge || !inWallZone(f, p, this.wallDepth)));
  }
}

/** Throws E_SHELL_BREACH when any vertex of the builder reaches the shell wall. A vertex on
 *  a floor boundary passes when either floor holds it and is reported against the upper one;
 *  one beyond the lowest soffit or the top floor's ceiling is read against that end floor. */
export function assertInsideShell(mb: MeshBuilder, floors: BlueprintFloor[], wallDepth: number): void {
  const shells = [...floors]
    .sort((a, b) => a.elevation - b.elevation)
    .map((f) => new FloorShell(f, wallDepth));
  const lowest = shells[0]!;
  const top = shells.at(-1)!;
  for (const slot of mb.materials()) {
    const pos = mb.getGroup(slot)!.positions;
    for (let i = 0; i < pos.length; i += 3) {
      const p: Point = [pos[i]!, pos[i + 2]!];
      const y = pos[i + 1]!;
      let candidates = shells.filter(({ floor }) => y >= floor.elevation - SOFFIT_DEPTH - EPS && y <= floor.elevation + floor.height + EPS);
      if (candidates.length === 0) candidates = [y < lowest.floor.elevation ? lowest : top];
      if (candidates.some((s) => s.holds(p, y - s.floor.elevation))) continue;
      throw new InteriorError(
        "E_SHELL_BREACH",
        `${slot} vertex (${p[0].toFixed(3)}, ${y.toFixed(3)}, ${p[1].toFixed(3)}) reaches the shell wall`,
        candidates.at(-1)!.floor.index,
      );
    }
  }
}
