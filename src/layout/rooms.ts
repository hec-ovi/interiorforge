import type { Point } from "../core/geom.js";
import { clipPolygonToRect, polygonArea } from "../core/geom.js";
import type { Rng } from "../core/rng.js";
import type { FloorKind, RoomKind } from "../core/types.js";
import { CORRIDOR, DOOR, ELEVATOR, ROOM, WALL } from "./constants.js";
import { BAND_PROUD } from "./shell.js";
import type { CorePlan } from "./core-plan.js";
import type { FloorFrame, PlanDoor, PlanRoom } from "./plan-types.js";
import { VENUE_KINDS } from "./frame.js";
import { pointInUvRect, snap } from "./uv.js";
import type { UvRect } from "./uv.js";

/** Fraction of a uv rect actually inside the floor outline; irregular parcels cut
 *  diagonals into the plate and rooms must not be created in the void. */
export function clipRatio(rect: UvRect, uvOutline: readonly Point[]): number {
  if (rect.lu < 1e-6 || rect.lv < 1e-6) return 0;
  const clipped = clipPolygonToRect(uvOutline, { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv });
  if (clipped.length < 3) return 0;
  return Math.abs(polygonArea(clipped)) / (rect.lu * rect.lv);
}

export interface IdGen {
  room(): string;
  door(): string;
  furniture(): string;
  light(): string;
}

export function idGen(floor: number): IdGen {
  let r = 0, d = 0, f = 0, l = 0;
  const tag = floor < 0 ? `m${-floor}` : `${floor}`;
  return {
    room: () => `f${tag}-r${r++}`,
    door: () => `f${tag}-d${d++}`,
    furniture: () => `f${tag}-fur${f++}`,
    light: () => `f${tag}-lt${l++}`,
  };
}

/** Shared straight edge of two abutting rects, or null. */
export function sharedEdge(
  a: UvRect, b: UvRect,
): { edge: PlanDoor["edge"]; lo: number; hi: number } | null {
  const eps = 1e-6;
  if (Math.abs(a.v + a.lv - b.v) < eps) return { edge: "v1", lo: Math.max(a.u, b.u), hi: Math.min(a.u + a.lu, b.u + b.lu) };
  if (Math.abs(b.v + b.lv - a.v) < eps) return { edge: "v0", lo: Math.max(a.u, b.u), hi: Math.min(a.u + a.lu, b.u + b.lu) };
  if (Math.abs(a.u + a.lu - b.u) < eps) return { edge: "u1", lo: Math.max(a.v, b.v), hi: Math.min(a.v + a.lv, b.v + b.lv) };
  if (Math.abs(b.u + b.lu - a.u) < eps) return { edge: "u0", lo: Math.max(a.v, b.v), hi: Math.min(a.v + a.lv, b.v + b.lv) };
  return null;
}

/** A doorway keeps this clear of each end of its stretch: the corner wall's bands reach that
 *  far into the opening, and nothing may stand in a doorway. */
export const BAND_CLEAR = WALL / 2 + 2 * BAND_PROUD;

/** Shortest stretch that still carries a door: the narrowest leaf between the corner bands. */
export const MIN_STRETCH = DOOR.min + 2 * BAND_CLEAR;

/** The widest clear leaf a stretch carries, capped at the width asked for: full width wherever
 *  the wall allows it, never wider than the space between the corner bands. */
export function doorWidthOn(stretch: number, want: number): number {
  return Math.round(Math.min(want, stretch - 2 * BAND_CLEAR) * 1000) / 1000;
}

/** The part of two rooms' shared edge that a real partition covers: the stretch inside the
 *  plate. An irregular outline cuts room rects, and beyond the plate the facade lining
 *  stands where the partition would be, so a door there would be walled shut. `near` picks
 *  the stretch holding a door that already exists; otherwise the longest one wins. */
export function sharedStretch(
  a: UvRect, b: UvRect, plate: readonly Point[], near?: number,
): { edge: PlanDoor["edge"]; lo: number; hi: number } | null {
  const shared = sharedEdge(a, b);
  if (!shared) return null;
  const alongU = shared.edge === "v0" || shared.edge === "v1";
  const c = shared.edge === "v0" ? a.v : shared.edge === "v1" ? a.v + a.lv
    : shared.edge === "u0" ? a.u : a.u + a.lu;
  let best: { edge: PlanDoor["edge"]; lo: number; hi: number } | null = null;
  for (const [runLo, runHi] of lineRuns(plate, alongU, c)) {
    const lo = Math.max(shared.lo, runLo);
    const hi = Math.min(shared.hi, runHi);
    if (hi - lo < MIN_STRETCH) continue;
    if (near !== undefined && near >= lo && near <= hi) return { edge: shared.edge, lo, hi };
    if (!best || hi - lo > best.hi - best.lo) best = { edge: shared.edge, lo, hi };
  }
  return best;
}

/** Where a line crosses a polygon: the intervals of it that lie inside. */
function lineRuns(poly: readonly Point[], alongU: boolean, c: number): [number, number][] {
  const crossings: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const [pc, qc] = alongU ? [p[1], q[1]] : [p[0], q[0]];
    if ((pc <= c && qc <= c) || (pc > c && qc > c)) continue;
    const [pa, qa] = alongU ? [p[0], q[0]] : [p[1], q[1]];
    crossings.push(pa + ((c - pc) / (qc - pc)) * (qa - pa));
  }
  crossings.sort((x, y) => x - y);
  const runs: [number, number][] = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) runs.push([crossings[i]!, crossings[i + 1]!]);
  return runs;
}

/** Door on the shared edge of two abutting rects, owned by `owner`. Returns null when the
 *  contact interval is too short for even the narrowest leaf. `fraction` shifts the door
 *  along the interval (repair probes several positions). */
export function doorBetween(
  owner: PlanRoom, toId: string, toRect: UvRect, ids: IdGen,
  leaves: 1 | 2 | 3 | 4 = 1, width = DOOR.single, fraction = 0.5,
): PlanDoor | null {
  const shared = sharedEdge(owner.rect, toRect);
  if (!shared || shared.hi - shared.lo < MIN_STRETCH) return null;
  const { edge, lo, hi } = shared;
  let w = doorWidthOn(hi - lo, width);
  if (w < width) leaves = 1;
  const span = hi - lo - w - 2 * BAND_CLEAR;
  const center = span > 0 ? lo + w / 2 + BAND_CLEAR + span * fraction : (lo + hi) / 2;
  const door: PlanDoor = { id: ids.door(), to: toId, leaves, width: w, edge, at: snap(center) };
  // snapping may push the door off-interval on short walls; recenter unclamped then
  if (door.at - w / 2 < lo + BAND_CLEAR || door.at + w / 2 > hi - BAND_CLEAR) door.at = center;
  owner.doors.push(door);
  return door;
}

interface SideOps {
  /** band touching the corridor */
  near(rect: UvRect, depth: number): UvRect;
  /** remaining band toward the facade */
  far(rect: UvRect, nearDepth: number): UvRect;
}

function sideOps(corridorSide: "v0" | "v1"): SideOps {
  if (corridorSide === "v0") {
    return {
      near: (r, depth) => ({ u: r.u, v: r.v, lu: r.lu, lv: depth }),
      far: (r, nd) => ({ u: r.u, v: r.v + nd, lu: r.lu, lv: r.lv - nd }),
    };
  }
  return {
    near: (r, depth) => ({ u: r.u, v: r.v + r.lv - depth, lu: r.lu, lv: depth }),
    far: (r, nd) => ({ u: r.u, v: r.v, lu: r.lu, lv: r.lv - nd }),
  };
}

function uSlice(r: UvRect, u0: number, u1: number): UvRect {
  return { u: u0, v: r.v, lu: u1 - u0, lv: r.lv };
}

/** Splits a strip length into seeded unit frontages; the tail is absorbed. */
export function splitFrontages(length: number, range: readonly [number, number], rng: Rng): number[] {
  const [min, max] = range;
  if (length < min) return length >= ROOM.minDim * 2 ? [length] : [];
  const widths: number[] = [];
  let rem = length;
  while (rem > 1e-9) {
    let w = snap(rng.range(min, max));
    if (rem - w < min) w = rem;
    widths.push(w);
    rem -= w;
  }
  return widths;
}

// ---- residential and hotel units ----

const FRONTAGE: Partial<Record<FloorKind, readonly [number, number]>> = {
  apartment: ROOM.apartmentFront,
  residence_studio: ROOM.studioFront,
  hotel_rooms: ROOM.hotelFront,
};

export interface StripFill {
  rooms: PlanRoom[];
  /** spans that would be unreachable enclaves: walled off as service voids */
  sealed: UvRect[];
}

interface StripSlot {
  rect: UvRect;
  /** true when the corridor runs out on the slot's high-u side: services go there */
  deadRight: boolean;
}

/** Splits a strip into slots of seeded frontage that the corridor actually reaches. Spans
 *  whose contact is eaten (inline stair shaft) merge into a neighbor or become sealed
 *  enclaves; spans mostly outside an irregular outline are dropped. */
function stripSlots(
  strip: UvRect, corridorRoom: PlanRoom, range: readonly [number, number], rng: Rng,
  uvOutline: readonly Point[],
): { slots: StripSlot[]; sealed: UvRect[] } {
  if (strip.lu < ROOM.minDim || strip.lv < ROOM.minStripDepth) return { slots: [], sealed: [] };
  const corr = corridorRoom.rect;
  const widths = splitFrontages(strip.lu, range, rng);
  const contactOf = (u0: number, u1: number) => Math.min(u1, corr.u + corr.lu) - Math.max(u0, corr.u);
  while (widths.length >= 2) {
    const lastStart = strip.u + strip.lu - widths.at(-1)!;
    if (contactOf(lastStart, strip.u + strip.lu) < 1.6) {
      widths[widths.length - 2]! += widths.pop()!;
    } else break;
  }
  for (let i = 0; i < widths.length && widths.length > 1; ) {
    const u0 = strip.u + widths.slice(0, i).reduce((a, b) => a + b, 0);
    if (clipRatio(uSlice(strip, u0, u0 + widths[i]!), uvOutline) < 0.5) {
      if (i + 1 < widths.length) widths[i + 1]! += widths[i]!;
      else widths[i - 1]! += widths[i]!;
      widths.splice(i, 1);
    } else i++;
  }
  const slots: StripSlot[] = [];
  const sealed: UvRect[] = [];
  let u = strip.u;
  for (const w of widths) {
    const rect = uSlice(strip, u, u + w);
    u += w;
    if (contactOf(rect.u, rect.u + rect.lu) < 1.6) {
      sealed.push(rect); // no corridor contact: an enclave, walled off
      continue;
    }
    if (clipRatio(rect, uvOutline) < 0.5) continue; // mostly outside the outline: stays void
    const deadRight = (rect.u + rect.lu) - Math.min(rect.u + rect.lu, corr.u + corr.lu)
      > Math.max(rect.u, corr.u) - rect.u;
    slots.push({ rect, deadRight });
  }
  return { slots, sealed };
}

export function fillUnitStrip(
  strip: UvRect, corridorSide: "v0" | "v1", corridorRoom: PlanRoom, kind: FloorKind,
  rng: Rng, ids: IdGen, unitPrefix: string, uvOutline: readonly Point[],
): StripFill {
  const { slots, sealed } = stripSlots(strip, corridorRoom, FRONTAGE[kind] ?? ROOM.studioFront, rng, uvOutline);
  const rooms: PlanRoom[] = [];
  slots.forEach((slot, n) => {
    const unit = `${unitPrefix}-u${n}`;
    rooms.push(...fillUnit(slot.rect, corridorSide, slot.deadRight, corridorRoom, kind, rng, ids, unit));
  });
  return { rooms, sealed };
}

function fillUnit(
  rect: UvRect, corridorSide: "v0" | "v1", deadRight: boolean, corridorRoom: PlanRoom,
  kind: FloorKind, rng: Rng, ids: IdGen, unit: string,
): PlanRoom[] {
  const ops = sideOps(corridorSide);
  const bandDepth = Math.min(2.7, rect.lv - 2.3);
  const bandA = ops.near(rect, bandDepth);
  const bandB = ops.far(rect, bandDepth);
  const rooms: PlanRoom[] = [];
  const mk = (kind: RoomKind, r: UvRect): PlanRoom => {
    const room: PlanRoom = { id: ids.room(), kind, rect: r, unit, doors: [] };
    rooms.push(room);
    return room;
  };

  // strips too shallow for an entry band: one plain room per unit, shared WC on the floor
  if (rect.lv < 4.6) {
    const only = mk(kind === "hotel_rooms" ? "bedroom" : "studio_main", rect);
    doorBetween(only, corridorRoom.id, corridorRoom.rect, ids);
    return rooms;
  }

  let hall: PlanRoom;
  if (kind === "apartment" && rect.lu >= 6.5) {
    // entry band: hall keeps the corridor-contact side; services sit toward the dead side
    const bw = ROOM.bath.w;
    const kw = ROOM.kitchen.w;
    const a0 = bandA.u;
    const a1 = bandA.u + bandA.lu;
    if (deadRight) {
      hall = mk("living", uSlice(bandA, a0, a1 - kw - bw));
      mk("bathroom", uSlice(bandA, a1 - kw - bw, a1 - kw));
      mk("kitchen", uSlice(bandA, a1 - kw, a1));
    } else {
      mk("bathroom", uSlice(bandA, a0, a0 + bw));
      hall = mk("living", uSlice(bandA, a0 + bw, a1 - kw));
      mk("kitchen", uSlice(bandA, a1 - kw, a1));
    }
    if (rect.lu >= 9.5) {
      const bedW = snap(Math.min(3.8, (rect.lu - 3.2) / 2));
      mk("bedroom", uSlice(bandB, bandB.u, bandB.u + bedW));
      mk("living", uSlice(bandB, bandB.u + bedW, bandB.u + bandB.lu - bedW));
      mk("bedroom", uSlice(bandB, bandB.u + bandB.lu - bedW, bandB.u + bandB.lu));
    } else {
      const bedW = snap(Math.min(3.8, Math.max(3.0, rect.lu - 3.6)));
      if (deadRight) {
        mk("bedroom", uSlice(bandB, bandB.u, bandB.u + bedW));
        mk("living", uSlice(bandB, bandB.u + bedW, bandB.u + bandB.lu));
      } else {
        mk("living", uSlice(bandB, bandB.u, bandB.u + bandB.lu - bedW));
        mk("bedroom", uSlice(bandB, bandB.u + bandB.lu - bedW, bandB.u + bandB.lu));
      }
    }
  } else {
    // studio and hotel room (and small apartments): entry band with bath, main at the facade
    const a0 = bandA.u;
    const a1 = bandA.u + bandA.lu;
    if (deadRight) {
      hall = mk("living", uSlice(bandA, a0, a1 - ROOM.bath.w));
      mk("bathroom", uSlice(bandA, a1 - ROOM.bath.w, a1));
    } else {
      mk("bathroom", uSlice(bandA, a0, a0 + ROOM.bath.w));
      hall = mk("living", uSlice(bandA, a0 + ROOM.bath.w, a1));
    }
    mk(kind === "hotel_rooms" ? "bedroom" : "studio_main", bandB);
  }
  doorBetween(hall, corridorRoom.id, corridorRoom.rect, ids);
  connectUnit(rooms, hall, ids);
  return rooms;
}

const CONNECT_PREF: Partial<Record<RoomKind, number>> = {
  living: 0, studio_main: 1, kitchen: 2, bedroom: 3, bathroom: 4,
};

const CONNECT_DOOR: Partial<Record<RoomKind, [1 | 2, number]>> = {
  living: [2, 1.6], studio_main: [2, 1.6], kitchen: [2, 1.6],
  bedroom: [1, DOOR.single], bathroom: [1, DOOR.single],
};

/** Connects every room of a unit to its hall through adjacent rooms, halls and livings first.
 *  Deterministic; guarantees plan-time connectivity for any band ordering. */
function connectUnit(rooms: PlanRoom[], hall: PlanRoom, ids: IdGen): void {
  const connected = new Set([hall.id]);
  const pending = rooms.filter((r) => r !== hall);
  while (pending.length > 0) {
    let advanced = false;
    pending.sort((a, b) => (CONNECT_PREF[a.kind] ?? 9) - (CONNECT_PREF[b.kind] ?? 9) || a.id.localeCompare(b.id));
    for (let i = 0; i < pending.length; i++) {
      const room = pending[i]!;
      const targets = rooms
        .filter((r) => connected.has(r.id))
        .sort((a, b) => (CONNECT_PREF[a.kind] ?? 9) - (CONNECT_PREF[b.kind] ?? 9) || a.id.localeCompare(b.id));
      const [leaves, width] = CONNECT_DOOR[room.kind] ?? [1, DOOR.single];
      const target = targets.find((t) => doorBetween(room, t.id, t.rect, ids, leaves, width));
      if (target) {
        connected.add(room.id);
        pending.splice(i, 1);
        advanced = true;
        break;
      }
    }
    if (!advanced) break; // validation will flag and repair what is left
  }
}

// ---- office floors ----

export function fillOfficeStrip(
  strip: UvRect, corridorSide: "v0" | "v1", corridorRoom: PlanRoom, corpo: boolean,
  rng: Rng, ids: IdGen, unit: string,
): PlanRoom[] {
  if (strip.lu < ROOM.minDim || strip.lv < ROOM.minStripDepth) return [];
  const rooms: PlanRoom[] = [];
  const mk = (kind: RoomKind, r: UvRect): PlanRoom => {
    const room: PlanRoom = { id: ids.room(), kind, rect: r, unit, doors: [] };
    rooms.push(room);
    return room;
  };
  const ops = sideOps(corridorSide);
  const big = strip.lu >= 12 && strip.lv >= 5;

  let openRect = strip;
  const carved: PlanRoom[] = [];
  if (big) {
    // one end: meeting at the facade half, private office at the corridor half
    const endW = snap(Math.max(ROOM.meeting.w, ROOM.officePrivate.w));
    const slice = uSlice(strip, strip.u, strip.u + endW);
    const nearDepth = Math.min(ROOM.officePrivate.d, slice.lv / 2);
    carved.push(mk("office_private", ops.near(slice, nearDepth)));
    carved.push(mk("meeting", ops.far(slice, nearDepth)));
    let u1Cut = strip.u + strip.lu;
    if (corpo && strip.lu >= endW + ROOM.executive.w + 6) {
      const exec = uSlice(strip, u1Cut - snap(ROOM.executive.w), u1Cut);
      carved.push(mk("executive_office", exec));
      u1Cut = exec.u;
    }
    openRect = uSlice(strip, strip.u + endW, u1Cut);
  }
  const open = mk("office_open", openRect);
  doorBetween(open, corridorRoom.id, corridorRoom.rect, ids, 2, DOOR.double);
  for (const room of carved) {
    if (!doorBetween(room, open.id, open.rect, ids, 1, DOOR.single)) {
      doorBetween(room, corridorRoom.id, corridorRoom.rect, ids, 1, DOOR.single);
    }
  }
  return rooms;
}

// ---- shop units: a sales floor per frontage, stock room at the back ----

/** Mall floors: each frontage on the concourse is one shop. Deep slots keep a stock room
 *  against the back facade, reached from its own sales floor. */
export function fillShopStrip(
  strip: UvRect, corridorSide: "v0" | "v1", corridorRoom: PlanRoom,
  rng: Rng, ids: IdGen, unitPrefix: string, uvOutline: readonly Point[],
): StripFill {
  const { slots, sealed } = stripSlots(strip, corridorRoom, ROOM.shopFront, rng, uvOutline);
  const ops = sideOps(corridorSide);
  const rooms: PlanRoom[] = [];
  slots.forEach((slot, n) => {
    const unit = `${unitPrefix}-shop${n}`;
    const withStock = slot.rect.lv >= ROOM.minStripDepth + ROOM.stockDepth;
    const salesRect = withStock ? ops.near(slot.rect, slot.rect.lv - ROOM.stockDepth) : slot.rect;
    const sales: PlanRoom = { id: ids.room(), kind: "sales_floor", rect: salesRect, unit, doors: [] };
    rooms.push(sales);
    doorBetween(sales, corridorRoom.id, corridorRoom.rect, ids, 2, DOOR.double);
    if (!withStock) return;
    const stock: PlanRoom = {
      id: ids.room(), kind: "storage", rect: ops.far(slot.rect, salesRect.lv), unit, doors: [],
    };
    rooms.push(stock);
    doorBetween(stock, sales.id, sales.rect, ids);
  });
  return { rooms, sealed };
}

// ---- venue floors: hall + back of house ----

const HALL_KIND: Partial<Record<FloorKind, RoomKind>> = {
  lobby: "reception", restaurant: "dining_area", coffee_shop: "dining_area",
  retail: "sales_floor", gym: "gym_floor", terrace: "terrace_open",
  parking: "parking_area", mechanical: "mechanical_room",
};

const BOH_KINDS: Partial<Record<FloorKind, RoomKind[]>> = {
  restaurant: ["kitchen", "toilets", "storage"],
  coffee_shop: ["storage", "toilets"],
  retail: ["storage", "toilets"],
  gym: ["locker_room", "locker_room", "storage"],
  lobby: ["storage", "toilets"],
  terrace: ["storage", "toilets"],
  parking: ["mechanical_room", "storage"],
  mechanical: ["mechanical_room"],
};

export function fillVenue(
  frame: FloorFrame, corridorRoom: PlanRoom, kind: FloorKind, rng: Rng, ids: IdGen,
): PlanRoom[] {
  const rooms: PlanRoom[] = [];
  const hall: PlanRoom = {
    id: ids.room(), kind: HALL_KIND[kind] ?? "reception", rect: frame.south, doors: [],
  };
  rooms.push(hall);
  doorBetween(hall, corridorRoom.id, corridorRoom.rect, ids, 4, DOOR.quad);

  const boh = [...(BOH_KINDS[kind] ?? [])];
  // kitchens claim a whole segment; smaller BOH rooms share one
  for (const segment of frame.northSegments) {
    if (boh.length === 0) break;
    if (boh[0] === "kitchen" || boh[0] === "mechanical_room" || segment.lu < 5) {
      const room: PlanRoom = { id: ids.room(), kind: boh.shift()!, rect: segment, doors: [] };
      rooms.push(room);
      doorBetween(room, corridorRoom.id, corridorRoom.rect, ids, room.kind === "kitchen" ? 2 : 1,
        room.kind === "kitchen" ? DOOR.double : DOOR.single);
    } else {
      const take = boh.splice(0, Math.min(2, boh.length));
      const mid = snap(segment.u + segment.lu / 2);
      const parts = take.length === 2
        ? [uSlice(segment, segment.u, mid), uSlice(segment, mid, segment.u + segment.lu)]
        : [segment];
      for (let i = 0; i < take.length; i++) {
        const room: PlanRoom = { id: ids.room(), kind: take[i]!, rect: parts[i]!, doors: [] };
        rooms.push(room);
        doorBetween(room, corridorRoom.id, corridorRoom.rect, ids);
      }
    }
  }
  return rooms;
}

// ---- core stub and backing rooms ----

const BACKING_KINDS: Record<"office" | "residential" | "venue" | "mall", [RoomKind, RoomKind]> = {
  office: ["toilets", "storage"],
  residential: ["storage", "mechanical_room"],
  venue: ["storage", "mechanical_room"],
  // shop units keep their own stock rooms; the concourse needs public toilets
  mall: ["toilets", "storage"],
};

export function fillCoreBacking(
  core: CorePlan, frame: FloorFrame, kind: FloorKind, ids: IdGen, corridorRoom: PlanRoom,
  uvOutline: readonly Point[],
): { rooms: PlanRoom[]; sealed: UvRect[] } {
  const block = frame.coreBlock;
  // compact cores put stair columns in the block: backing rooms live between them, and
  // the strips behind each column are sealed voids
  const backStart = core.mode === "compact" ? core.stairA.u + core.stairA.lu : block.u;
  const columnRears: UvRect[] = [];
  if (core.mode === "compact") {
    const cols = [core.stairA, ...(core.stairB ? [core.stairB] : [])];
    for (const col of cols) {
      const rearLv = block.lv - col.lv;
      if (rearLv >= 0.5) columnRears.push({ u: col.u, v: block.v + col.lv, lu: col.lu, lv: rearLv });
    }
  }
  // irregular parcels may cut into the area behind the shafts: keep rooms only where the
  // full band depth is inside, seal the rest
  const coveredDepth = (u: number, lu: number): number => {
    let d = 0;
    while (d + 0.5 <= block.lv && clipRatio({ u, v: block.v, lu, lv: d + 0.5 }, uvOutline) > 0.999) d += 0.5;
    return d;
  };
  const backDepth = Math.min(coveredDepth(backStart, core.stub.u - backStart), coveredDepth(core.stub.u, core.stub.lu)) - ELEVATOR.shaft;
  const stubRect: UvRect = { u: core.stub.u, v: block.v, lu: core.stub.lu, lv: ELEVATOR.shaft + Math.max(0, backDepth) };
  const backing: UvRect = {
    u: backStart, v: block.v + ELEVATOR.shaft, lu: core.stub.u - backStart, lv: backDepth,
  };
  if (backDepth < 1.6) {
    return {
      rooms: [],
      sealed: [
        { u: backStart, v: block.v + ELEVATOR.shaft, lu: core.stub.u + core.stub.lu - backStart, lv: Math.max(0.5, backDepth) },
        ...columnRears,
      ],
    };
  }
  const stub: PlanRoom = { id: ids.room(), kind: "corridor", rect: stubRect, doors: [] };
  doorBetween(stub, corridorRoom.id, corridorRoom.rect, ids);
  const family = kind === "office" || kind === "corpo_office" ? "office"
    : kind === "mall_floor" ? "mall"
    : VENUE_KINDS.has(kind) ? "venue" : "residential";
  const [kindNear, kindFar] = BACKING_KINDS[family];
  const rooms: PlanRoom[] = [stub];
  if (backing.lu >= 6) {
    const mid = snap(backing.u + backing.lu / 2);
    const far: PlanRoom = { id: ids.room(), kind: kindFar, rect: uSlice(backing, backing.u, mid), doors: [] };
    const near: PlanRoom = { id: ids.room(), kind: kindNear, rect: uSlice(backing, mid, backing.u + backing.lu), doors: [] };
    doorBetween(near, stub.id, stub.rect, ids);
    doorBetween(far, near.id, near.rect, ids);
    rooms.push(near, far);
  } else if (backing.lu >= ROOM.minDim) {
    const only: PlanRoom = { id: ids.room(), kind: kindNear, rect: backing, doors: [] };
    doorBetween(only, stub.id, stub.rect, ids);
    rooms.push(only);
  }
  return { rooms, sealed: columnRears };
}

/** Shallow flanking segments (e.g. beside a single-loaded core row) become shared service
 *  rooms off the corridor: toilets, plus storage when the run is long enough. */
export function fillServiceSegment(
  seg: UvRect, corridorRoom: PlanRoom, ids: IdGen, uvOutline: readonly Point[],
): PlanRoom[] {
  if (seg.lv < 2.0 || seg.lu < 2.0 || clipRatio(seg, uvOutline) < 0.5) return [];
  const rooms: PlanRoom[] = [];
  const parts = seg.lu >= 5
    ? [
        { kind: "toilets" as RoomKind, rect: uSlice(seg, seg.u, snap(seg.u + seg.lu / 2)) },
        { kind: "storage" as RoomKind, rect: uSlice(seg, snap(seg.u + seg.lu / 2), seg.u + seg.lu) },
      ]
    : [{ kind: "toilets" as RoomKind, rect: seg }];
  for (const part of parts) {
    const room: PlanRoom = { id: ids.room(), kind: part.kind, rect: part.rect, doors: [] };
    if (doorBetween(room, corridorRoom.id, corridorRoom.rect, ids)) rooms.push(room);
  }
  return rooms;
}

/** Facade connections: attach each traversable blueprint opening to the room it lands on. */
export function attachOutsideDoors(
  rooms: PlanRoom[], uvDoorPoints: ({ at: [number, number]; width: number } & ({
    leaves: 1 | 2 | 3 | 4; openFront?: never;
  } | {
    openFront: {
      clearHeight: number; clearDepth: number; position: Point; angleDeg: number; inward: Point;
    }; leaves?: never;
  }))[],
  ids: IdGen,
): void {
  for (const opening of uvDoorPoints) {
    const [u, v] = opening.at;
    const probe = opening.openFront
      ? [u + opening.openFront.inward[0] * 0.5, v + opening.openFront.inward[1] * 0.5] as Point
      : null;
    const owner = probe ? rooms.find((room) => pointInUvRect(probe, room.rect, 0.01)) : undefined;
    let best: { room: PlanRoom; edge: PlanDoor["edge"]; dist: number } | null = null;
    for (const room of owner ? [owner] : rooms) {
      const r = room.rect;
      // strips snap inward from the true facade, so allow a generous band
      if (!owner && (u < r.u - 0.7 || u > r.u + r.lu + 0.7 || v < r.v - 0.7 || v > r.v + r.lv + 0.7)) continue;
      const edges: [PlanDoor["edge"], number][] = [
        ["v0", Math.abs(v - r.v)], ["v1", Math.abs(v - (r.v + r.lv))],
        ["u0", Math.abs(u - r.u)], ["u1", Math.abs(u - (r.u + r.lu))],
      ];
      for (const [edge, dist] of edges) {
        if (!best || dist < best.dist) best = { room, edge, dist };
      }
    }
    if (best && (best.dist < 1.2 || opening.openFront)) {
      const connection: PlanDoor = opening.openFront
        ? {
            id: ids.door(), to: "outside", width: opening.width,
            edge: best.edge, at: best.edge.startsWith("v") ? u : v,
            openFront: opening.openFront,
          }
        : {
            id: ids.door(), to: "outside", leaves: opening.leaves, width: opening.width,
            edge: best.edge, at: best.edge.startsWith("v") ? u : v,
          };
      best.room.doors.push(connection);
    }
  }
}
