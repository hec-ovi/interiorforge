import { InteriorError } from "../core/errors.js";
import { clipPolygonToRect, polygonArea, polygonBounds, type Point } from "../core/geom.js";
import type { Rng } from "../core/rng.js";
import type { BlueprintFloor, FloorKind, InteriorRequest, RoomKind } from "../core/types.js";
import { BODY_CLEAR, DOOR, ROOM } from "./constants.js";
import { elevatorWaitUv, stairEntryUv, type CorePlan } from "./core-plan.js";
import { FacadeSeats, facadeSlots } from "./facade-seats.js";
import { FacadeAccess } from "./facade-access.js";
import { approachKeepouts } from "./openings.js";
import { facadeDepth } from "./shell.js";
import { coreRectsOf } from "./pier-align.js";
import type { FloorFrame, PlanRoom } from "./plan-types.js";
import { RoomRegion } from "./room-region.js";
import { roomCoversRect, sharedRoomEdges } from "./room-shape.js";
import { doorBetween, MIN_STRETCH, type IdGen } from "./rooms.js";
import type { UvRect } from "./uv.js";
import { fitServiceProgram, type ProgramChange } from "./service-program.js";
import { interiorRecipe } from '../architecture/recipes.js';
import { residentialEnvelope, residentialProgram, residentialTarget } from './residential-program.js';
import { planResidentialGround } from './ground-program.js';
import { planPerimeterResidential } from './perimeter-residential.js';
import { CORPORATE_SERVICE_SIZES, isCorporate } from '../styles/corporate/index.js';
import { planCapsuleResidential } from '../styles/capsule/layout.js';
import { absorbDamagedSlivers, damagedCorridorRect, isDamagedResidential, planDamagedResidential } from '../styles/damaged/layout.js';
import { damagedDwellingProgram } from '../styles/damaged/dwelling-program.js';
import { fitDamagedGroundPublicDoors, planDamagedGround } from '../styles/damaged/ground-program.js';

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
  core: CorePlan, frame: FloorFrame, plate: Point[], outline: Point[], ids: IdGen, rng: Rng,
  previous = false): FacadeRoomPlan {
  // Keep the stable core datum. The extra clear public width comes from the
  // floor allocation in front of it, not from moving stairs or lift shafts.
  if (request.building.type === 'residential' && ['rich', 'high_rich'].includes(request.building.tier)
    && core.mode === 'compact' && ['lobby', 'apartment', 'residence_studio'].includes(kind) && frame.corridor.lv < 3.5) {
    const extra = 3.5 - frame.corridor.lv;
    frame = { ...frame, corridor: { ...frame.corridor, v: frame.corridor.v - extra, lv: 3.5 },
      south: { ...frame.south, lv: frame.south.lv - extra } };
  }
  const occupied = [...coreRectsOf(core)];
  const rooms: PlanRoom[] = [];
  const privateInternal = new Set<string>();
  let zonedGround = false;
  const changes: ProgramChange[] = [];
  const corridorRect = damagedCorridorRect(request, frame, plate);
  const trim = Math.min(MIN_UNIT.endCommon, Math.max(0, (corridorRect.lu - 4) / 2));
  // The corridor owns every core front: a trimmed end would leave a stair or lift door
  // standing on its end wall, with no floor to approach it from.
  const fronts = [stairEntryUv(core, "a"), ...(core.stairB ? [stairEntryUv(core, "b")] : []),
    ...core.elevators.map((_, index) => elevatorWaitUv(core, index))].map(point => point[0]);
  const startTrim = Math.min(trim, Math.max(0, Math.min(...fronts) - DOOR.clearance - corridorRect.u));
  const endTrim = Math.min(trim, Math.max(0, corridorRect.u + corridorRect.lu - Math.max(...fronts) - DOOR.clearance));
  corridorRect.u += startTrim;
  corridorRect.lu -= startTrim + endTrim;
  const corridor: PlanRoom = { id: `f${floor.index < 0 ? `m${-floor.index}` : floor.index}-corridor`,
    kind: kind === "mall_floor" ? "concourse" : "corridor", rect: corridorRect,
    polygon: clipPolygonToRect(plate, toRect(corridorRect)), doors: [] };
  rooms.push(corridor);
  occupied.push(corridorRect);

  // `previous` is the fallback for a floor whose complete homes cannot all be fitted
  // and furnished: the plain studio and service allocation those planners replaced.
  if (!previous && (kind === 'apartment' || kind === 'residence_studio')) {
    const standard = planCapsuleResidential(request, floor, core, frame, plate, outline, ids);
    if (standard) return { rooms: standard, sealed: [], changes: [] };
    const damaged = planDamagedResidential(request, floor, core, frame, plate, outline, ids);
    if (damaged) return { rooms: damaged, sealed: [], changes: [] };
    const diagnostics: string[] = [];
    const complete = planPerimeterResidential(request, floor, core, frame, corridor, plate, outline, ids, diagnostics);
    if (complete) return { rooms: complete, sealed: [], changes: [] };
    if (diagnostics.length) throw new InteriorError('E_FLOOR_TOO_SMALL',
      `complete luxury floor allocation failed: ${diagnostics.slice(-3).join('; ')}`, floor.index);
  }

  const program = UNIT_PROGRAM[kind];
  const serviceSize = program?.service === 'bathroom'
    && residentialTarget(request.building.tier) === 150 ? 3.5 : MIN_UNIT.serviceSize;
  if (program) {
    const residential = kind === 'apartment' || kind === 'residence_studio';
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
      const frontage = interiorRecipe(request)?.frontage ?? [8, 12];
      const envelope = (low: number, high: number) => {
        const available = access.unit(strip, side, low, high);
        return residential ? residentialEnvelope(available, side) : available;
      };
      const targetArea = residentialTarget(request.building.tier);
      const preferred = residential ? targetArea / Math.min(10, strip.lv) : rng.range(frontage[0]!, frontage[1]!);
      const slots = facadeSlots(cuts, preferred, (low, high) => {
        const rect = envelope(low, high);
        if (rect.lu < MIN_UNIT.width || rect.lv < MIN_UNIT.depth || occupied.some(cut => overlaps(rect, cut))) return false;
        const polygon = clipPolygonToRect(plate, toRect(rect));
        return Math.abs(polygonArea(polygon)) >= (residential ? Math.min(targetArea * 0.85, strip.lu * strip.lv * 0.6) : MIN_UNIT.area)
          && Math.abs(polygonArea(polygon)) >= rect.lu * rect.lv * 0.9
          && fittedServices(rect, side, polygon, serviceSize).length > 0;
      });
      for (const [low, high] of slots) {
        const rect = envelope(low, high);
        const polygon = clipPolygonToRect(plate, toRect(rect));
        const unit = `f${floor.index}-unit-${rooms.length}`;
        const dwelling = residential && !previous ? (isDamagedResidential(request)
          ? damagedDwellingProgram(rect, side, polygon, cuts, unit, ids)
          : residentialProgram(rect, side, polygon, cuts, request.building.tier, unit, ids)) : null;
        if (dwelling) {
          rooms.push(...dwelling);
          dwelling.slice(1).forEach(room => privateInternal.add(room.id));
          occupied.push(rect);
          continue;
        }
        // A worn standard home keeps its separate sleeping, cooking and wet rooms.
        // A failed programme cannot silently become the old studio fallback.
        if (residential && isDamagedResidential(request) && !previous) continue;
        const services = fittedServices(rect, side, polygon, serviceSize);
        const serviceRect = services[Math.floor(rng.next() * services.length)]!;
        const mainShape = new RoomRegion(polygon).subtract([serviceRect]);
        if (mainShape.length !== 1) continue;
        const main: PlanRoom = { ...mainShape[0]!, id: ids.room(),
          kind: program.main, unit, doors: [] };
        const service: PlanRoom = { id: ids.room(), kind: program.service, rect: serviceRect, unit, doors: [] };
        doorBetween(service, main.id, main, ids);
        rooms.push(main, service);
        privateInternal.add(service.id);
        occupied.push(rect);
      }
    }
  } else {
    // Service rooms stand clear of the floor in front of the street door, as the core does.
    const approaches = approachKeepouts(floor, core.frame, facadeDepth(request.blueprint.facade)).map(keepout => keepout.rect);
    const ground = kind === 'lobby' && !previous ? planDamagedGround(request, floor, core,
      { ...frame, corridor: corridorRect }, corridor, plate, outline, approaches, ids)
      ?? planResidentialGround(request, floor, core,
        { ...frame, corridor: corridorRect }, corridor, plate, outline, approaches, ids) : null;
    if (ground) {
      zonedGround = true;
      rooms.push(...ground.rooms);
      occupied.push(...ground.occupied);
    } else {
      // A service room never stands on the core's service stub, whose solid would seal the
      // floor beyond it off the corridor.
      const services = fitServiceProgram(SERVICES[kind] ?? [], [...occupied, ...approaches, core.stub], plate,
        { ...frame, corridor: corridorRect }, ids,
        isCorporate(request.building.type, request.building.tier) ? CORPORATE_SERVICE_SIZES : undefined);
      rooms.push(...services.rooms);
      occupied.push(...services.rooms.map(room => room.rect));
      changes.push(...services.changes);
    }
  }

  if (!previous && isDamagedResidential(request) && ['apartment', 'residence_studio'].includes(kind)
    && !rooms.some(room => room.unit)) throw new InteriorError('E_FLOOR_TOO_SMALL',
    'worn residential floor cannot retain a complete bedroom, bathroom, kitchen and furnished living programme', floor.index);
  const singleUnit = program && !rooms.some(room => room.unit);
  if (singleUnit) changes.push({ kind: program.service, requested: [serviceSize, serviceSize], fitted: null });
  const common = new RoomRegion(plate).subtract(isDamagedResidential(request) ? absorbDamagedSlivers(occupied) : absorbSlivers(occupied))
    .map(shape => ({ ...shape, id: ids.room(), kind: zonedGround ? 'corridor' : singleUnit ? program.main : MAIN[kind] ?? "lounge",
      ...(singleUnit ? { unit: `f${floor.index}-unit-main` } : {}), doors: [] } as PlanRoom));
  if (!common.some(room => Math.abs(polygonArea(room.polygon!)) >= ROOM.minArea
    && room.rect.lu >= ROOM.minDim && room.rect.lv >= ROOM.minDim)) {
    throw new InteriorError("E_FLOOR_TOO_SMALL", "floor cannot hold one room beside its circulation and core", floor.index);
  }
  rooms.push(...common);
  for (const room of rooms) {
    if (room === corridor || privateInternal.has(room.id)) continue;
    const targets = [corridor, ...common.filter(other => other !== room)];
    if (room.doors.some(door => targets.some(target => target.id === door.to))) continue;
    const target = targets.find(other => sharedRoomEdges(room, other, plate).some(edge => edge.hi - edge.lo >= MIN_STRETCH));
    if (target) doorBetween(room, target.id, target, ids, room.unit ? 1 : 2,
      room.unit ? (isDamagedResidential(request) ? 1.2 : DOOR.single) : DOOR.double);
  }
  if (kind === 'lobby' && zonedGround && isDamagedResidential(request)) fitDamagedGroundPublicDoors(rooms);
  return { rooms, sealed: [], changes };
}

/** Between two occupied rectangles a gap thinner than a body is nobody's room: the lower one
 *  grows through it, so the common remainder never owns a pocket a person cannot stand in.
 *  A gap that opens onto the plate boundary is not a pocket; it reaches the open perimeter. */
function absorbSlivers(occupied: readonly UvRect[]): UvRect[] {
  const gap = (rect: UvRect, along: boolean, low: boolean): number => {
    const faces = occupied.filter(other => other !== rect
      && (along
        ? Math.min(other.v + other.lv, rect.v + rect.lv) - Math.max(other.v, rect.v) > 1e-6
        : Math.min(other.u + other.lu, rect.u + rect.lu) - Math.max(other.u, rect.u) > 1e-6))
      .map(other => along
        ? low ? other.u + other.lu : other.u
        : low ? other.v + other.lv : other.v)
      .filter(face => low ? face <= (along ? rect.u : rect.v) + 1e-6
        : face >= (along ? rect.u + rect.lu : rect.v + rect.lv) - 1e-6);
    if (!faces.length) return 0;
    const distance = low
      ? (along ? rect.u : rect.v) - Math.max(...faces)
      : Math.min(...faces) - (along ? rect.u + rect.lu : rect.v + rect.lv);
    return distance > 1e-6 && distance < BODY_CLEAR ? distance : 0;
  };
  return occupied.map(rect => {
    const uLow = gap(rect, true, true), vLow = gap(rect, false, true);
    return { u: rect.u - uLow, v: rect.v - vLow,
      lu: rect.lu + uLow + gap(rect, true, false), lv: rect.lv + vLow + gap(rect, false, false) };
  });
}

function fittedServices(rect: UvRect, side: "v0" | "v1", polygon: Point[], size = MIN_UNIT.serviceSize): UvRect[] {
  return [rect.u, rect.u + rect.lu - size].map(u => ({ u,
    v: side === "v0" ? rect.v : rect.v + rect.lv - size,
    lu: size, lv: size }))
    .filter(service => roomCoversRect({ rect, polygon }, service));
}

function overlaps(a: UvRect, b: UvRect): boolean {
  return Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u) > 1e-6
    && Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v) > 1e-6;
}

function toRect(rect: UvRect) { return { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv }; }
