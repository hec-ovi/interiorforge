import type { Point } from "../core/geom.js";
import type { BlueprintFloor, FloorInterior } from "../core/types.js";
import { WALL } from "./constants.js";

/** Facade openings as a keep-off rule for interior walls: a partition may only meet the
 *  facade on a pier, never across a window or a door. */

/** Half a partition plus the reveal a wall needs beside a frame. */
/** Half the width of a mullion or jamb: a wall this close to an opening's boundary stands on the member. */
const MEMBER_HALF = 0.06;
const WALL_MARGIN = WALL / 2 + 0.06;
/** A wall end this close to an outline edge is touching the facade. */
const CONTACT_EPS = 0.12;

export class Facade {
  constructor(private readonly floor: BlueprintFloor) {}

  /** Where a point sits on the outline, or null when it is not on the facade at all. */
  contact(p: Point): { edge: number; t: number } | null {
    const outline = this.floor.outline;
    for (let e = 0; e < outline.length; e++) {
      const a = outline[e]!;
      const b = outline[(e + 1) % outline.length]!;
      const abx = b[0] - a[0];
      const abz = b[1] - a[1];
      const len2 = abx * abx + abz * abz;
      if (len2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
      const dist = Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
      if (dist <= CONTACT_EPS) return { edge: e, t: t * Math.sqrt(len2) };
    }
    return null;
  }

  /** The opening a wall arriving at this point would cross, if any. A wall that lands on an
   *  opening's boundary meets the frame member there (a mullion between two bays, a jamb), so
   *  on a curtain wall partitions fall on the mullion lines and never mid-pane. */
  crossedBy(p: Point, margin = WALL_MARGIN): string | null {
    const hit = this.contact(p);
    if (!hit) return null;
    for (const opening of this.floor.openings) {
      if (opening.edge !== hit.edge) continue;
      const end = opening.offset + opening.width;
      if (Math.abs(hit.t - opening.offset) <= MEMBER_HALF || Math.abs(hit.t - end) <= MEMBER_HALF) continue;
      if (hit.t + margin <= opening.offset || hit.t - margin >= end) continue;
      return opening.id;
    }
    return null;
  }
}

export interface PartitionConflict {
  room: string;
  opening: string;
  /** where the wall meets the facade */
  at: Point;
}

/** Interior walls that end inside a window or door of the facade. Empty on a good floor:
 *  partitions land on the piers between the blueprint's openings. */
export function partitionConflicts(floor: FloorInterior, bpFloor: BlueprintFloor): PartitionConflict[] {
  const facade = new Facade(bpFloor);
  const out: PartitionConflict[] = [];
  const seen = new Set<string>();
  for (const room of floor.rooms) {
    const poly = room.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      // a wall running along the facade is the facade lining, not a partition
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const along = facade.contact(mid);
      for (const end of [a, b]) {
        const hit = facade.contact(end);
        if (!hit || (along && along.edge === hit.edge)) continue;
        const opening = facade.crossedBy(end, WALL / 2);
        if (!opening) continue;
        const key = `${room.id}|${opening}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ room: room.id, opening, at: end });
      }
    }
  }
  return out;
}
