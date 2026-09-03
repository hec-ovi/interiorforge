import type { LightFixture } from "../core/types.js";
import { DOOR } from "./constants.js";
import { furnitureUvRect } from "./navgrid.js";
import { doorUvPoint } from "./plan-floor.js";
import type { PlanDoor, PlanFurniture, PlanRoom } from "./plan-types.js";
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
    : Math.max(door.width / door.leaves, DOOR.clearance);
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

function overlaps(a: UvRect, b: UvRect): boolean {
  return a.u < b.u + b.lu && b.u < a.u + a.lu && a.v < b.v + b.lv && b.v < a.v + a.lv;
}

export interface ClearanceConflict {
  door: string;
  item: string;
  room: string;
}

/** Furniture and fixtures standing in a doorway. Empty on a finished floor. */
export function clearanceConflicts(
  rooms: PlanRoom[], furniture: readonly PlanFurniture[], lights: readonly LightFixture[] = [],
  toUv?: (light: LightFixture) => { u: number; v: number },
): ClearanceConflict[] {
  const zones = doorZonesByRoom(rooms);
  const out: ClearanceConflict[] = [];
  for (const item of furniture) {
    const rect = furnitureUvRect(item);
    for (const zone of zones.get(item.room) ?? []) {
      if (overlaps(rect, zone.rect)) out.push({ door: zone.door, item: item.id, room: item.room });
    }
  }
  if (toUv) {
    for (const light of lights) {
      if (light.position[1] >= DOOR.clearHeight) continue; // out of the way overhead
      const { u, v } = toUv(light);
      const rect: UvRect = { u: u - 0.15, v: v - 0.15, lu: 0.3, lv: 0.3 };
      for (const zone of zones.get(light.room) ?? []) {
        if (overlaps(rect, zone.rect)) out.push({ door: zone.door, item: light.id, room: light.room });
      }
    }
  }
  return out;
}

/** Drops whatever stands in a doorway. Returns how many pieces went; repair doors land after
 *  furnishing, so this runs again every time the validator adds one. */
export function clearDoorZones(rooms: PlanRoom[], furniture: PlanFurniture[]): number {
  const conflicts = new Set(clearanceConflicts(rooms, furniture).map((c) => c.item));
  if (conflicts.size === 0) return 0;
  for (let i = furniture.length - 1; i >= 0; i--) {
    if (conflicts.has(furniture[i]!.id)) furniture.splice(i, 1);
  }
  return conflicts.size;
}
