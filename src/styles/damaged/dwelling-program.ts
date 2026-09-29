import type { Point } from '../../core/geom.js';
import type { RoomKind } from '../../core/types.js';
import type { EdgeName, PlanRoom } from '../../layout/plan-types.js';
import { RoomRegion } from '../../layout/room-region.js';
import { roomArea, roomClearance, roomCoversRect, roomEdges, sharedRoomEdges, type RoomShape } from '../../layout/room-shape.js';
import { BAND_CLEAR, doorBetween, doorWidthOn, idGen, type IdGen } from '../../layout/rooms.js';
import { snap, uvRectCorners, type UvRect } from '../../layout/uv.js';
import { doorZonesByRoom } from '../../layout/clearance.js';
import { fitResidentialComposition, type ResidentialPiece } from '../capsule/composition.js';
import { fixtureAccessPaths } from '../../layout/compact-fixtures.js';

interface Part { kind: RoomKind; rect: UvRect }
interface DoorFit { stretch: number; fraction: number }

/** A separate sleeping room, bathroom and kitchen inside the shell's legal frontage.
 * Jig-Jig supplies the functional relationships, not its small measured-looking scale
 * or excluded purple/animal palette. The caller retains facade seats and public routes.
 * `side` is the public/service edge: v0 low V, v1 high V. No ID is consumed on failure.
 * The complete private entrance must be published by the caller at 1.2m clear width. */
export function damagedDwellingProgram(rect: UvRect, side: 'v0' | 'v1', polygon: Point[],
  legalCuts: readonly number[], unit: string, ids: IdGen): PlanRoom[] | null {
  if (rect.lu < 6.4 || rect.lv < 7 || roomArea({ rect, polygon }) < 64) return null;
  const rectangular = Math.abs(roomArea({ rect, polygon }) - rect.lu * rect.lv) < 1e-6;
  const near = (u: number, width: number, offset: number, depth: number): UvRect => ({ u,
    v: side === 'v0' ? rect.v + offset : rect.v + rect.lv - offset - depth,
    lu: width, lv: depth });
  const fromDaylight = (u: number, width: number, offset: number, depth: number): UvRect =>
    near(u, width, rect.lv - offset - depth, depth);
  const candidates: { parts: Part[]; partial: boolean }[] = [];
  const bedrooms = [...new Set(legalCuts)].flatMap(cut => [false, true].flatMap(mirrored => {
    const width = mirrored ? rect.u + rect.lu - cut : cut - rect.u;
    if (width < 3.5 - 1e-6 || width > 5.5 + 1e-6 || width >= rect.lu - 1e-6) return [];
    return [{ mirrored, width, u: mirrored ? cut : rect.u }];
  })).sort((a, b) => Math.abs(a.width - 4.25) - Math.abs(b.width - 4.25) || Number(a.mirrored) - Number(b.mirrored));
  // A legal internal pier creates a daylight bedroom beside a useful living bay.
  // The kitchen moves toward the service edge rather than closing either neck.
  for (const bedroom of bedrooms) for (const bedroomDepth of [3.5, 4])
    for (const kitchenWidth of [3.5, 3]) for (const stagger of [0, .5, 1]) {
      candidates.push({ partial: true, parts: [
        { kind: 'bedroom', rect: fromDaylight(bedroom.u, bedroom.width, 0, bedroomDepth) },
        { kind: 'bathroom', rect: near(bedroom.mirrored ? rect.u + rect.lu - 3 : rect.u, 3, 0, 3) },
        { kind: 'kitchen', rect: fromDaylight(bedroom.mirrored ? rect.u : rect.u + rect.lu - kitchenWidth,
          kitchenWidth, bedroomDepth + stagger, 3) },
      ] });
    }
  // Facades without a legal internal pier keep the full-width sleeping-room
  // option. All variants still have to hold the real sofa/table/media bay.
  for (const bedroomDepth of [3.5, 4, 3]) for (const kitchenWidth of [3.5, 3]) for (const mirrored of [false, true]) {
    candidates.push({ partial: false, parts: [
      { kind: 'bedroom', rect: fromDaylight(rect.u, rect.lu, 0, bedroomDepth) },
      { kind: 'bathroom', rect: near(mirrored ? rect.u + rect.lu - 3 : rect.u, 3, 0, 3) },
      { kind: 'kitchen', rect: fromDaylight(mirrored ? rect.u : rect.u + rect.lu - kitchenWidth, kitchenWidth, bedroomDepth, 3) },
    ] });
  }
  for (const { parts, partial } of candidates) {
    if (parts.some(part => !roomCoversRect({ rect, polygon }, part.rect))) continue;
    if (parts.some((part, i) => parts.slice(i + 1).some(other => overlap(part.rect, other.rect)))) continue;
    const living = new RoomRegion(polygon).subtract(parts.map(part => part.rect));
    if (living.length !== 1 || roomArea(living[0]!) < 22) continue;
    const mainShape = living[0]!;
    if (!entryApproach(mainShape, rect, side)) continue;
    if (rectangular) {
      if (serviceSeparation(parts[1]!.rect, parts[2]!.rect) < 1.1 + 1e-6) continue;
      if (partial && serviceSeparation(parts[0]!.rect, parts[2]!.rect) < 1.1 + 1e-6) continue;
    } else if (!connectedLiving(mainShape)) continue;
    for (const bedroomFractions of [[.04], [.96], [.12, .88, .25, .75, .5]]) {
      const fits = parts.map(part => doorFit(part, mainShape, part.kind === 'kitchen' ? 1.6 : .9,
        part.kind === 'bedroom', part.kind === 'bedroom' ? bedroomFractions : undefined));
      if (fits.some(fit => !fit)) continue;
      const probe = buildRooms(parts, mainShape, fits as DoorFit[], 'probe', idGen(0));
      if (!hasLivingComposition(probe, rect, side)) continue;
      return buildRooms(parts, mainShape, fits as DoorFit[], unit, ids);
    }
  }
  return null;
}

function buildRooms(parts: Part[], mainShape: RoomShape, fits: DoorFit[], unit: string, ids: IdGen): PlanRoom[] {
  const main: PlanRoom = { ...mainShape, id: ids.room(), kind: 'living', unit, doors: [] };
  const rooms: PlanRoom[] = [main];
  parts.forEach((part, index) => {
    const room: PlanRoom = { ...part, polygon: uvRectCorners(part.rect), id: ids.room(), unit, doors: [] };
    const fit = fits[index]!;
    doorBetween(room, main.id, main, ids, part.kind === 'kitchen' ? 2 : 1,
      part.kind === 'kitchen' ? 1.6 : .9, fit.fraction, fit.stretch);
    rooms.push(room);
  });
  return rooms;
}

/** Require an actual full-size composition against an internal opaque partition,
 * keeping every private doorway reservation. The caller adds the public entrance
 * and its access-domain routes; no unavailable furniture is removed or shrunk here. */
function hasLivingComposition(rooms: PlanRoom[], envelope: UvRect, side: 'v0' | 'v1'): boolean {
  const main = rooms[0]!, zones = (doorZonesByRoom(rooms).get(main.id) ?? []).map(zone => zone.rect);
  // A bay cannot occupy the unit's arrival area. Reserve the first service-edge
  // entrance with the same cassette/approach dimensions used by the shared packer.
  const service = side === 'v0' ? envelope.v : envelope.v + envelope.lv;
  let entry: UvRect | undefined;
  for (const edge of roomEdges(main)) {
    if (edge.edge !== side || Math.abs(edge.a[1] - service) > 1e-6) continue;
    const low = Math.min(edge.a[0], edge.b[0]), high = Math.max(edge.a[0], edge.b[0]);
    if (high - low < 3) continue;
    for (const fraction of [.5, .2, .8]) {
      const at = low + 1.35 + (high - low - 2.7) * fraction;
      const zone = { u: at - .75, v: side === 'v0' ? service : service - 1.25, lu: 1.5, lv: 1.25 };
      if (!roomCoversRect(main, zone)) continue;
      entry = zone; break;
    }
    if (entry) break;
  }
  if (!entry) return false;
  zones.push(entry);
  const opposite: Record<EdgeName, EdgeName> = { u0: 'u1', u1: 'u0', v0: 'v1', v1: 'v0' };
  const entryAt = entry.u + entry.lu / 2;
  const accessRoom: PlanRoom = { ...main, doors: [{ id: 'probe-public-entry', to: 'public',
    edge: side, at: entryAt, position: [entryAt, service], width: 1.2, leaves: 1, clearDepth: 0 }] };
  for (const owner of rooms.slice(1)) for (const door of owner.doors) {
    if (door.to !== main.id || door.openFront) continue;
    const position: Point = door.position ?? (door.edge === 'v0' ? [door.at, owner.rect.v]
      : door.edge === 'v1' ? [door.at, owner.rect.v + owner.rect.lv]
      : door.edge === 'u0' ? [owner.rect.u, door.at] : [owner.rect.u + owner.rect.lu, door.at]);
    accessRoom.doors.push({ ...door, to: owner.id, edge: opposite[door.edge], position: [...position] });
  }
  // Separate rectangle gaps can look broad diagonally while leaving an unusable
  // neck between living lobes. Prove every actual port with the unchanged shared
  // body-and-wall clearance before investing in a candidate furniture group.
  if (!fixtureAccessPaths(accessRoom, [])) return false;
  const footprint = (piece: ResidentialPiece): UvRect => {
    const turned = piece.rotationDeg % 180 !== 0;
    const lu = piece.size[turned ? 1 : 0], lv = piece.size[turned ? 0 : 1];
    return { u: piece.at[0] - lu / 2, v: piece.at[1] - lv / 2, lu, lv };
  };
  const backs = (piece: ResidentialPiece): boolean => {
    const edge = piece.rotationDeg === 0 ? 'v0' : piece.rotationDeg === 90 ? 'u0' : piece.rotationDeg === 180 ? 'v1' : 'u1';
    const horizontal = edge.startsWith('v'), axis = horizontal ? 0 : 1, cross = 1 - axis;
    return rooms.slice(1).some(room => sharedRoomEdges(main, room).some(shared => shared.edge === edge
      && Math.abs(shared.c - piece.at[cross]!) <= .32
      && piece.at[axis]! - piece.size[0] / 2 >= shared.lo + .05
      && piece.at[axis]! + piece.size[0] / 2 <= shared.hi - .05));
  };
  return !!fitResidentialComposition(main, main.rect, 'damaged', (_reservation, pieces) => {
    if (!pieces.every(piece => {
      const fp = footprint(piece), gap = piece.elevation ? .05 : .15;
      return roomCoversRect(main, fp, .05) && zones.every(zone => !overlapWithGap(fp, zone, gap))
        && (piece.kind !== 'display_screen' || backs(piece));
    })) return false;
    // Match the selected architecture's 0.0625m physical grid: the shared planner
    // keeps a 0.30m body sweep, 0.15m furniture gap and one cell for diagonal
    // sweep boxes. fixtureAccessPaths already carries its 0.34m body and skin.
    const margin = .30 + .15 + .0625 - .34;
    const solids = pieces.filter(piece => !(piece.elevation && piece.elevation > 0)).map(piece => {
      const fp = footprint(piece);
      return { u: fp.u - margin, v: fp.v - margin, lu: fp.lu + margin * 2, lv: fp.lv + margin * 2 };
    });
    return fixtureAccessPaths(accessRoom, [], solids) !== null;
  });
}
function overlapWithGap(a: UvRect, b: UvRect, gap: number): boolean {
  return a.u < b.u + b.lu + gap - 1e-8 && a.u + a.lu + gap > b.u + 1e-8
    && a.v < b.v + b.lv + gap - 1e-8 && a.v + a.lv + gap > b.v + 1e-8;
}

function entryApproach(main: RoomShape, envelope: UvRect, side: 'v0' | 'v1'): boolean {
  const width = 1.2;
  for (let u = envelope.u + .1; u + width <= envelope.u + envelope.lu - .1 + 1e-7; u += .25) {
    if (roomCoversRect(main, { u, v: side === 'v0' ? envelope.v : envelope.v + envelope.lv - width,
      lu: width, lv: width })) return true;
  }
  return false;
}

/** Actual post-snap doorway and usable approaches, not just a shared line length. */
function doorFit(owner: RoomShape, target: RoomShape, width: number, preferEnd = false, preferredFractions?: readonly number[]): DoorFit | null {
  const edges = sharedRoomEdges(owner, target);
  for (let stretch = 0; stretch < edges.length; stretch++) {
    const edge = edges[stretch]!;
    if (edge.hi - edge.lo < width + 2 * BAND_CLEAR) continue;
    // A wide kitchen opening near one end preserves a full appliance wall.
    // Centering it on a 3m wall traps the fridge in the sink/cooktop approach.
    for (const fraction of preferredFractions ?? (width >= 1.5 ? [.25, .75, .1, .9, .5] : preferEnd ? [.04, .96, .12, .88, .25, .75, .5] : [.5, .25, .75, .1, .9])) {
      const w = doorWidthOn(edge.hi - edge.lo, width), span = edge.hi - edge.lo - w - 2 * BAND_CLEAR;
      const center = span > 0 ? edge.lo + w / 2 + BAND_CLEAR + span * fraction : (edge.lo + edge.hi) / 2;
      let at = snap(center);
      if (at - w / 2 < edge.lo + BAND_CLEAR || at + w / 2 > edge.hi - BAND_CLEAR) at = center;
      const horizontal = edge.edge.startsWith('v'), inward = edge.edge.endsWith('0') ? 1 : -1;
      const clearWidth = Math.max(1.1, width + .1), depth = 1.2;
      const approach = (sign: number): UvRect => {
        const normal = inward * sign;
        return horizontal ? { u: at - clearWidth / 2, v: edge.c + (normal > 0 ? 0 : -depth), lu: clearWidth, lv: depth }
          : { u: edge.c + (normal > 0 ? 0 : -depth), v: at - clearWidth / 2, lu: depth, lv: clearWidth };
      };
      if (roomCoversRect(owner, approach(1)) && roomCoversRect(target, approach(-1))) return { stretch, fraction };
    }
  }
  return null;
}

/** A 1.1m clear body can connect all usable living space. Segment probes prevent a
 * diagonal graph edge from crossing a service-room corner between clear samples. */
function connectedLiving(room: RoomShape): boolean {
  const step = .2, radius = .55, cells = new Map<string, Point>();
  for (let row = 0, v = room.rect.v + step / 2; v < room.rect.v + room.rect.lv; v += step, row++)
    for (let column = 0, u = room.rect.u + step / 2; u < room.rect.u + room.rect.lu; u += step, column++)
      if (roomClearance(room, [u, v]) >= radius) cells.set(`${column}:${row}`, [u, v]);
  const first = cells.entries().next().value as [string, Point] | undefined;
  if (!first) return false;
  const pending = [first]; cells.delete(first[0]);
  while (pending.length) {
    const [key, point] = pending.pop()!, [column, row] = key.split(':').map(Number);
    for (const du of [-1, 0, 1]) for (const dv of [-1, 0, 1]) {
      if (!du && !dv) continue;
      const nextKey = `${column! + du}:${row! + dv}`, next = cells.get(nextKey);
      if (!next) continue;
      if ([.25, .5, .75].some(t => roomClearance(room, [point[0] + (next[0] - point[0]) * t,
        point[1] + (next[1] - point[1]) * t]) < radius)) continue;
      cells.delete(nextKey); pending.push([nextKey, next]);
    }
  }
  return cells.size === 0;
}
function overlap(a: UvRect, b: UvRect): boolean {
  return Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u) > 1e-7
    && Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v) > 1e-7;
}
function serviceSeparation(a: UvRect, b: UvRect): number {
  return Math.hypot(Math.max(0, a.u - b.u - b.lu, b.u - a.u - a.lu),
    Math.max(0, a.v - b.v - b.lv, b.v - a.v - a.lv));
}
