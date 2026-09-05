import { InteriorError } from "../core/errors.js";
import { clipPolygonToRect, polygonArea, polygonBounds, type Point } from "../core/geom.js";
import type { Rng } from "../core/rng.js";
import type { BlueprintFloor, FloorKind, InteriorRequest, RoomKind } from "../core/types.js";
import { CORRIDOR, DOOR } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { FacadeSeats, facadeSlots } from "./facade-seats.js";
import { coreRectsOf } from "./pier-align.js";
import type { FloorFrame, PlanRoom } from "./plan-types.js";
import { RoomRegion } from "./room-region.js";
import { roomCoversRect, sharedRoomEdges } from "./room-shape.js";
import { doorBetween, MIN_STRETCH, type IdGen } from "./rooms.js";
import type { UvRect } from "./uv.js";

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

export interface FacadeRoomPlan { rooms: PlanRoom[]; sealed: UvRect[] }

/** Complete facade bays belong to one room; the shared remainder carries public routes. */
export function planFacadeRooms(request: InteriorRequest, floor: BlueprintFloor, kind: FloorKind,
  core: CorePlan, frame: FloorFrame, plate: Point[], outline: Point[], ids: IdGen, rng: Rng): FacadeRoomPlan {
  const occupied = [...coreRectsOf(core)];
  const rooms: PlanRoom[] = [];
  const corridorRect = { ...frame.corridor };
  const trim = Math.min(MIN_UNIT.endCommon, Math.max(0, (corridorRect.lu - 4) / 2));
  corridorRect.u += trim;
  corridorRect.lu -= trim * 2;
  const corridor: PlanRoom = { id: `f${floor.index < 0 ? `m${-floor.index}` : floor.index}-corridor`,
    kind: kind === "mall_floor" ? "concourse" : "corridor", rect: corridorRect,
    polygon: clipPolygonToRect(plate, toRect(corridorRect)), doors: [] };
  rooms.push(corridor);
  occupied.push(corridorRect);

  const program = UNIT_PROGRAM[kind];
  if (program) {
    const seats = new FacadeSeats(floor, core.frame, outline, request.blueprint.facade!);
    const bounds = polygonBounds(outline);
    const strips: [UvRect, "v0" | "v1"][] = [
      [{ u: bounds.x, v: bounds.z, lu: bounds.w, lv: frame.corridor.v - bounds.z }, "v1"],
      [{ u: bounds.x, v: core.vFace, lu: bounds.w, lv: bounds.z + bounds.d - core.vFace }, "v0"],
    ];
    for (const [strip, side] of strips) {
      if (strip.lv < MIN_UNIT.depth) continue;
      const cuts = seats.cuts(strip, side, MIN_UNIT.endCommon);
      const slots = facadeSlots(cuts, rng.range(8, 12), (low, high) => {
        const rect = { ...strip, u: low, lu: high - low };
        if (rect.lu < MIN_UNIT.width || occupied.some(cut => overlaps(rect, cut))) return false;
        const polygon = clipPolygonToRect(plate, toRect(rect));
        return Math.abs(polygonArea(polygon)) >= MIN_UNIT.area
          && Math.abs(polygonArea(polygon)) >= rect.lu * rect.lv * 0.9
          && fittedServices(rect, side, polygon).length > 0;
      });
      for (const [low, high] of slots) {
        const rect = { ...strip, u: low, lu: high - low };
        const polygon = clipPolygonToRect(plate, toRect(rect));
        const services = fittedServices(rect, side, polygon);
        const serviceRect = services[Math.floor(rng.next() * services.length)]!;
        const mainShape = new RoomRegion(polygon).subtract([serviceRect]);
        if (mainShape.length !== 1) throw new InteriorError("E_FLOOR_TOO_SMALL", "unit service separates its main room", floor.index);
        const unit = `f${floor.index}-unit-${rooms.length}`;
        const main: PlanRoom = { ...mainShape[0]!, id: ids.room(),
          kind: program.main, unit, doors: [] };
        const service: PlanRoom = { id: ids.room(), kind: program.service, rect: serviceRect, unit, doors: [] };
        doorBetween(service, main.id, main, ids);
        rooms.push(main, service);
        occupied.push(rect);
      }
    }
    if (!rooms.some(room => room.unit)) throw new InteriorError("E_FLOOR_TOO_SMALL", `facade bays cannot fit a ${program.main} unit with inboard ${program.service}`, floor.index);
  } else {
    addServices(SERVICES[kind] ?? [], rooms, occupied, plate, frame, ids, floor.index);
  }

  const common = new RoomRegion(plate).subtract(occupied)
    .map(shape => ({ ...shape, id: ids.room(), kind: MAIN[kind] ?? "lounge", doors: [] } as PlanRoom));
  if (!common.length) throw new InteriorError("E_FLOOR_TOO_SMALL", "floor has no shared facade and circulation space", floor.index);
  rooms.push(...common);
  for (const room of rooms) {
    if (room === corridor || room.unit && room.kind === program?.service) continue;
    const targets = [corridor, ...common.filter(other => other !== room)];
    const target = targets.find(other => sharedRoomEdges(room, other, plate).some(edge => edge.hi - edge.lo >= MIN_STRETCH));
    if (target) doorBetween(room, target.id, target, ids, room.unit ? 1 : 2, room.unit ? DOOR.single : DOOR.double);
  }
  return { rooms, sealed: [] };
}

function addServices(kinds: RoomKind[], rooms: PlanRoom[], occupied: UvRect[], plate: Point[],
  frame: FloorFrame, ids: IdGen, floorIndex: number): void {
  const bounds = polygonBounds(plate);
  for (const kind of kinds) {
    const size = kind === "executive_office" ? 6 : kind === "kitchen" || kind === "meeting" || kind === "locker_room" ? 4 : 3;
    let fitted: UvRect | undefined;
    for (const side of ["v1", "v0"] as const) {
      const v = side === "v1" ? frame.corridor.v - size : frame.corridor.v + CORRIDOR.width;
      for (let u = frame.corridor.u + MIN_UNIT.endCommon; u + size < frame.corridor.u + frame.corridor.lu; u += 0.5) {
        const rect = { u, v, lu: size, lv: size };
        const room = { rect: { u: bounds.x, v: bounds.z, lu: bounds.w, lv: bounds.d }, polygon: plate };
        if (occupied.some(other => overlaps(rect, other)) || !roomCoversRect(room, rect, 1)) continue;
        fitted = rect;
        break;
      }
      if (fitted) break;
    }
    if (!fitted) throw new InteriorError("E_FLOOR_TOO_SMALL", `floor cannot fit required ${kind} service room`, floorIndex);
    occupied.push(fitted);
    rooms.push({ id: ids.room(), kind, rect: fitted, doors: [] });
  }
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
