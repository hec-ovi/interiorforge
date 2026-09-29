import { polygonArea, polygonBounds, type Point } from '../../core/geom.js';
import type { BlueprintFloor, InteriorRequest } from '../../core/types.js';
import type { CorePlan } from '../../layout/core-plan.js';
import { FacadeSeats, facadeSlots } from '../../layout/facade-seats.js';
import { approachKeepouts, partitionConflicts } from '../../layout/openings.js';
import { coreRectsOf } from '../../layout/pier-align.js';
import type { FloorFrame, PlanRoom } from '../../layout/plan-types.js';
import { RoomRegion } from '../../layout/room-region.js';
import { roomArea, roomContains, roomCoversRect, sharedRoomEdges, type RoomShape } from '../../layout/room-shape.js';
import { doorBetween, idGen, type IdGen } from '../../layout/rooms.js';
import { makeFrame, toUvPolygon, toWorldPolygon, uvRectCorners, worldToUv, type Frame, type UvRect } from '../../layout/uv.js';
import { fitResidentialComposition } from './composition.js';
import { capsuleProfile } from './profile.js';

interface Candidate { rect: UvRect; bath: UvRect; kitchen?: UvRect; bedroom?: UvRect; score: number; face: number; low: number; high: number; template?: PlanRoom[] }
/** A family may provide a complete validated private programme in the core frame. */
export type StandardUnitProgram = (rect: UvRect, cuts: readonly number[], face: Frame, core: Frame, ids: IdGen) => PlanRoom[] | null;
const overlap = (a: UvRect, b: UvRect): boolean => Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u) > 1e-6
  && Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v) > 1e-6;

/** Standard residential homes use all compatible facade orientations. A legal
 * 8-ish metre bay makes a 75 m² open home with a sleeping niche; it never expands
 * to a 200 m² studio merely because one facade has unusually sparse supports.
 * Core and exterior seats remain authoritative. All dimensions are metre values. */
export function planCapsuleResidential(request: InteriorRequest, floor: BlueprintFloor, core: CorePlan,
  frame: FloorFrame, plate: Point[], outline: Point[], ids: IdGen, tier: 'mid' | 'poor' = 'mid', diagnostics: string[] = [], unitProgram?: StandardUnitProgram): PlanRoom[] | null {
  if (request.building.type !== 'residential' || request.building.tier !== tier || Math.abs(polygonArea(plate)) < 500) return null;
  const bounds = polygonBounds(plate);
  if (Math.abs(polygonArea(plate)) < bounds.w * bounds.d * .98) return null;
  const solids = coreRectsOf(core);
  // Widen the public approach toward the front, preserving every core door and
  // shaft position. Subsequent navigation reserves the actual clear route.
  const spine = { u: core.u0, lu: core.u1 - core.u0, v: core.vFace - 3, lv: 3 };
  const keepouts = [...solids, spine, ...approachKeepouts(floor, core.frame, request.blueprint.facade?.wallDepth ?? .3).map(item => item.rect)];
  const candidates: Candidate[] = [];
  const compositionProfile = tier === 'poor' ? 'damaged' : request.building.interiorStyle === 'sandra-dorsett' ? 'sandra-dorsett' : capsuleProfile(request);
  const checkRooms = (rooms: PlanRoom[]) => partitionConflicts({ rooms: rooms.map(room => ({ id: room.id, kind: room.kind,
    polygon: toWorldPolygon(room.polygon ?? uvRectCorners(room.rect), core.frame),
    ...(room.holes?.length ? { holes: room.holes.map(hole => toWorldPolygon(hole, core.frame)) } : {}), doors: [] })) },
  floor, request.blueprint.facade, toWorldPolygon(plate, core.frame)).length === 0;
  // In each temporary face frame, the facade lies at min V and the private
  // entrance lies at max V. Rotating back uses the building frame, never world X.
  for (const quarter of [0, 1, 2, 3]) {
    const face = makeFrame(core.frame.angleDeg + quarter * 90);
    const localPlate = toUvPolygon(toWorldPolygon(plate, core.frame), face);
    const localBounds = polygonBounds(localPlate), localOutline = toUvPolygon(floor.outline, face);
    const seats = new FacadeSeats(floor, face, localOutline, request.blueprint.facade!);
    const strip: UvRect = { u: localBounds.x, v: localBounds.z, lu: localBounds.w, lv: localBounds.d };
    const cuts = seats.cuts(strip, 'v1', 0);
    const convert = (r: UvRect): UvRect => {
      const points = toWorldPolygon(uvRectCorners(r), face).map(p => worldToUv(p, core.frame));
      const b = polygonBounds(points);
      return { u: Math.round(b.x * 1e6) / 1e6, v: Math.round(b.z * 1e6) / 1e6,
        lu: Math.round(b.w * 1e6) / 1e6, lv: Math.round(b.d * 1e6) / 1e6 };
    };
    for (let a = 0; a < cuts.length; a++) for (let b = a + 1; b < cuts.length; b++) {
      const width = cuts[b]! - cuts[a]!;
      if (width < 7 || width > 10.5) continue;
      const targetDepth = Math.round(75 / width * 2) / 2;
      for (const depth of [targetDepth, targetDepth - .5, targetDepth + .5, targetDepth - 1, targetDepth + 1]) {
      if (depth < 7 || depth > 11 || width * depth < 67.5 || width * depth > 86.25) continue;
      const local: UvRect = { u: cuts[a]!, v: localBounds.z, lu: width, lv: depth };
      const rect = convert(local);
      if (rect.u < bounds.x - 1e-6 || rect.v < bounds.z - 1e-6
        || rect.u + rect.lu > bounds.x + bounds.w + 1e-6 || rect.v + rect.lv > bounds.z + bounds.d + 1e-6
        || keepouts.some(cut => overlap(rect, cut))) continue;
      // A 3×3 wet room stands against the private service edge. Probe both ends;
      // a corner-adjacent bathroom wall must also meet a real facade seat.
      for (const low of [true, false]) {
        const possibleSplits = cuts.filter(cut => cut - local.u >= 3.5 && local.u + local.lu - cut >= 3.5);
        const split = low ? possibleSplits[0] : possibleSplits.at(-1);
        if (!unitProgram && split === undefined) continue;
        const bedDepth = Math.min(4, Math.max(3.5, depth - 5.5));
        if (!unitProgram && depth < 8.5) continue;
        const bath = convert({ u: low ? local.u : local.u + local.lu - 3, v: local.v + local.lv - 3, lu: 3, lv: 3 });
        // Keep wet functions in one service block. Opposite corner boxes leave
        // a forked entry neck between them; this arrangement keeps one broad
        // continuous living side and a direct approach to every private door.
        const kitchen = convert({ u: low ? local.u + 3 : local.u + local.lu - 6.5, v: local.v + local.lv - 3, lu: 3.5, lv: 3 });
        const bedroom = unitProgram ? undefined : convert({ u: low ? local.u : split!, v: local.v,
          lu: low ? split! - local.u : local.u + local.lu - split!, lv: bedDepth });
        const template = unitProgram?.(local, cuts, face, core.frame, idGen(floor.index));
        if (unitProgram && !template) continue;
        const candidate: Candidate = { rect, bath, kitchen, bedroom, ...(template ? { template } : {}), face: quarter, low: local.u, high: local.u + local.lu,
          score: Math.abs(width * depth - 75) + Math.abs(width - 8.5) * .6 };
        const parts = unitRooms(candidate, 'probe', idGen(floor.index));
        if (!parts || !checkRooms(parts)) continue;
        // Allocation includes a real living bay, before a room's unrelated
        // cabinet or doorway choices can strand a sofa in its narrow entry arm.
        if (!fitResidentialComposition(parts[0]!, parts[0]!.rect, compositionProfile,
          reservation => roomCoversRect(parts[0]!, reservation))) continue;
        candidates.push(candidate);
        if (unitProgram) break;
      }
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.rect.v - b.rect.v || a.rect.u - b.rect.u);
  // Cover compatible frontages before fine-tuning area error. Selecting every
  // isolated rectangle nearest 75 first leaves unusable slivers between homes.
  const primary: Candidate[] = [];
  for (const face of [0, 2, 1, 3]) {
    const options = candidates.filter(candidate => candidate.face === face), bySpan = new Map<string, Candidate>();
    for (const candidate of options) {
      const key = `${candidate.low}:${candidate.high}`;
      if (!bySpan.has(key)) bySpan.set(key, candidate);
    }
    const cuts = [...new Set(options.flatMap(candidate => [candidate.low, candidate.high]))].sort((a, b) => a - b);
    for (const [low, high] of facadeSlots(cuts, 8.5, (low, high) => bySpan.has(`${low}:${high}`))) primary.push(bySpan.get(`${low}:${high}`)!);
  }
  const selected: Candidate[] = [];
  for (const candidate of [...primary, ...candidates]) {
    if (selected.some(other => overlap(candidate.rect, other.rect))) continue;
    // A private allocation must retain a useful public approach along at least
    // one side, and cannot create a new disconnected public island.
    const remains = new RoomRegion(plate).subtract([...solids, ...selected.map(unit => unit.rect), candidate.rect]);
    if (remains.length !== 1) continue;
    const occupied = [...solids, ...selected.map(unit => unit.rect), candidate.rect];
    if (!publicRouteConnected(bounds, occupied, 1.3, .5) || !publicRouteConnected(bounds, occupied, .4, .25)) continue;
    if (![...selected, candidate].every(home => {
      const parts = unitRooms(home, 'probe', idGen(floor.index))!;
      return remains.some(room => roomArea(room) > 20 && entryFit(parts, room));
    })) continue;
    selected.push(candidate);
  }
  diagnostics.push(`${candidates.length} feasible candidates; ${selected.length} selected standard homes`);
  if (selected.length < 4) return null;
  const publicShapes = new RoomRegion(plate).subtract([...solids, ...selected.map(unit => unit.rect)]);
  const rooms: PlanRoom[] = publicShapes.map((shape, index) => ({ ...shape,
    id: index === 0 ? `f${floor.index}-corridor` : ids.room(), kind: 'corridor', doors: [] }));
  if (rooms.some(room => !checkRooms([room]))) { diagnostics.push('common floor facade conflict'); return null; }
  for (const [index, candidate] of selected.entries()) {
    const parts = unitRooms(candidate, `f${floor.index}-unit-${index + 1}`, ids)!;
    const main = parts[0]!, publicRoom = rooms.filter(room => !room.unit).find(room => entryFit(parts, room));
    if (!publicRoom) return null;
    const fit = entryFit(parts, publicRoom)!, { edge, stretch } = fit;
    const entry = doorBetween(main, publicRoom.id, publicRoom, ids, 1, 1.2, .5, stretch);
    if (!entry) return null;
    // The cassette, including both lateral chambers, is centred on the real
    // wall span. Rounding its clear opening alone to 0.5m can consume a chamber's
    // end clearance even though the nominal leaf still fits.
    entry.at = fit.at;
    entry.position = edge.edge.startsWith('v') ? [entry.at, edge.c] : [edge.c, entry.at];
    rooms.push(...parts);
  }
  return rooms;
}

/** A long shared boundary is insufficient if it faces a body-thin public strip.
 * Reserve the real cassette skins and a full approach on both sides before the
 * shared validator would need to replace this entrance with a narrower one. */
function entryFit(parts: PlanRoom[], common: RoomShape) {
  const main = parts[0]!;
  for (const [stretch, edge] of sharedRoomEdges(main, common).entries()) {
    if (edge.hi - edge.lo < 3) continue;
    const horizontal = edge.edge.startsWith('v'), sign = edge.edge.endsWith('0') ? -1 : 1;
    const outward: Point = horizontal ? [0, sign] : [sign, 0];
    for (const fraction of [.5, .2, .8]) {
      const at = edge.lo + 1.35 + (edge.hi - edge.lo - 2.7) * fraction;
      const centre: Point = horizontal ? [at, edge.c] : [edge.c, at];
      const approach = (side: number): UvRect => ({
        u: centre[0] + outward[0] * .65 * side - (horizontal ? .75 : .6),
        v: centre[1] + outward[1] * .65 * side - (horizontal ? .6 : .75),
        lu: horizontal ? 1.5 : 1.2, lv: horizontal ? 1.2 : 1.5,
      });
      if (!roomCoversRect(common, approach(1)) || !roomCoversRect(main, approach(-1))) continue;
      const point = (along: number, normal: number): Point => [centre[0] + (horizontal ? along : 0) + outward[0] * normal,
        centre[1] + (horizontal ? 0 : along) + outward[1] * normal];
      if (![-1.3, -.98, -.7, .7, .98, 1.3].every(along => roomContains(common, point(along, .17))
        && parts.some(room => roomContains(room, point(along, -.17))))) continue;
      return { edge, stretch, at };
    }
  }
  return null;
}

/** Reject a geometrically connected leftover whose only link is a thin slit.
 * Sampling the shared floor with a 1.3 m radius reserves useful circulation
 * before private rooms are furnished; the precise shared validator still runs. */
function publicRouteConnected(bounds: { x: number; z: number; w: number; d: number }, solids: UvRect[], radius: number, step: number): boolean {
  const nx = Math.ceil(bounds.w / step), nz = Math.ceil(bounds.d / step);
  const free = new Uint8Array(nx * nz);
  let first = -1, count = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const u = bounds.x + (i + .5) * step, v = bounds.z + (j + .5) * step;
    if (u < bounds.x + radius || u > bounds.x + bounds.w - radius || v < bounds.z + radius || v > bounds.z + bounds.d - radius) continue;
    if (solids.some(rect => u > rect.u - radius && u < rect.u + rect.lu + radius
      && v > rect.v - radius && v < rect.v + rect.lv + radius)) continue;
    first = j * nx + i; free[first] = 1; count++;
  }
  if (first < 0) return false;
  const queue = [first]; free[first] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head]!, x = cell % nx, z = Math.floor(cell / nx);
    for (const next of [x > 0 ? cell - 1 : -1, x + 1 < nx ? cell + 1 : -1, z > 0 ? cell - nx : -1, z + 1 < nz ? cell + nx : -1]) {
      if (next < 0 || free[next] !== 1) continue;
      free[next] = 0; queue.push(next);
    }
  }
  return queue.length === count;
}

function unitRooms({ rect, bath, kitchen, bedroom, template }: Candidate, unit: string, ids: IdGen): PlanRoom[] | null {
  if (template) {
    const roomIds = new Map(template.map(room => [room.id, ids.room()]));
    const doorIds = new Map<string, string>();
    return template.map(room => ({ ...room, id: roomIds.get(room.id)!, unit,
      rect: { ...room.rect }, polygon: room.polygon?.map(p => [...p] as Point),
      holes: room.holes?.map(hole => hole.map(p => [...p] as Point)),
      furnishingKeepouts: room.furnishingKeepouts?.map(rect => ({ ...rect })),
      doors: room.doors.map(door => {
        if (!doorIds.has(door.id)) doorIds.set(door.id, ids.door());
        if (door.openFront) return { ...door, id: doorIds.get(door.id)!, to: 'outside' as const,
          ...(door.position ? { position: [...door.position] as Point } : {}) };
        return { ...door, id: doorIds.get(door.id)!, to: roomIds.get(door.to) ?? door.to,
          ...(door.position ? { position: [...door.position] as Point } : {}) };
      }),
    }));
  }
  const service = [{ kind: 'bathroom' as const, rect: bath }, ...(kitchen ? [{ kind: 'kitchen' as const, rect: kitchen }] : []),
    ...(bedroom ? [{ kind: 'bedroom' as const, rect: bedroom }] : [])];
  const shapes = new RoomRegion(uvRectCorners(rect)).subtract(service.map(room => room.rect));
  if (shapes.length !== 1) return null;
  const main: PlanRoom = { ...shapes[0]!, id: ids.room(), kind: kitchen ? 'living' : 'studio_main', unit, doors: [] };
  const rooms = service.map(room => ({ ...room, id: ids.room(), polygon: uvRectCorners(room.rect), unit, doors: [] } as PlanRoom));
  // In a compact bedroom a centered door reserves both usable bedside corners.
  // Keep the doorway toward an end of its wall, with the shared jamb allowance,
  // so a full-size bed and its approach can coexist with the door reservation.
  for (const room of rooms) {
    const doorway = doorBetween(room, main.id, main, ids, room.kind === 'kitchen' ? 2 : 1,
      room.kind === 'kitchen' ? 1.6 : 1.2, room.kind === 'kitchen' ? .5 : .12);
    if (!doorway) return null;
    if (!doorway.openFront) doorway.clearDepth = 0;
  }
  return [main, ...rooms];
}
