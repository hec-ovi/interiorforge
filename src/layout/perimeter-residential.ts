import { clipPolygonToRect, polygonArea, polygonBounds, type Point } from '../core/geom.js';
import type { BlueprintFloor, InteriorRequest, RoomKind } from '../core/types.js';
import type { CorePlan } from './core-plan.js';
import { FacadeSeats, facadeSlots } from './facade-seats.js';
import { livingConnected } from './living-connectivity.js';
import { coreRectsOf } from './pier-align.js';
import { partitionConflicts } from './openings.js';
import type { FloorFrame, PlanRoom } from './plan-types.js';
import { RoomRegion } from './room-region.js';
import { roomArea, roomClearance, roomCoversRect, roomPolygon, sharedRoomEdges, type RoomShape } from './room-shape.js';
import { BAND_CLEAR, doorBetween, doorWidthOn, MIN_STRETCH, type IdGen } from './rooms.js';
import { makeFrame, snap, toUvPolygon, toWorldPolygon, uvRectCorners, worldToUv, type UvRect } from './uv.js';
import { unitSizing } from './templates/registry.js';

interface Part extends RoomShape { kind: RoomKind }
interface Seat { rect: UvRect; shape: RoomShape }
interface DoorFit { stretch: number; fraction: number }
interface Entry { target: string; edge: 'u0' | 'u1' | 'v0' | 'v1'; c: number; at: number; foyer: UvRect }
interface Dwelling { parts: Part[]; main: RoomShape; entry: Entry; salon: UvRect }
export const LUXURY_ENTRY_WIDTH = 1.6;
export const LUXURY_ROOM_OPENING = 1.2;

/** Full perimeter ownership for generous compact-core floors. End bays remain homes;
 * rear dwellings wrap the actual shafts instead of rejecting their entire rectangle.
 * The existing cross corridor is the only shared horizontal allocation. */
export function planPerimeterResidential(request: InteriorRequest, floor: BlueprintFloor, core: CorePlan,
  frame: FloorFrame, corridor: PlanRoom, plate: Point[], outline: Point[], ids: IdGen, diagnostics: string[] = []): PlanRoom[] | null {
  if (core.mode !== 'compact' || !['rich', 'high_rich'].includes(request.building.tier)) return null;
  const bounds = polygonBounds(plate), plateArea = Math.abs(polygonArea(plate));
  if (plateArea < 800 || plateArea < bounds.w * bounds.d * .98) return null;
  const coreBack = Math.max(...coreRectsOf(core).map(rect => rect.v + rect.lv));
  // This strategy makes habitable rear wings around the shafts. Plates with only
  // a shallow tail behind them use the existing facade-strip strategy instead;
  // a two-metre strip is not a replacement bedroom or connected apartment wing.
  if (bounds.z + bounds.d - coreBack < 4) return null;
  // The narrow shaft service stub is a shared utility closet, not an accidental
  // second apartment foyer through a 1.2m slit between the lift and stair.
  const utilityBox = { ...core.stub, u: core.riser.u, lu: core.stub.u + core.stub.lu - core.riser.u };
  const utilityShape = new RoomRegion(uvRectCorners(utilityBox)).subtract([core.riser])[0]!;
  const utility: PlanRoom = { ...utilityShape, id: `f${floor.index}-core-utility`, kind: 'mechanical_room', doors: [] };
  const solids = [...coreRectsOf(core), utility.rect];
  const geometry = new FacadeSeats(floor, core.frame, outline, request.blueprint.facade!);
  const rotated = makeFrame(core.frame.angleDeg + 90);
  const sideSeats = new FacadeSeats(floor, rotated, toUvPolygon(floor.outline, rotated), request.blueprint.facade!);
  const whole: UvRect = { u: bounds.x, v: bounds.z, lu: bounds.w, lv: bounds.d };
  const turned: UvRect = { u: bounds.z, v: -bounds.x - bounds.w, lu: bounds.d, lv: bounds.w };
  const cuts = {
    south: geometry.cuts(whole, 'v1', 0), north: geometry.cuts(whole, 'v0', 0),
    west: sideSeats.cuts(turned, 'v0', 0), east: sideSeats.cuts(turned, 'v1', 0),
  };
  // The envelope need not start on world-grid multiples after a rotated placement.
  // Keep exact end closures instead of dropping sub-grid strips at both ends.
  const corridorRect = { ...frame.corridor, u: bounds.x, lu: bounds.w };
  const fullCorridor: PlanRoom = { ...corridor, rect: corridorRect,
    polygon: clipPolygonToRect(plate, toRect(corridorRect)), doors: [] };
  const corridorConflicts = (room: PlanRoom) => partitionConflicts({ rooms: [{ id: room.id, kind: room.kind,
    polygon: toWorldPolygon(room.polygon!, core.frame), ...(room.holes ? { holes: room.holes.map(ring => toWorldPolygon(ring, core.frame)) } : {}), doors: [] }] },
  floor, request.blueprint.facade, toWorldPolygon(plate, core.frame));
  const conflicts = corridorConflicts(fullCorridor);
  if (conflicts.length) {
    const vestibules: UvRect[] = [];
    for (const west of [true, false]) {
      const edgeU = west ? bounds.x : bounds.x + bounds.w;
      if (!conflicts.some(conflict => Math.abs(worldToUv(conflict.at, core.frame)[0] - edgeU) < .1)) continue;
      const legal = west ? cuts.west : cuts.east;
      const low = [...legal].reverse().find(value => value <= frame.corridor.v + 1e-6);
      const high = legal.find(value => value >= core.vFace - 1e-6);
      if (low === undefined || high === undefined || low < bounds.z || high > bounds.z + bounds.d) return null;
      const rect = { u: west ? bounds.x : bounds.x + bounds.w - 3, v: low, lu: 3, lv: high - low };
      if (solids.some(solid => overlap(rect, solid))) return null;
      vestibules.push(rect);
    }
    // The widened ends meet real facade seats; the middle keeps its original
    // corridor width. This avoids terminating corridor partitions through glass.
    const outside = new RoomRegion(plate).subtract([frame.corridor, ...vestibules]);
    const publicShape = new RoomRegion(plate, outside.map(shape => shape.polygon!)).subtract([]);
    if (publicShape.length !== 1) return null;
    Object.assign(fullCorridor, publicShape[0]);
    if (corridorConflicts(fullCorridor).length) return null;
    solids.push(...vestibules);
  }
  const publicRooms = [fullCorridor];
  // Wide plates gain branches around the shafts, allowing additional rear homes
  // to enter from shared floor instead of merging into two oversized side homes.
  const branchEnd = Math.min(bounds.z + bounds.d - 4, coreBack + 3);
  if (branchEnd >= coreBack + 1.5) {
    const branches = [
      { name: 'west', width: core.u0 - bounds.x, u: core.u0 - 3.5 },
      { name: 'east', width: bounds.x + bounds.w - core.u1, u: core.u1 },
    ];
    for (const branch of branches) if (branch.width >= 12) {
      const rect = { u: branch.u, v: core.vFace, lu: 3.5, lv: branchEnd - core.vFace };
      publicRooms.push({ id: `f${floor.index}-${branch.name}-access`, kind: 'corridor', rect,
        polygon: uvRectCorners(rect), doors: [] });
      solids.push(rect);
    }
  }
  const strips: [UvRect, number[]][] = [
    [{ u: bounds.x, v: bounds.z, lu: bounds.w, lv: frame.corridor.v - bounds.z }, cuts.south],
    [{ u: bounds.x, v: core.vFace, lu: bounds.w, lv: bounds.z + bounds.d - core.vFace }, cuts.north],
  ];
  const allocated: (Dwelling & { seat: Seat })[] = [];
  for (const [strip, legal] of strips) {
    if (strip.lv < 10) return null;
    const ends = [...new Set([strip.u, ...legal.filter(cut => cut > strip.u && cut < strip.u + strip.lu), strip.u + strip.lu])].sort((a, b) => a - b);
    const seats = new Map<string, Seat>();
    const rejected = new Set<string>();
    const fittedSeats = new Map<string, Dwelling>();
    let maximumArea = 300;
    // A translated/rotated frame shifts the snapped core face by part of a tile.
    // Retry only after normal frontage packing fails: one half-grid depth of a
    // maximum-sized bay must not turn an otherwise complete end home into a void.
    const gridPhaseArea = 300 + 300 / strip.lv * .5;
    const accepts = (low: number, high: number): boolean => {
      if (rejected.has(`${low}:${high}`)) return false;
      if (seats.has(`${low}:${high}`)) return true;
      const rect = { ...strip, u: low, lu: high - low };
      const polygon = clipPolygonToRect(plate, toRect(rect));
      const shapes = new RoomRegion(polygon).subtract(solids);
      if (shapes.length !== 1 || roomArea(shapes[0]!) < 135 || roomArea(shapes[0]!) > maximumArea + 1e-6) return false;
      if (!publicRooms.some(room => sharedRoomEdges(shapes[0]!, room).some(edge => edge.hi - edge.lo >= 4))) return false;
      const seat = { rect, shape: shapes[0]! };
      seats.set(`${low}:${high}`, seat);
      return true;
    };
    let completed = false;
    for (let attempt = 0; attempt < 12 && !completed; attempt++) {
      // A kind building aims its homes at its reference apartment's frontage, within the
      // same complete-home area window.
      const sizing = unitSizing(request, 'apartment');
      const preferred = sizing ? Math.max(135 / strip.lv, Math.min(sizing.preferred[0], 290 / strip.lv)) : 150 / strip.lv;
      const slots = facadeSlots(ends, preferred, accepts);
      if (!slots.length || Math.abs(slots.reduce((sum, [low, high]) => sum + high - low, 0) - strip.lu) > 1e-5) {
        if (maximumArea === 300) { maximumArea = gridPhaseArea; continue; }
        diagnostics.push(`strip ${strip.lu.toFixed(2)}×${strip.lv.toFixed(2)}m at ${strip.u.toFixed(2)},${strip.v.toFixed(2)} cannot cover its full frontage with complete 135–${maximumArea.toFixed(2)}m² homes; legal cuts ${ends.map(n => n.toFixed(2)).join(',')}`);
        return null;
      }
      const batch: typeof allocated = [];
      for (const [low, high] of slots) {
        const key = `${low}:${high}`, seat = seats.get(key)!;
        const fitted = fittedSeats.get(key) ?? fitDwelling(seat, whole, cuts, solids, publicRooms);
        if (!fitted) {
          diagnostics.push(`bay ${low.toFixed(2)}–${high.toFixed(2)} (${roomArea(seat.shape).toFixed(2)}m²) rejected: no connected living entry with legal daylight bedroom, two complete bathrooms, kitchen and storage`);
          rejected.add(key); break;
        }
        fittedSeats.set(key, fitted);
        batch.push({ seat, ...fitted });
      }
      if (batch.length === slots.length) { allocated.push(...batch); completed = true; }
    }
    if (!completed) { diagnostics.push('complete floor partition search exhausted its bounded alternatives'); return null; }
  }
  const privateArea = allocated.reduce((sum, unit) => sum + roomArea(unit.seat.shape), 0);
  if (allocated.length < 3 || privateArea < plateArea * .65) {
    diagnostics.push(`${allocated.length} complete homes cover only ${privateArea.toFixed(2)}/${plateArea.toFixed(2)}m²`); return null;
  }
  // Full ownership must leave no unexplained public lounge or sealed remainder.
  const assigned = new RoomRegion(plate).subtract([...solids, fullCorridor.rect, ...allocated.map(unit => unit.seat.rect)]);
  if (assigned.reduce((sum, shape) => sum + roomArea(shape), 0) > 1) {
    diagnostics.push('complete home allocations leave unexplained residual floor outside the core and circulation'); return null;
  }
  doorBetween(utility, fullCorridor.id, fullCorridor, ids, 1, .9);
  for (const branch of publicRooms.slice(1)) doorBetween(branch, fullCorridor.id, fullCorridor, ids, 2, 2.4);
  const rooms: PlanRoom[] = [...publicRooms, utility];
  for (const [index, allocation] of allocated.entries()) {
    const unit = `f${floor.index}-home-${index + 1}`;
    const main: PlanRoom = { ...allocation.main, id: ids.room(), kind: 'living', unit, doors: [],
      furnishingKeepouts: [allocation.entry.foyer] };
    const target = publicRooms.find(room => room.id === allocation.entry.target)!;
    const entry = fixedEntryFit(main, target, allocation.entry);
    if (!entry) { diagnostics.push(`${unit} lost its validated pocket entrance`); return null; }
    const entrance = doorBetween(main, target.id, target, ids, 2, LUXURY_ENTRY_WIDTH, entry.fraction, entry.stretch);
    if (entrance && !entrance.openFront) entrance.clearDepth = 0; // paired pockets have no inward swing
    rooms.push(main);
    for (const part of allocation.parts) {
      const room: PlanRoom = { ...part, polygon: roomPolygon(part), id: ids.room(), unit, doors: [] };
      const fit = doorFit(room, main, part.kind === 'kitchen' ? 1.6 : LUXURY_ROOM_OPENING, allocation.salon);
      if (!fit) { diagnostics.push(`${unit} lost its validated private doorway`); return null; }
      const opening = doorBetween(room, main.id, main, ids, part.kind === 'kitchen' ? 2 : 1,
        part.kind === 'kitchen' ? 1.6 : LUXURY_ROOM_OPENING, fit.fraction, fit.stretch);
      if (opening && !opening.openFront) opening.clearDepth = 0; // currently an open internal passage
      rooms.push(room);
    }
  }
  return rooms;
}

type Cuts = { south: number[]; north: number[]; west: number[]; east: number[] };
// Repeated storeys have the same geometric programme. Cache only that immutable
// fit; room/door identities are assigned later and must remain floor-specific.
const dwellingFits = new Map<string, Dwelling | null>();
function fitDwelling(seat: Seat, plate: UvRect, cuts: Cuts, core: UvRect[], corridors: PlanRoom[]): Dwelling | null {
  const key = JSON.stringify([seat, plate, cuts, core,
    corridors.map(room => [room.rect, roomPolygon(room), room.holes ?? []])]);
  if (dwellingFits.has(key)) {
    const cached = dwellingFits.get(key)!;
    if (!cached) return null;
    const result = structuredClone(cached);
    result.entry.target = corridors[Number(result.entry.target)]!.id;
    return result;
  }
  const fitted = computeDwelling(seat, plate, cuts, core, corridors);
  const stored = fitted ? structuredClone(fitted) : null;
  if (stored) stored.entry.target = String(corridors.findIndex(room => room.id === stored.entry.target));
  if (dwellingFits.size >= 256) dwellingFits.delete(dwellingFits.keys().next().value!);
  dwellingFits.set(key, stored);
  return fitted ? structuredClone(fitted) : null;
}

function computeDwelling(seat: Seat, plate: UvRect, cuts: Cuts, core: UvRect[], corridors: PlanRoom[]): Dwelling | null {
  const corridor = corridors[0]!;
  const bedrooms = bedroomCandidates(seat, plate, cuts);
  const program: { kind: RoomKind; size: [number, number] }[] = [
    { kind: 'bathroom', size: [3.5, 3.5] }, { kind: 'kitchen', size: [4, 4] },
    { kind: 'bathroom', size: [3.5, 3.5] }, { kind: 'storage', size: [2.5, 2.5] },
  ];
  const area = roomArea(seat.shape);
  for (const entry of entryCandidates(seat.shape, corridors).slice(0, 16)) for (const bedroom of bedrooms.slice(0, 30)) {
    // The foyer is allocated before the bedroom or wet rooms. A small inward
    // bedroom notch can keep the real facade bay while retaining a proper arrival.
    const bedroomShapes = new RoomRegion(uvRectCorners(bedroom)).subtract([entry.foyer]);
    const sleeping = bedroomShapes.length === 1 ? bedroomShapes[0] : undefined;
    if (!sleeping || roomArea(sleeping) < 25 || !bedGroupFits(sleeping)) continue;
    for (const salon of salonCandidates(seat.shape, sleeping, entry.foyer)) {
      const initial: Part[] = [{ ...sleeping, kind: 'bedroom' }];
      const target = corridors.find(room => room.id === entry.target)!;
      let attempts = 0;
      const fit = (parts: Part[], depth: number): Dwelling | null => {
        if (++attempts > 700) return null;
        const remainder = subtractParts(seat.shape, parts);
        const main = remainder.length === 1 ? remainder[0] : undefined;
        if (!main || roomArea(main) < 40 || !roomCoversRect(main, entry.foyer) || !fixedEntryFit(main, target, entry)
          || parts.some(part => !doorFit(part, main, part.kind === 'kitchen' ? 1.6 : LUXURY_ROOM_OPENING, salon))
          || !livingConnected(main)) return null;
        if (depth === program.length) {
          // A guest study is useful extra private space, never another bedroom through-route.
          if (area >= 185) for (const rect of serviceCandidates(seat, plate, core, corridor.rect, [4, 4], parts, [entry.foyer, salon]).slice(0, 50)) {
            const withStudy = [...parts, { kind: 'office_private' as const, rect }];
            const shapes = subtractParts(seat.shape, withStudy);
            if (shapes.length === 1 && roomArea(shapes[0]!) >= 40 && fixedEntryFit(shapes[0]!, target, entry)
              && withStudy.every(part => doorFit(part, shapes[0]!, part.kind === 'kitchen' ? 1.6 : LUXURY_ROOM_OPENING, salon))
              && livingConnected(shapes[0]!)) return { parts: withStudy, main: shapes[0]!, entry, salon };
          }
          return { parts, main, entry, salon };
        }
        const item = program[depth]!;
        for (const rect of serviceCandidates(seat, plate, core, corridor.rect, item.size, parts, [entry.foyer, salon]).slice(0, 65)) {
          const fitted = fit([...parts, { kind: item.kind, rect }], depth + 1);
          if (fitted) return fitted;
        }
        return null;
      };
      const fitted = fit(initial, 0);
      if (fitted) return fitted;
    }
  }
  return null;
}

/** A full salon is allocated before service boxes. It shares an opaque bedroom
 * wall and remains free of room-door approaches; generous total living area alone
 * cannot guarantee a useful seating bay in a fragmented polygon. */
function salonCandidates(shape: RoomShape, bedroom: RoomShape, foyer: UvRect): UvRect[] {
  const b = bedroom.rect, out: UvRect[] = [];
  for (const [lu, lv] of [[5.1, 4.8], [4.8, 5.1]]) {
    const candidates: UvRect[] = [];
    for (let offset = 0; offset <= Math.max(b.lu, b.lv); offset += .5) {
      candidates.push({ u: b.u + offset, v: b.v - lv!, lu: lu!, lv: lv! },
        { u: b.u + offset, v: b.v + b.lv, lu: lu!, lv: lv! },
        { u: b.u - lu!, v: b.v + offset, lu: lu!, lv: lv! },
        { u: b.u + b.lu, v: b.v + offset, lu: lu!, lv: lv! });
    }
    for (const rect of candidates) {
      if (overlap(rect, foyer) || overlap(rect, b) || !roomCoversRect(shape, rect)) continue;
      const contacts = sharedRoomEdges({ rect }, bedroom);
      if (!contacts.some(edge => edge.hi - edge.lo >= 3.4)) continue;
      out.push(rect);
    }
  }
  return out;
}

function subtractParts(shape: RoomShape, parts: Part[]): RoomShape[] {
  return new RoomRegion(shape.polygon!, [...(shape.holes ?? []), ...parts.map(part => roomPolygon(part))]).subtract([]);
}

/** Four metres of straight wall holds a 1.6m opening and two real pockets. Two
 * metres of private arrival depth remains usable before any furnishing is tried. */
function entryCandidates(shape: RoomShape, corridors: PlanRoom[]): Entry[] {
  const out: (Entry & { score: number })[] = [];
  for (const target of corridors) for (const edge of sharedRoomEdges(shape, target)) {
    if (edge.hi - edge.lo < 4 - 1e-6) continue;
    for (let at = Math.ceil((edge.lo + 2) * 2) / 2; at <= edge.hi - 2 + 1e-6; at += .5) {
      const horizontal = edge.edge.startsWith('v'), low = edge.edge.endsWith('0');
      const foyer = horizontal ? { u: at - 2, v: low ? edge.c : edge.c - 2, lu: 4, lv: 2 }
        : { u: low ? edge.c : edge.c - 2, v: at - 2, lu: 2, lv: 4 };
      if (!roomCoversRect(shape, foyer)) continue;
      out.push({ target: target.id, edge: edge.edge, c: edge.c, at, foyer,
        score: Math.abs(at - (edge.lo + edge.hi) / 2) });
    }
  }
  return out.sort((a, b) => a.score - b.score).map(({ score: _, ...entry }) => entry);
}

function fixedEntryFit(main: RoomShape, target: RoomShape, entry: Entry): DoorFit | null {
  if (!roomCoversRect(main, entry.foyer)) return null;
  const edges = sharedRoomEdges(main, target);
  const stretch = edges.findIndex(edge => edge.edge === entry.edge && Math.abs(edge.c - entry.c) < 1e-6
    && entry.at - 2 >= edge.lo - 1e-6 && entry.at + 2 <= edge.hi + 1e-6);
  if (stretch < 0) return null;
  const edge = edges[stretch]!, span = edge.hi - edge.lo - LUXURY_ENTRY_WIDTH - 2 * BAND_CLEAR;
  return { stretch, fraction: Math.max(0, Math.min(1, (entry.at - edge.lo - LUXURY_ENTRY_WIDTH / 2 - BAND_CLEAR) / span)) };
}

function bedGroupFits(shape: RoomShape): boolean {
  for (const [lu, lv] of [[4.2, 4], [4, 4.2]]) {
    for (let v = shape.rect.v + .1; v + lv! <= shape.rect.v + shape.rect.lv - .1 + 1e-6; v += .5)
      for (let u = shape.rect.u + .1; u + lu! <= shape.rect.u + shape.rect.lu - .1 + 1e-6; u += .5)
        if (roomCoversRect(shape, { u, v, lu: lu!, lv: lv! }, .05)) return true;
  }
  return false;
}

function bedroomCandidates(seat: Seat, plate: UvRect, cuts: Cuts): UvRect[] {
  const candidates: UvRect[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-5;
  const has = (values: number[], n: number) => values.some(value => near(value, n));
  const faces = [
    { along: true, low: true, cuts: cuts.south }, { along: true, low: false, cuts: cuts.north },
    { along: false, low: true, cuts: cuts.west }, { along: false, low: false, cuts: cuts.east },
  ];
  for (const face of faces) {
    const low = face.along ? plate.u : plate.v, high = low + (face.along ? plate.lu : plate.lv);
    const positions = [...new Set([low, ...face.cuts, high])].filter(value => value >= low && value <= high).sort((a, b) => a - b);
    for (let start = 0; start < positions.length; start++) for (let end = start + 1; end < positions.length; end++) {
      const a = positions[start]!, b = positions[end]!, width = b - a;
      if (width < 4.5 || width > 7) continue;
      for (const depth of [5, 5.5, 6, 4.5]) {
        if (width * depth < 25) continue;
        const rect: UvRect = face.along
          ? { u: a, v: face.low ? plate.v : plate.v + plate.lv - depth, lu: width, lv: depth }
          : { u: face.low ? plate.u : plate.u + plate.lu - depth, v: a, lu: depth, lv: width };
        if (rect.u < seat.rect.u - 1e-6 || rect.v < seat.rect.v - 1e-6
          || rect.u + rect.lu > seat.rect.u + seat.rect.lu + 1e-6
          || rect.v + rect.lv > seat.rect.v + seat.rect.lv + 1e-6) continue;
        if (!roomCoversRect(seat.shape, rect)) continue;
        // The two partitions at a corner must both meet legal facade seats.
        if (near(rect.u, plate.u) && ((!near(rect.v, plate.v) && !has(cuts.west, rect.v))
          || (!near(rect.v + rect.lv, plate.v + plate.lv) && !has(cuts.west, rect.v + rect.lv)))) continue;
        if (near(rect.u + rect.lu, plate.u + plate.lu) && ((!near(rect.v, plate.v) && !has(cuts.east, rect.v))
          || (!near(rect.v + rect.lv, plate.v + plate.lv) && !has(cuts.east, rect.v + rect.lv)))) continue;
        if (near(rect.v, plate.v) && ((!near(rect.u, plate.u) && !has(cuts.south, rect.u))
          || (!near(rect.u + rect.lu, plate.u + plate.lu) && !has(cuts.south, rect.u + rect.lu)))) continue;
        if (near(rect.v + rect.lv, plate.v + plate.lv) && ((!near(rect.u, plate.u) && !has(cuts.north, rect.u))
          || (!near(rect.u + rect.lu, plate.u + plate.lu) && !has(cuts.north, rect.u + rect.lu)))) continue;
        candidates.push(rect);
      }
    }
  }
  return candidates.sort((a, b) => Math.abs(a.lu * a.lv - 27.5) - Math.abs(b.lu * b.lv - 27.5));
}

function serviceCandidates(seat: Seat, plate: UvRect, core: UvRect[], corridor: UvRect, size: [number, number], parts: Part[], reserved: UvRect[] = []): UvRect[] {
  const out: { rect: UvRect; score: number }[] = [];
  const orientations = size[0] === size[1] ? [size] : [size, [size[1], size[0]] as [number, number]];
  for (const [lu, lv] of orientations) {
    const lowU = Math.ceil(Math.max(seat.rect.u, plate.u + 1) * 2) / 2;
    const lowV = Math.ceil(Math.max(seat.rect.v, plate.v + 1) * 2) / 2;
    const highU = Math.min(seat.rect.u + seat.rect.lu, plate.u + plate.lu - 1) - lu;
    const highV = Math.min(seat.rect.v + seat.rect.lv, plate.v + plate.lv - 1) - lv;
    for (let v = lowV; v <= highV + 1e-6; v += .5) for (let u = lowU; u <= highU + 1e-6; u += .5) {
      const rect = { u, v, lu, lv };
      if (parts.some(part => overlap(rect, part.rect)) || reserved.some(zone => overlap(rect, zone)) || !roomCoversRect(seat.shape, rect)) continue;
      const cluster = parts.find(part => part.kind === 'bathroom');
      const score = Math.min(...core.map(solid => separation(rect, solid))) + separation(rect, corridor) * .6
        + (cluster ? separation(rect, cluster.rect) * .4 : 0);
      out.push({ rect, score });
    }
  }
  return out.sort((a, b) => a.score - b.score || a.rect.v - b.rect.v || a.rect.u - b.rect.u).map(item => item.rect);
}

/** Both door approaches occupy real area of their own room, not a thin leftover. */
function doorFit(owner: RoomShape, target: RoomShape, width = .9, salon?: UvRect): DoorFit | null {
  const edges = sharedRoomEdges(owner, target);
  for (let stretch = 0; stretch < edges.length; stretch++) {
    const edge = edges[stretch]!;
    if (edge.hi - edge.lo < Math.max(MIN_STRETCH, 1.4)) continue;
    for (const fraction of [.5, .25, .75, .1, .9]) {
      const w = doorWidthOn(edge.hi - edge.lo, width);
      const span = edge.hi - edge.lo - w - 2 * BAND_CLEAR;
      const centre = span > 0 ? edge.lo + w / 2 + BAND_CLEAR + span * fraction : (edge.lo + edge.hi) / 2;
      let at = snap(centre);
      if (at - w / 2 < edge.lo + BAND_CLEAR || at + w / 2 > edge.hi - BAND_CLEAR) at = centre;
      const horizontal = edge.edge.startsWith('v'), inward = edge.edge.endsWith('0') ? 1 : -1;
      const point: Point = horizontal ? [at, edge.c] : [edge.c, at];
      const fits = (room: RoomShape, sign: number) => {
        const half = sign > 0 ? .45 : .85, depth = sign > 0 ? .65 : .95;
        return roomCoversRect(room, {
          u: point[0] + (horizontal ? 0 : sign * inward * depth) - half,
          v: point[1] + (horizontal ? sign * inward * depth : 0) - half, lu: half * 2, lv: half * 2,
        });
      };
      const approach: UvRect = horizontal ? { u: point[0] - w / 2 - .1, v: point[1] - 1, lu: w + .2, lv: 2 }
        : { u: point[0] - 1, v: point[1] - w / 2 - .1, lu: 2, lv: w + .2 };
      if ((!salon || !overlap(approach, salon)) && fits(owner, 1) && fits(target, -1)) return { stretch, fraction };
    }
  }
  return null;
}

function separation(a: UvRect, b: UvRect): number {
  return Math.hypot(Math.max(0, a.u - b.u - b.lu, b.u - a.u - a.lu), Math.max(0, a.v - b.v - b.lv, b.v - a.v - a.lv));
}
function overlap(a: UvRect, b: UvRect): boolean {
  return Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u) > 1e-6
    && Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v) > 1e-6;
}
function toRect(rect: UvRect) { return { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv }; }

