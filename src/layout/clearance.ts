import { DOOR } from "./constants.js";
import { doorUvPoint } from "./plan-floor.js";
import type { PlanDoor, PlanRoom } from "./plan-types.js";
import type { UvRect } from "./uv.js";

/** Nothing stands in a doorway. Every door, entrance included, keeps a clear zone: the leaf
 *  swing plus DOOR.clearance of approach on both sides, over the full head height. */

export interface DoorZone {
  door: string;
  rect: UvRect;
}

/** Keep-clear box of one door, in the owning room's uv space. */
export function doorZone(door: PlanDoor, room: PlanRoom): UvRect {
  const [u, v] = doorUvPoint(door, room);
  const across = door.openFront
    ? Math.max(door.openFront.clearDepth, DOOR.clearance)
    : Math.max(door.clearDepth ?? door.width / door.leaves, DOOR.clearance);
  const along = door.width / 2 + DOOR.jamb;
  if (door.openFront) {
    const rad = (door.openFront.angleDeg * Math.PI) / 180;
    const du = Math.abs(Math.cos(rad)) * along + Math.abs(Math.sin(rad)) * across;
    const dv = Math.abs(Math.sin(rad)) * along + Math.abs(Math.cos(rad)) * across;
    return { u: u - du, v: v - dv, lu: 2 * du, lv: 2 * dv };
  }
  return door.edge.startsWith("v")
    ? { u: u - along, v: v - across, lu: 2 * along, lv: 2 * across }
    : { u: u - across, v: v - along, lu: 2 * across, lv: 2 * along };
}

/** Every door's zone, listed against the room it opens into as well as the one that owns it. */
export function doorZonesByRoom(rooms: PlanRoom[]): Map<string, DoorZone[]> {
  const map = new Map<string, DoorZone[]>();
  const add = (roomId: string, zone: DoorZone): void => {
    const list = map.get(roomId) ?? [];
    list.push(zone);
    map.set(roomId, list);
  };
  for (const room of rooms) {
    for (const door of room.doors) {
      const zone = { door: door.id, rect: doorZone(door, room) };
      add(room.id, zone);
      if (door.to !== "outside") add(door.to, zone);
    }
  }
  return map;
}
