import type { Point } from "../core/geom.js";
import type { Anchor, FloorInterior } from "../core/types.js";
import { DOOR } from "../layout/constants.js";

/** Doorways are for walking through. An NPC standing in one blocks the room, so no anchor
 *  lands in a door swing, its threshold, or the approach in front of a street entrance. */

/** How far inside an entrance the nearest standing spot may be. */
export const ENTRANCE_STANDOFF = 1.5;

interface Zone {
  door: string;
  at: Point;
  /** unit vector along the wall, and across it */
  along: Point;
  across: Point;
  halfWidth: number;
  depth: number;
}

export class DoorKeepOut {
  private readonly zones: Zone[] = [];

  constructor(floor: FloorInterior) {
    for (const room of floor.rooms) {
      for (const door of room.doors) {
        const rad = (door.angleDeg * Math.PI) / 180;
        const along: Point = [Math.cos(rad), Math.sin(rad)];
        this.zones.push({
          door: door.id,
          at: door.position,
          along,
          across: [-along[1], along[0]],
          halfWidth: door.width / 2 + DOOR.jamb,
          depth: door.kind === "openFront" || door.to === "outside"
            ? Math.max(ENTRANCE_STANDOFF, door.clearDepth ?? 0)
            : Math.max(door.width / door.leaves, DOOR.clearance),
        });
      }
    }
  }

  /** The door this point would stand in, if any. */
  blockedBy(p: Point): string | null {
    for (const z of this.zones) {
      const dx = p[0] - z.at[0];
      const dz = p[1] - z.at[1];
      const along = Math.abs(dx * z.along[0] + dz * z.along[1]);
      const across = Math.abs(dx * z.across[0] + dz * z.across[1]);
      if (along <= z.halfWidth && across <= z.depth) return z.door;
    }
    return null;
  }

  clear(p: Point): boolean {
    return this.blockedBy(p) === null;
  }
}

export interface AnchorConflict {
  anchor: string;
  door: string;
}

/** Anchors standing in a doorway. Empty on a finished floor. */
export function anchorConflicts(floor: FloorInterior, anchors: readonly Anchor[]): AnchorConflict[] {
  const keepOut = new DoorKeepOut(floor);
  const out: AnchorConflict[] = [];
  for (const anchor of anchors) {
    if (anchor.floor !== floor.floor) continue;
    const door = keepOut.blockedBy(anchor.position);
    if (door) out.push({ anchor: anchor.id, door });
  }
  return out;
}
