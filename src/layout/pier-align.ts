import type { Point } from "../core/geom.js";
import { clipPolygonToRect, polygonBounds } from "../core/geom.js";
import type { BlueprintFloor, Facade as BlueprintFacade } from "../core/types.js";
import { ROOM, SPINE_KINDS } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { Facade } from "./openings.js";
import type { PlanRoom } from "./plan-types.js";
import type { UvRect } from "./uv.js";
import { uvToWorld } from "./uv.js";

/** Partitions land on the piers between the facade's windows and doors. A wall line whose
 *  end falls inside an opening slides sideways to the nearest position that clears every
 *  opening it touches, as far as the rooms either side can give. */

const STEP = 0.1;
const MAX_SHIFT = 2.0;
/** Room spans below this stop a shift; a corridor keeps more than a bathroom. */
const MIN_SPAN: Record<string, number> = { bathroom: 1.4, toilets: 1.4, storage: 1.4 };
const MIN_SPINE_SPAN = 2.0;
const SEALED_MIN_SPAN = 0.5;

export type Axis = "u" | "v";

export interface Edge {
  rect: UvRect;
  /** the rect's low edge sits on the line, or its high edge */
  side: "lo" | "hi";
  minSpan: number;
}

export interface WallLine {
  axis: Axis;
  c: number;
  edges: Edge[];
}

function minSpanOf(room: PlanRoom): number {
  if (SPINE_KINDS.has(room.kind)) return MIN_SPINE_SPAN;
  return MIN_SPAN[room.kind] ?? ROOM.minDim;
}

/** The shafts a wall can be locked to. The service stub is a reservation, not geometry. */
export function coreRectsOf(core: CorePlan): UvRect[] {
  const rects = [core.stairA, core.riser, ...core.elevators.map((e) => e.rect)];
  if (core.stairB) rects.push(core.stairB);
  return rects;
}

/** A wall line that runs against a core rect never moves: elevator doors, stair entries and
 *  the shaft row hang off it. Coordinate alone is not enough; the line has to actually reach
 *  along that rect. */
export function frozen(line: WallLine, ends: number[], rects: UvRect[]): boolean {
  const lo = ends[0]!;
  const hi = ends.at(-1)!;
  return rects.some((r) => {
    const [c0, c1, s0, s1] = line.axis === "u"
      ? [r.u, r.u + r.lu, r.v, r.v + r.lv]
      : [r.v, r.v + r.lv, r.u, r.u + r.lu];
    const onEdge = Math.abs(c0 - line.c) < 1e-6 || Math.abs(c1 - line.c) < 1e-6;
    return onEdge && Math.min(hi, s1) - Math.max(lo, s0) > 0.05;
  });
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function collectLines(rooms: PlanRoom[], sealed: UvRect[]): WallLine[] {
  const lines = new Map<string, WallLine>();
  const add = (axis: Axis, c: number, edge: Edge): void => {
    const key = `${axis}:${round(c).toFixed(3)}`;
    let line = lines.get(key);
    if (!line) {
      line = { axis, c: round(c), edges: [] };
      lines.set(key, line);
    }
    line.edges.push(edge);
  };
  const forRect = (rect: UvRect, minSpan: number): void => {
    add("u", rect.u, { rect, side: "lo", minSpan });
    add("u", rect.u + rect.lu, { rect, side: "hi", minSpan });
    add("v", rect.v, { rect, side: "lo", minSpan });
    add("v", rect.v + rect.lv, { rect, side: "hi", minSpan });
  };
  for (const room of rooms) forRect(room.rect, minSpanOf(room));
  for (const rect of sealed) forRect(rect, SEALED_MIN_SPAN);
  return [...lines.values()].sort((a, b) => a.axis.localeCompare(b.axis) || a.c - b.c);
}

/** Where a wall line reaches: the ends of the spans its rooms cover along it. */
export function endsOf(line: WallLine): number[] {
  const spans = line.edges.map((e) =>
    line.axis === "u"
      ? [e.rect.v, e.rect.v + e.rect.lv]
      : [e.rect.u, e.rect.u + e.rect.lu],
  );
  const ends = new Set<number>();
  for (const [lo, hi] of spans) {
    ends.add(round(lo!));
    ends.add(round(hi!));
  }
  return [...ends].sort((a, b) => a - b);
}

export function pointOn(line: WallLine, c: number, along: number): Point {
  return line.axis === "u" ? [c, along] : [along, c];
}

export interface PierAlignment {
  moved: number;
  /** contacts still inside an opening after the pass */
  unresolved: number;
}

/** Slides interior wall lines onto facade piers, in place. Deterministic: lines are visited
 *  in a fixed order and the smallest clearing shift wins, ties to the lower side. */
export function alignPartitionsToPiers(
  rooms: PlanRoom[], sealed: UvRect[], bpFloor: BlueprintFloor, core: CorePlan,
  uvOutline: readonly Point[], blueprintFacade?: BlueprintFacade,
): PierAlignment {
  const facade = new Facade(bpFloor, blueprintFacade);
  const coreRects = coreRectsOf(core);
  const frame = core.frame;
  let moved = 0;
  let unresolved = 0;

  /** Where the wall really ends: rooms are clipped to the outline, so the facade contact is
   *  wherever the line leaves the plate, not where the rect stops. Recomputed per candidate
   *  position, since a diagonal facade moves the contact with the wall. */
  const endsAt = (line: WallLine, c: number, rectEnds: number[]): number[] => {
    const lo = rectEnds[0]!;
    const hi = rectEnds.at(-1)!;
    const thin = line.axis === "u"
      ? { x: c - 0.005, z: lo, w: 0.01, d: hi - lo }
      : { x: lo, z: c - 0.005, w: hi - lo, d: 0.01 };
    const clipped = clipPolygonToRect(uvOutline, thin);
    if (clipped.length < 3) return rectEnds;
    const b = polygonBounds(clipped);
    const span = line.axis === "u" ? [b.z, b.z + b.d] : [b.x, b.x + b.w];
    return [...new Set([...rectEnds, round(span[0]!), round(span[1]!)])];
  };

  const crossings = (line: WallLine, c: number, rectEnds: number[]): number => {
    let n = 0;
    for (const along of endsAt(line, c, rectEnds)) {
      if (facade.crossedBy(uvToWorld(pointOn(line, c, along), frame))) n++;
    }
    return n;
  };

  for (const line of collectLines(rooms, sealed)) {
    const ends = endsOf(line);
    if (ends.length < 2) continue;
    // a line running along the facade is the facade itself, not a partition
    const mid = (ends[0]! + ends.at(-1)!) / 2;
    if (facade.contact(uvToWorld(pointOn(line, line.c, mid), frame))) continue;
    const before = crossings(line, line.c, ends);
    if (before === 0) continue;
    // a wall against a shaft cannot leave it: moving it would open a gap or cut the shaft
    if (frozen(line, ends, coreRects)) {
      unresolved += before;
      continue;
    }

    const fits = (delta: number): boolean =>
      line.edges.every((e) => {
        const span = line.axis === "u"
          ? (e.side === "lo" ? e.rect.lu - delta : e.rect.lu + delta)
          : (e.side === "lo" ? e.rect.lv - delta : e.rect.lv + delta);
        return span >= e.minSpan;
      });

    // clear every end if a position allows it; otherwise take the fewest crossings, and on
    // a tie the smallest shift, so a wall spanning two facades still lands on one pier
    let best: number | null = null;
    let bestScore = before;
    for (let d = STEP; d <= MAX_SHIFT + 1e-9; d += STEP) {
      for (const delta of [-round(d), round(d)]) {
        if (!fits(delta)) continue;
        const score = crossings(line, round(line.c + delta), ends);
        if (score < bestScore) {
          bestScore = score;
          best = delta;
        }
      }
      if (bestScore === 0) break;
    }
    unresolved += bestScore;
    if (best === null) continue;
    for (const e of line.edges) {
      if (line.axis === "u") {
        if (e.side === "lo") {
          e.rect.u = round(e.rect.u + best);
          e.rect.lu = round(e.rect.lu - best);
        } else {
          e.rect.lu = round(e.rect.lu + best);
        }
      } else if (e.side === "lo") {
        e.rect.v = round(e.rect.v + best);
        e.rect.lv = round(e.rect.lv - best);
      } else {
        e.rect.lv = round(e.rect.lv + best);
      }
    }
    line.c = round(line.c + best);
    moved++;
  }

  clampDoors(rooms);
  return { moved, unresolved };
}

/** A moved wall may leave a door hanging past the end of its edge: pull it back inside. */
function clampDoors(rooms: PlanRoom[]): void {
  for (const room of rooms) {
    const r = room.rect;
    for (const door of room.doors) {
      const [lo, hi] = door.edge.startsWith("v") ? [r.u, r.u + r.lu] : [r.v, r.v + r.lv];
      const half = door.width / 2 + 0.1;
      if (hi - lo < door.width + 0.2) continue; // too short to hold it; validation repairs
      door.at = round(Math.max(lo + half, Math.min(hi - half, door.at)));
    }
  }
}
