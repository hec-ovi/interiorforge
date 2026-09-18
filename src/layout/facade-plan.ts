import { InteriorError } from "../core/errors.js";
import { clipPolygonToRect, polygonArea, polygonBounds, type Point } from "../core/geom.js";
import type { Rng } from "../core/rng.js";
import type { BlueprintFloor, FloorKind, InteriorRequest, RoomKind } from "../core/types.js";
import { DOOR, ROOM } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { FacadeSeats, facadeSlots } from "./facade-seats.js";
import { FacadeAccess } from "./facade-access.js";
import { coreRectsOf } from "./pier-align.js";
import type { FloorFrame, PlanRoom } from "./plan-types.js";
import { RoomRegion } from "./room-region.js";
import { roomCoversRect, sharedRoomEdges } from "./room-shape.js";
import { doorBetween, MIN_STRETCH, type IdGen } from "./rooms.js";
import type { UvRect } from "./uv.js";
import { fitServiceProgram, type ProgramChange } from "./service-program.js";

const UNIT_PROGRAM: Partial<Record<FloorKind, { main: RoomKind; service: RoomKind }>> = {
  apartment: { main: "studio_main", service: "bathroom" },
  residence_studio: { main: "studio_main", service: "bathroom" },
  hotel_rooms: { main: "bedroom", service: "bathroom" },
  mall_floor: { main: "sales_floor", service: "storage" },
};
const MAIN: Partial<Record<FloorKind, RoomKind>> = {
  lobby: "reception", restaurant: "dining_area", coffee_shop: "dining_area", retail: "sales_floor",
  gym: "gym_floor", terrace: "terrace_open", parking: "parking_area", mechanical: "mechanical_room",
  office: "office_open", corpo_office: "office_open", mall_floor: "concourse",
};
const SERVICES: Partial<Record<FloorKind, RoomKind[]>> = {
  lobby: ["toilets", "storage"], retail: ["toilets", "storage"],
  restaurant: ["kitchen", "toilets", "storage"], coffee_shop: ["toilets", "storage"],
  gym: ["locker_room", "toilets", "storage"], office: ["toilets", "meeting"],
  corpo_office: ["toilets", "meeting", "executive_office"],
};
const MIN_UNIT = { width: 6, depth: 6.4, area: 36, serviceSize: 3, endCommon: 3 };

export interface FacadeRoomPlan { rooms: PlanRoom[]; sealed: UvRect[]; changes: ProgramChange[] }

/** Complete facade bays belong to one room; the shared remainder carries public routes. */
export function planFacadeRooms(request: InteriorRequest, floor: BlueprintFloor, kind: FloorKind,
  core: CorePlan, frame: FloorFrame, plate: Point[], outline: Point[], ids: IdGen, rng: Rng): FacadeRoomPlan {
  const occupied = [...coreRectsOf(core)];
  const rooms: PlanRoom[] = [];
  const changes: ProgramChange[] = [];
  const corridorRect = { ...frame.corridor };
  const trim = Math.min(MIN_UNIT.endCommon, Math.max(0, (corridorRect.lu - 4) / 2));
  // Mechanical service rooms surround a corridor that owns every core front.
  const startTrim = kind === "mechanical" ? Math.min(trim, Math.max(0, core.u0 - corridorRect.u)) : trim;
  const coreEnd = frame.stairB?.u ?? core.u1;
  const endTrim = kind === "mechanical" ? Math.min(trim, Math.max(0, corridorRect.u + corridorRect.lu - coreEnd)) : trim;
  corridorRect.u += startTrim;
  corridorRect.lu -= startTrim + endTrim;
  const corridor: PlanRoom = { id: `f${floor.index < 0 ? `m${-floor.index}` : floor.index}-corridor`,
    kind: kind === "mall_floor" ? "concourse" : "corridor", rect: corridorRect,
    polygon: clipPolygonToRect(plate, toRect(corridorRect)), doors: [] };
  rooms.push(corridor);
  occupied.push(corridorRect);

  const program = UNIT_PROGRAM[kind];
  if (program) {
    const seats = new FacadeSeats(floor, core.frame, outline, request.blueprint.facade!);
    const access = new FacadeAccess(frame);
    const bounds = polygonBounds(plate);
    const strips: [UvRect, "v0" | "v1"][] = [
      [{ u: bounds.x, v: bounds.z, lu: bounds.w, lv: frame.corridor.v - bounds.z }, "v1"],
      [{ u: bounds.x, v: core.vFace, lu: bounds.w, lv: bounds.z + bounds.d - core.vFace }, "v0"],
    ];
    for (const [strip, side] of strips) {
      if (strip.lv < MIN_UNIT.depth) continue;
      const cuts = seats.cuts(strip, side, MIN_UNIT.endCommon);
      const slots = facadeSlots(cuts, rng.range(8, 12), (low, high) => {
        const rect = access.unit(strip, side, low, high);
        if (rect.lu < MIN_UNIT.width || rect.lv < MIN_UNIT.depth || occupied.some(cut => overlaps(rect, cut))) return false;
        const polygon = clipPolygonToRect(plate, toRect(rect));
        return Math.abs(polygonArea(polygon)) >= MIN_UNIT.area
          && Math.abs(polygonArea(polygon)) >= rect.lu * rect.lv * 0.9
          && fittedServices(rect, side, polygon).length > 0;
      });
      for (const [low, high] of slots) {
        const rect = access.unit(strip, side, low, high);
        const polygon = clipPolygonToRect(plate, toRect(rect));
        const services = fittedServices(rect, side, polygon);
        const serviceRect = services[Math.floor(rng.next() * services.length)]!;
        const mainShape = new RoomRegion(polygon).subtract([serviceRect]);
        if (mainShape.length !== 1) continue;
        const unit = `f${floor.index}-unit-${rooms.length}`;
        const main: PlanRoom = { ...mainShape[0]!, id: ids.room(),
          kind: program.main, unit, doors: [] };
        const service: PlanRoom = { id: ids.room(), kind: program.service, rect: serviceRect, unit, doors: [] };
        doorBetween(service, main.id, main, ids);
        rooms.push(main, service);
        occupied.push(rect);
      }
    }
  } else {
    const services = fitServiceProgram(SERVICES[kind] ?? [], occupied, plate, { ...frame, corridor: corridorRect }, ids);
    rooms.push(...services.rooms);
    occupied.push(...services.rooms.map(room => room.rect));
    changes.push(...services.changes);
  }

  const singleUnit = program && !rooms.some(room => room.unit);
  if (singleUnit) changes.push({ kind: program.service, requested: [MIN_UNIT.serviceSize, MIN_UNIT.serviceSize], fitted: null });
  const common = new RoomRegion(plate).subtract(occupied)
    .map(shape => ({ ...shape, id: ids.room(), kind: singleUnit ? program.main : MAIN[kind] ?? "lounge",
      ...(singleUnit ? { unit: `f${floor.index}-unit-main` } : {}), doors: [] } as PlanRoom));
  if (!common.some(room => Math.abs(polygonArea(room.polygon!)) >= ROOM.minArea
    && room.rect.lu >= ROOM.minDim && room.rect.lv >= ROOM.minDim)) {
    throw new InteriorError("E_FLOOR_TOO_SMALL", "floor cannot hold one room beside its circulation and core", floor.index);
  }
  rooms.push(...common);
  for (const room of rooms) {
    if (room === corridor || room.unit && room.kind === program?.service) continue;
    const targets = [corridor, ...common.filter(other => other !== room)];
    const target = targets.find(other => sharedRoomEdges(room, other, plate).some(edge => edge.hi - edge.lo >= MIN_STRETCH));
    if (target) doorBetween(room, target.id, target, ids, room.unit ? 1 : 2, room.unit ? DOOR.single : DOOR.double);
  }
  return { rooms, sealed: [], changes };
}

function fittedServices(rect: UvRect, side: "v0" | "v1", polygon: Point[]): UvRect[] {
  return [rect.u, rect.u + rect.lu - MIN_UNIT.serviceSize].map(u => ({ u,
    v: side === "v0" ? rect.v : rect.v + rect.lv - MIN_UNIT.serviceSize,
    lu: MIN_UNIT.serviceSize, lv: MIN_UNIT.serviceSize }))
    .filter(service => roomCoversRect({ rect, polygon }, service));
}

function overlaps(a: UvRect, b: UvRect): boolean {
  return Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u) > 1e-6
    && Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v) > 1e-6;
}

function toRect(rect: UvRect) { return { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv }; }
