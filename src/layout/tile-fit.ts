import type { Point } from "../core/geom.js";
import type { BlueprintFloor } from "../core/types.js";
import type { CorePlan } from "./core-plan.js";
import { Facade } from "./openings.js";
import { collectLines, coreRectsOf, endsOf, frozen, pointOn, type WallLine } from "./pier-align.js";
import type { PlanDoor, PlanRoom } from "./plan-types.js";
import { BAND_CLEAR, MIN_STRETCH, doorWidthOn, sharedStretch } from "./rooms.js";
import { sharedRoomEdges, type RoomShape } from "./room-shape.js";
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
 * stretch that a partition really covers (the part on `plate`, since an
 * irregular outline cuts room rects and the facade lining stands beyond it),
 * centred when it fell outside, narrowed only when the stretch is shorter than
 * the door. A pair with no such stretch loses the door, and the reachability
 * pass cuts a working one elsewhere.
 */
export function refitDoors(rooms: PlanRoom[], plate: readonly Point[]): number {
  const byId = new Map(rooms.map((r) => [r.id, r]));
  let refit = 0;
  for (const room of rooms) {
    room.doors = room.doors.filter((door) => {
      const other = byId.get(door.to);
      if (!other) return true;
      const fit = fitDoorToStretch(door, room, other, plate);
      if (fit !== "kept") refit++;
      return fit !== null;
    });
  }
  return refit;
}

/** Puts one door inside the stretch its two rooms really share on the plate, narrowing it
 *  to the 0.7 m minimum. `null` when the pair shares no such
 *  stretch: no wall stands there to hole. */
export function fitDoorToStretch(
  door: PlanDoor, from: UvRect | RoomShape, to: UvRect | RoomShape, plate: readonly Point[],
): "kept" | "moved" | null {
  const owner = "rect" in from ? from : { rect: from };
  const target = "rect" in to ? to : { rect: to };
  const polygonal = owner.polygon || owner.holes?.length || target.polygon || target.holes?.length;
  const stretches = polygonal ? sharedRoomEdges(owner, target, plate).filter(s => s.hi - s.lo >= MIN_STRETCH) : [];
  const stretch = polygonal
    ? stretches.find(s => s.edge === door.edge && door.at >= s.lo && door.at <= s.hi
      && (!door.position || Math.abs(door.position[s.edge.startsWith("v") ? 1 : 0] - s.c) < 1e-6)) ?? stretches[0]
    : sharedStretch(owner.rect, target.rect, plate, door.at);
  if (!stretch) return null;
  const { edge, lo, hi } = stretch;
  // use the full clear width where the wall carries it, with the contract minimum on short walls
  const width = doorWidthOn(hi - lo, door.width);
  const inside = door.edge === edge && door.at - width / 2 >= lo + BAND_CLEAR - 1e-6
    && door.at + width / 2 <= hi - BAND_CLEAR + 1e-6;
  const c = "c" in stretch && typeof stretch.c === "number" ? stretch.c : undefined;
  const position = c === undefined ? undefined : edge.startsWith("v") ? [door.at, c] as Point : [c, door.at] as Point;
  const samePosition = position === undefined || !!door.position && position.every((n, i) => Math.abs(n - door.position![i]!) < 1e-6);
  if (inside && width === door.width && samePosition) return "kept";
  door.edge = edge;
  door.width = round(width);
  door.at = round((lo + hi) / 2);
  if (c !== undefined) door.position = edge.startsWith("v") ? [door.at, c] : [c, door.at];
  return "moved";
}
