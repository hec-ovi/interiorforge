import type { Point } from "../core/geom.js";
import type { BlueprintFloor, Facade as BlueprintFacade, FloorInterior, Opening } from "../core/types.js";
import { WALL } from "./constants.js";

/** Facade openings as a keep-off rule for interior walls: a partition may only meet the
 *  facade on a pier, never across a window or a door. */

/** Half the width of a legacy opening jamb. Explicit facade grids supersede this fallback. */
const MEMBER_HALF = 0.06;
/** Half the partition plus Exterior's required safety space on each side. */
export const PARTITION_HALF = WALL / 2 + 0.02;
/** A wall end this close to an outline edge is touching the facade. */
const CONTACT_EPS = 0.12;

/** Openings that connect a room to exterior walkable space. */
export function isExteriorConnection(opening: Opening): boolean {
  return opening.kind === "door" || opening.kind === "balconyDoor" || opening.kind === "openFront";
}

/** Street-facing openings that orient the ground-floor plan. */
export function isStreetAccess(opening: { kind: string }): boolean {
  return opening.kind === "door" || opening.kind === "openFront";
}

export class Facade {
  constructor(
    private readonly floor: BlueprintFloor,
    private readonly facade?: BlueprintFacade,
  ) {}

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

  /** The facade reservation a wall arriving here would violate. When Exterior publishes a
   *  grid, partitionAnchors are the sole permitted full-thickness endpoints. */
  reservationAt(p: Point, margin = PARTITION_HALF): { id: string; opening?: Opening } | null {
    const hit = this.contact(p);
    if (!hit) return null;
    const grid = this.facade?.grids?.find((entry) => entry.floor === this.floor.index && entry.edge === hit.edge);
    if (grid) {
      const allowed = grid.partitionAnchors.some((anchor) => {
        const half = anchor.width / 2;
        return hit.t - margin >= anchor.offset - half - 1e-6
          && hit.t + margin <= anchor.offset + half + 1e-6;
      });
      if (allowed) return null;
      const opening = this.floor.openings.find((candidate) =>
        candidate.edge === hit.edge
        && hit.t + margin > candidate.offset
        && hit.t - margin < candidate.offset + candidate.width);
      return { id: opening?.id ?? `facade:${this.floor.index}:${hit.edge}:unreserved`, ...(opening ? { opening } : {}) };
    }

    // Older blueprints without facade grids retain the opening-jamb compatibility rule.
    for (const opening of this.floor.openings) {
      if (opening.edge !== hit.edge) continue;
      const end = opening.offset + opening.width;
      if (Math.abs(hit.t - opening.offset) <= MEMBER_HALF || Math.abs(hit.t - end) <= MEMBER_HALF) continue;
      if (hit.t + margin <= opening.offset || hit.t - margin >= end) continue;
      return { id: opening.id, opening };
    }
    return null;
  }

  crossedBy(p: Point, margin = PARTITION_HALF): string | null {
    return this.reservationAt(p, margin)?.id ?? null;
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
export function partitionConflicts(
  floor: FloorInterior, bpFloor: BlueprintFloor, blueprintFacade?: BlueprintFacade,
): PartitionConflict[] {
  const facade = new Facade(bpFloor, blueprintFacade);
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
