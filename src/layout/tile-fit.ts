import type { Point } from "../core/geom.js";
import type { BlueprintFloor } from "../core/types.js";
import type { CorePlan } from "./core-plan.js";
import { Facade } from "./openings.js";
import { collectLines, coreRectsOf, endsOf, frozen, pointOn, type WallLine } from "./pier-align.js";
import type { PlanRoom } from "./plan-types.js";
import { sharedEdge } from "./rooms.js";
import type { UvRect } from "./uv.js";
import { uvToWorld } from "./uv.js";

/** The interior grid: half the exterior panel, the tile every floor and ceiling is laid in. */
export const TILE = 0.5;

export interface GridFit {
  moved: number;
}

/** The corner every tile counts from: the outline's low corner in the building frame. */
export function gridOrigin(uvOutline: readonly Point[]): Point {
  return [Math.min(...uvOutline.map((p) => p[0])), Math.min(...uvOutline.map((p) => p[1]))];
}

/**
 * Partitions stand on the interior grid: every movable wall line slides (a
 * quarter tile at most) onto the nearest grid line counted from the outline's
 * corner, so the tiles of floors and ceilings run whole from wall to wall and
 * meet the window borders the exterior put on the same grid. A wall on a pier
 * already sits on it; a wall against the core never moves; a slide never
 * carries a wall into an opening.
 */
export function fitPartitionsToGrid(
  rooms: PlanRoom[], sealed: UvRect[], bpFloor: BlueprintFloor, core: CorePlan, uvOutline: readonly Point[],
): GridFit {
  const facade = new Facade(bpFloor);
  const coreRects = coreRectsOf(core);
  const frame = core.frame;
  const origin = gridOrigin(uvOutline);
  let moved = 0;

  const crossings = (line: WallLine, c: number, ends: number[]): number =>
    ends.filter((along) => facade.crossedBy(uvToWorld(pointOn(line, c, along), frame))).length;

  for (const line of collectLines(rooms, sealed)) {
    const ends = endsOf(line);
    if (ends.length < 2) continue;
    // a line with rooms on one side only is the shell, and the shell stands where the exterior put it
    if (!line.edges.some((e) => e.side === "lo") || !line.edges.some((e) => e.side === "hi")) continue;
    if (frozen(line, ends, coreRects)) continue;

    const from = line.axis === "u" ? origin[0] : origin[1];
    const delta = round(from + Math.round((line.c - from) / TILE) * TILE - line.c);
    if (Math.abs(delta) < 1e-4) continue;

    const keeps = line.edges.every((e) => {
      const span = (line.axis === "u" ? e.rect.lu : e.rect.lv) + (e.side === "lo" ? -delta : delta);
      return span >= e.minSpan;
    });
    if (!keeps) continue;
    if (crossings(line, round(line.c + delta), ends) > crossings(line, line.c, ends)) continue;

    for (const e of line.edges) {
      if (line.axis === "u") {
        if (e.side === "lo") { e.rect.u = round(e.rect.u + delta); e.rect.lu = round(e.rect.lu - delta); }
        else e.rect.lu = round(e.rect.lu + delta);
      } else if (e.side === "lo") { e.rect.v = round(e.rect.v + delta); e.rect.lv = round(e.rect.lv - delta); }
      else e.rect.lv = round(e.rect.lv + delta);
    }
    moved++;
  }
  return { moved };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Doors follow their walls. A door records where it sits along the edge it was
 * cut in, and the alignment passes move edges after that, so a door can end up
 * past the stretch its two rooms still share: no hole would be cut and the
 * room would read walled off. Every room door is put back inside the shared
 * stretch, centred when it fell outside, narrowed only when the stretch is
 * shorter than the door.
 */
export function refitDoors(rooms: PlanRoom[]): number {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  let refit = 0;
  for (const room of rooms) {
    for (const door of room.doors) {
      const other = byId.get(door.to);
      if (!other) continue;
      const shared = sharedEdge(room.rect, other.rect);
      if (!shared) continue;
      const { edge, lo, hi } = shared;
      // a doorway narrower than the door beats a sealed room, down to half a metre
      const width = round(Math.max(0.5, Math.min(door.width, hi - lo - 0.2)));
      const inside = door.edge === edge && door.at - width / 2 >= lo + 0.1 - 1e-6 && door.at + width / 2 <= hi - 0.1 + 1e-6;
      if (inside && width === door.width) continue;
      door.edge = edge;
      door.width = round(width);
      door.at = round((lo + hi) / 2);
      refit++;
    }
  }
  return refit;
}
