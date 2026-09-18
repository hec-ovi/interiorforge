import { InteriorError } from "../core/errors.js";
import { clipPolygonToRect, polygonArea, polygonBounds, type Point } from "../core/geom.js";
import type { Rng } from "../core/rng.js";
import type { FloorKind } from "../core/types.js";
import { CORRIDOR, ROOM } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { coreRectsOf } from "./pier-align.js";
import type { FloorFrame, PlanRoom } from "./plan-types.js";
import { inlineStairBypasses } from "./public-bypass.js";
import { RoomRegion } from "./room-region.js";
import { roomContains } from "./room-shape.js";
import { doorBetween, fillOfficeStrip, fillShopStrip, fillUnitStrip, type IdGen } from "./rooms.js";
import { coversRect, uvRectCenter, type UvRect } from "./uv.js";

interface Seat { rect: UvRect; side: "v0" | "v1"; outerU: [boolean, boolean] }

/** Public circulation is reserved before seeded private strip programs are allocated. */
export function planLegacyPublicRooms(core: CorePlan, frame: FloorFrame, kind: FloorKind,
  corridor: PlanRoom, backing: { rooms: PlanRoom[]; sealed: UvRect[] }, plate: Point[],
  outline: Point[], ids: IdGen, rng: Rng, floor: number): PlanRoom[] {
  const stair = frame.stairB!;
  const exterior = polygonBounds(outline);
  const east = exterior.x + exterior.w, north = exterior.z + exterior.d;
  // Exterior seats reach the true facade. The ownership clip, not the planning
  // grid's rounded band bounds, supplies their finished outer boundaries.
  const backingEnd = Math.max(...backing.rooms.map(room => room.rect.v + room.rect.lv));
  for (const room of backing.rooms) {
    if (Math.abs(room.rect.v + room.rect.lv - backingEnd) < 1e-7) room.rect.lv = north - room.rect.v;
  }
  const landing: PlanRoom = { id: `${corridor.id}-tail`, kind: corridor.kind,
    rect: { ...frame.corridorTail!, lu: east - frame.corridorTail!.u }, doors: [] };
  const occupied = [...coreRectsOf(core), ...backing.rooms.map(room => room.rect), ...backing.sealed];
  const strips: Seat[] = [{ rect: frame.south, side: "v1", outerU: [true, true] },
    ...frame.northSegments.map(rect => ({ rect, side: "v0" as const,
      outerU: [rect.u < core.u0, rect.u >= core.u1 - 1e-7] as [boolean, boolean] }))];
  const ownership = (rect: UvRect, seat: Seat): UvRect => {
    const low = seat.outerU[0] && Math.abs(rect.u - seat.rect.u) < 1e-7 ? exterior.x : rect.u;
    const high = seat.outerU[1] && Math.abs(rect.u + rect.lu - seat.rect.u - seat.rect.lu) < 1e-7
      ? east : rect.u + rect.lu;
    const farLow = seat.side === "v1" && Math.abs(rect.v - seat.rect.v) < 1e-7 ? exterior.z : rect.v;
    const farHigh = seat.side === "v0" && Math.abs(rect.v + rect.lv - seat.rect.v - seat.rect.lv) < 1e-7
      ? north : rect.v + rect.lv;
    return { u: low, v: farLow, lu: high - low, lv: farHigh - farLow };
  };
  const candidates = inlineStairBypasses(stair).flatMap(bypass => {
    // The full straight bypass fits beside the shaft. Its far turn joins the actual
    // terminal landing, whose width is independent of the main corridor width.
    const straight = { ...bypass, u: stair.u - CORRIDOR.width, lu: stair.lu + CORRIDOR.width };
    if (!coversRect(plate, straight) || occupied.some(rect => overlaps(rect, bypass))) return [];
    const seats = strips.flatMap(seat => partition(seat, bypass)).filter(seat =>
      seat.rect.lu >= ROOM.minDim * 2 && seat.rect.lv >= ROOM.minStripDepth
      && clippedArea(seat.rect, plate) >= seat.rect.lu * seat.rect.lv * 0.5
      && !overlaps(ownership(seat.rect, seat), bypass));
    const score = seats.reduce((sum, seat) => sum + clippedArea(seat.rect, plate), 0);
    return [{ seats, score }];
  }).sort((a, b) => b.score - a.score);
  const chosen = candidates[0];
  if (!chosen?.seats.length) throw new InteriorError("E_FLOOR_TOO_SMALL",
    "inline stair bypass and complete private strip program do not fit", floor);

  const common = (cuts: UvRect[]) => new RoomRegion(plate).subtract([...occupied, landing.rect, ...cuts]);
  const planned = common(chosen.seats.map(seat => ownership(seat.rect, seat)));
  const spine = uvRectCenter(frame.corridor);
  const primary = planned.find(shape => roomContains(shape, spine));
  if (!primary) throw new InteriorError("E_FLOOR_TOO_SMALL", "public strip plan has no corridor spine", floor);
  Object.assign(corridor, primary);
  const privateRooms: PlanRoom[] = [];
  chosen.seats.forEach((seat, index) => {
    const unit = `f${floor}-strip${index}`;
    let allocated: PlanRoom[];
    if (kind === "office" || kind === "corpo_office") {
      allocated = fillOfficeStrip(seat.rect, seat.side, corridor, kind === "corpo_office", rng, ids, unit);
    } else {
      const fill = kind === "mall_floor"
        ? fillShopStrip(seat.rect, seat.side, corridor, rng, ids, unit, outline)
        : fillUnitStrip(seat.rect, seat.side, corridor, kind, rng, ids, unit, outline);
      allocated = fill.rooms;
    }
    for (const room of allocated) {
      if (clippedArea(room.rect, plate) < room.rect.lu * room.rect.lv * 0.35) {
        throw new InteriorError("E_FLOOR_TOO_SMALL", `complete room ${room.kind} does not fit the plate`, floor);
      }
      room.rect = ownership(room.rect, seat);
    }
    privateRooms.push(...allocated);
  });
  if (!privateRooms.length) throw new InteriorError("E_FLOOR_TOO_SMALL",
    "public strip plan cannot fit a complete private room program", floor);
  const regions = common(privateRooms.map(room => room.rect));
  const finalPrimary = regions.find(shape => roomContains(shape, spine));
  if (!finalPrimary) throw new InteriorError("E_FLOOR_TOO_SMALL", "allocated strip plan has no corridor spine", floor);
  delete corridor.holes;
  Object.assign(corridor, finalPrimary);
  const commonRooms = regions.filter(shape => shape !== finalPrimary).map(shape => ({ ...shape,
    id: ids.room(), kind: corridor.kind, doors: [] } as PlanRoom));
  const rooms = [corridor, landing, ...commonRooms, ...backing.rooms, ...privateRooms];
  // Every shared boundary is exact and stays fixed during rectangular grid fitting.
  for (const room of rooms) {
    if (room.polygon) continue;
    const polygon = clipPolygonToRect(plate, toRect(room.rect));
    if (polygon.length < 3 || Math.abs(polygonArea(polygon)) < 1e-8) {
      throw new InteriorError("E_FLOOR_TOO_SMALL", `complete room ${room.kind} does not fit the plate`, floor);
    }
    const bounds = polygonBounds(polygon);
    room.polygon = polygon;
    room.rect = { u: bounds.x, v: bounds.z, lu: bounds.w, lv: bounds.d };
  }
  doorBetween(landing, corridor.id, corridor, ids);
  return rooms;
}

function partition(seat: Seat, bypass: UvRect): Seat[] {
  const { rect, side } = seat;
  if (!overlaps(rect, bypass)) return [seat];
  const cuts = [rect.u, Math.max(rect.u, bypass.u), Math.min(rect.u + rect.lu, bypass.u + bypass.lu), rect.u + rect.lu];
  return cuts.slice(0, -1).flatMap((u, index) => {
    const high = cuts[index + 1]!;
    if (high - u < 1e-8) return [];
    const part = { ...rect, u, lu: high - u };
    if (overlaps(part, bypass)) {
      if (side === "v0") {
        const end = part.v + part.lv;
        part.v = Math.max(part.v, bypass.v + bypass.lv);
        part.lv = end - part.v;
      } else part.lv = Math.min(part.v + part.lv, bypass.v) - part.v;
    }
    return [{ rect: part, side, outerU: [seat.outerU[0] && Math.abs(u - rect.u) < 1e-7,
      seat.outerU[1] && Math.abs(high - rect.u - rect.lu) < 1e-7] as [boolean, boolean] }];
  });
}

function overlaps(a: UvRect, b: UvRect): boolean {
  return Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u) > 1e-7
    && Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v) > 1e-7;
}
function toRect(rect: UvRect) { return { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv }; }
function clippedArea(rect: UvRect, plate: Point[]) {
  return Math.abs(polygonArea(clipPolygonToRect(plate, toRect(rect))));
}
