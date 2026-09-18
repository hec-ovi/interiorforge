import { polygonBounds, type Point } from "../core/geom.js";
import type { RoomKind } from "../core/types.js";
import { CORRIDOR, ROOM, SNAP } from "./constants.js";
import type { FloorFrame, PlanRoom } from "./plan-types.js";
import { roomArea, roomCoversRect } from "./room-shape.js";
import { RoomRegion } from "./room-region.js";
import type { IdGen } from "./rooms.js";
import type { UvRect } from "./uv.js";

export interface ProgramChange {
  kind: RoomKind;
  requested: [number, number];
  fitted: [number, number] | null;
}

/** Reduce optional space first, retaining toilets for the last fitting attempt. */
const REDUCTION_ORDER: RoomKind[] = ["executive_office", "meeting", "storage", "locker_room", "kitchen", "toilets"];
const minimumSize = Math.max(ROOM.minDim, Math.sqrt(ROOM.minArea));
const requestedSize = (kind: RoomKind): number => kind === "executive_office" ? 6
  : kind === "kitchen" || kind === "meeting" || kind === "locker_room" ? 4 : 3;

/** Try complete programs before reducing one service at a time on the construction grid. */
export function fitServiceProgram(kinds: readonly RoomKind[], occupied: readonly UvRect[], plate: Point[],
  frame: FloorFrame, ids: IdGen): { rooms: PlanRoom[]; changes: ProgramChange[] } {
  const sizes = new Map(kinds.map(kind => [kind, requestedSize(kind)]));
  const fit = (): PlanRoom[] | null => {
    const fitted: PlanRoom[] = [];
    for (const kind of kinds) {
      const size = sizes.get(kind)!;
      if (!size) continue;
      const rect = fitService(size, [...occupied, ...fitted.map(room => room.rect)], plate, frame);
      if (!rect) return null;
      fitted.push({ id: "", kind, rect, doors: [] });
    }
    const common = new RoomRegion(plate).subtract([...occupied, ...fitted.map(room => room.rect)]);
    return common.some(room => roomArea(room) >= ROOM.minArea
      && room.rect.lu >= ROOM.minDim && room.rect.lv >= ROOM.minDim) ? fitted : null;
  };
  let rooms = fit();
  for (const kind of REDUCTION_ORDER) {
    if (rooms) break;
    if (!sizes.has(kind)) continue;
    while (!rooms && sizes.get(kind)! > 0) {
      const next = sizes.get(kind)! - SNAP;
      sizes.set(kind, next >= minimumSize ? next : 0);
      rooms = fit();
    }
  }
  return {
    rooms: (rooms ?? []).map(room => ({ ...room, id: ids.room() })),
    changes: REDUCTION_ORDER.flatMap(kind => {
      const size = sizes.get(kind), requested = requestedSize(kind);
      return size === undefined || size === requested ? [] : [{ kind,
        requested: [requested, requested] as [number, number],
        fitted: size ? [size, size] as [number, number] : null }];
    }),
  };
}

function fitService(size: number, occupied: readonly UvRect[], plate: Point[], frame: FloorFrame): UvRect | null {
  const bounds = polygonBounds(plate);
  const room = { rect: { u: bounds.x, v: bounds.z, lu: bounds.w, lv: bounds.d }, polygon: plate };
  for (const side of ["v1", "v0"] as const) {
    const v = side === "v1" ? frame.corridor.v - size : frame.corridor.v + CORRIDOR.width;
    for (let u = frame.corridor.u + 3; u + size < frame.corridor.u + frame.corridor.lu; u += SNAP) {
      const rect = { u, v, lu: size, lv: size };
      if (occupied.some(other => Math.min(rect.u + size, other.u + other.lu) - Math.max(rect.u, other.u) > 1e-6
        && Math.min(rect.v + size, other.v + other.lv) - Math.max(rect.v, other.v) > 1e-6)) continue;
      if (roomCoversRect(room, rect, 1)) return rect;
    }
  }
  return null;
}
