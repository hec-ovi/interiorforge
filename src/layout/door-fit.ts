import type { EdgeName } from "./plan-types.js";
import { roomCoversRect, type RoomShape, type RoomStretch } from "./room-shape.js";
import type { UvRect } from "./uv.js";

/** Clear floor a person needs on each side of a doorway, across its width and this deep. */
export const DOOR_APPROACH_DEPTH = 1.0;
/** Every pocket cassette slides half the opening plus its frame; this much wall must stand
 *  beside the opening on both sides, in both rooms, so the leaves have a solid pocket. */
export const POCKET_RETURN = 0.25;

/** The approach zone on one side of a door on `owner`'s `edge` at line `c`. `inside` is the
 *  owner's side; otherwise the room beyond the wall. */
export function approachZone(edge: EdgeName, c: number, at: number, width: number, depth: number, inside: boolean): UvRect {
  const inward = edge.endsWith("0") ? 1 : -1;
  const sign = inside ? inward : -inward;
  const lo = at - width / 2;
  return edge.startsWith("v")
    ? { u: lo, v: sign > 0 ? c : c - depth, lu: width, lv: depth }
    : { u: sign > 0 ? c : c - depth, v: lo, lu: depth, lv: width };
}

/** Unified door approach predicate (replaces the per-allocator copies for templates): a body
 *  can stand square in front of the opening on both sides. */
export function doorApproachFits(owner: RoomShape, other: RoomShape, edge: EdgeName, c: number, at: number,
  width: number, depth = DOOR_APPROACH_DEPTH): boolean {
  const w = Math.max(width, 0.9);
  return roomCoversRect(owner, approachZone(edge, c, at, w, depth, true))
    && roomCoversRect(other, approachZone(edge, c, at, w, depth, false));
}

/** Door centres on a stretch that leave room for both pocket cassettes beside the opening. */
export function pocketInterval(stretch: Pick<RoomStretch, "lo" | "hi">, width: number): [number, number] | null {
  const lo = stretch.lo + width + POCKET_RETURN, hi = stretch.hi - width - POCKET_RETURN;
  return hi >= lo - 1e-9 ? [lo, Math.max(lo, hi)] : null;
}
