import { InteriorError } from '../../core/errors.js';
import { boundaryDistance, polygonBounds, type Point } from '../../core/geom.js';
import type { FloorInterior, InteriorRequest, Room } from '../../core/types.js';
import type { FloorDuplex } from '../../core/duplex.js';
import type { BuildingPlan } from '../index.js';
import type { PlanDoor, PlanFurniture, PlanRoom } from '../plan-types.js';
import { doorUvPoint, furnitureToWorld } from '../plan-floor.js';
import { roomArea } from '../room-shape.js';
import { makeFrame, toWorldPolygon, uvToWorld, worldToUv, type Frame, type UvRect } from '../uv.js';
import { partitionConflicts } from '../openings.js';
import { constructionPlate, shellWallDepth } from '../shell.js';
import { planLights } from '../lighting.js';
import { furnitureLights } from '../furniture-lights.js';
import type { IdGen } from '../rooms.js';
import { planDuplexSection } from './section.js';
import { planDuplexProgram } from './program.js';
import { furnishDuplexProgram } from './furnish.js';
import { duplexRoutes, type DuplexRouteProof } from './routes.js';
import { duplexSlices } from './metadata.js';
import type { DuplexPair } from './assignments.js';

interface Unit { id: string; rooms: PlanRoom[]; rect: UvRect }
interface UnitFrame { origin: Point; turn: number; width: number; depth: number; corridor: string; entryAt: number }

/** Replace only real matching private allocations. No common room, public core,
 * or unrelated upper home is removed. A pair with no legal complete candidate keeps
 * its two ordinary apartment storeys and publishes no duplex, so the building never
 * pretends the requested duplex was generated and never loses its floors to it.
 * Returns the pairs that converted no home. */
export function applyDuplexPairs(plan: BuildingPlan, pairs: readonly DuplexPair[], request: InteriorRequest,
  options: { wallStair?: boolean } = {}): DuplexPair[] {
  const unconverted: DuplexPair[] = [];
  for (const pair of pairs) {
    let converted = 0;
    const lower = plan.floors.find(floor => floor.floor === pair.lower);
    const upper = plan.floors.find(floor => floor.floor === pair.upper);
    const lowerUv = plan.uvFloors.get(pair.lower), upperUv = plan.uvFloors.get(pair.upper);
    if (!lower || !upper || !lowerUv || !upperUv)
      throw new InteriorError('E_ASSIGNMENT_INVALID', 'both duplex floors require their own sampled placement layout');
    const upperUnits = unitsOf(upperUv.rooms);
    for (const unit of unitsOf(lowerUv.rooms)) {
      const peer = upperUnits.find(candidate => equalRect(candidate.rect, unit.rect));
      if (!peer) continue;
      const local = unitFrame(unit, lowerUv.rooms);
      if (!local || local.width < 15 - 1e-6 || local.depth < 10 - 1e-6) continue;
      let committing = false;
      try {
        const pitch = upper.elevation - lower.elevation;
        const risers = Math.ceil(pitch / .18 / 2) * 2;
        const openingDepth = Math.max(4, Math.ceil(((risers / 2 - 1) * .3 + 1.3) * 2) / 2);
        // a composed loft stands its stair against a side wall: the party wall, not the facade
        const stairWall = options.wallStair ? partySide(local, lowerUv.outline) : undefined;
        const section = planDuplexSection({ width: local.width, depth: local.depth, pitch, stairOpeningDepth: openingDepth, ...(stairWall ? { stairWall } : {}) });
        const program = planDuplexProgram(section, unit.id, stairWall ? local.entryAt : undefined);
        const entry = program.lower[0]!.doors.find(door => door.id === `${unit.id}-private-entry`)!;
        entry.to = local.corridor;
        const furniture = furnishDuplexProgram(program, section, `${request.seed}:${unit.id}`);
        const routes = duplexRoutes(program, section, furniture);
        const origin = uvToWorld(local.origin, plan.core.frame);
        const angle = plan.core.frame.angleDeg + local.turn;
        const slices = duplexSlices(section, unit.id, pair.lower, origin, angle, Math.max(0, upper.elevation - lower.ceilingElevation));
        const mapped = {
          lower: program.lower.map(room => mapRoom(room, local)),
          upper: program.upper.map(room => mapRoom(room, local)),
        };
        for (const [level, floor, rooms, slice] of [
          ['lower', lower, mapped.lower, slices[0]], ['upper', upper, mapped.upper, slices[1]],
        ] as const) {
          const bp = request.blueprint.floors.find(bp => bp.index === floor.floor)!;
          const world = rooms.map(room => roomToWorld(room, plan.core.frame));
          const plate = toWorldPolygon(constructionPlate(bp, plan.core.frame, shellWallDepth(request.blueprint.facade)), plan.core.frame);
          const conflicts = partitionConflicts({ rooms: world }, bp, request.blueprint.facade, plate)
            .filter(conflict => level !== 'upper' || !openEdgeAt(world.find(room => room.id === conflict.room)!, conflict.at, slice));
          if (conflicts.length) throw new InteriorError('E_FLOOR_TOO_SMALL', `${unit.id} ${level} partition has no legal facade seat at ${conflicts[0]!.opening}`);
        }
        committing = true;
        install(plan, request, lower, unit, mapped.lower, furniture.lower.map(piece => mapFurniture(piece, local)),
          furniture.carpets.lower.map(carpet => ({ ...carpet, rect: mapRect(carpet.rect, local) })), slices[0], routes.lower, local);
        install(plan, request, upper, peer, mapped.upper, furniture.upper.map(piece => mapFurniture(piece, local)),
          furniture.carpets.upper.map(carpet => ({ ...carpet, rect: mapRect(carpet.rect, local) })), slices[1], routes.upper, local);
        converted++;
      } catch (error) {
        // A candidate that fails before anything is installed leaves its home as it was.
        if (committing || !(error instanceof InteriorError)) throw error;
      }
    }
    if (!converted) unconverted.push(pair);
  }
  return unconverted;
}

function unitsOf(rooms: PlanRoom[]): Unit[] {
  const grouped = new Map<string, PlanRoom[]>();
  for (const room of rooms) if (room.unit) grouped.set(room.unit, [...grouped.get(room.unit) ?? [], room]);
  return [...grouped].flatMap(([id, own]) => {
    const bounds = polygonBounds(own.flatMap(room => room.polygon ?? []));
    const area = own.reduce((sum, room) => sum + roomArea(room), 0);
    if (Math.abs(area - bounds.w * bounds.d) > 1e-4) return [];
    return [{ id, rooms: own, rect: { u: bounds.x, v: bounds.z, lu: bounds.w, lv: bounds.d } }];
  });
}

function equalRect(a: UvRect, b: UvRect): boolean {
  return (['u', 'v', 'lu', 'lv'] as const).every(key => Math.abs(a[key] - b[key]) < 1e-5);
}

function unitFrame(unit: Unit, rooms: PlanRoom[]): UnitFrame | null {
  const entry = unit.rooms.flatMap(room => room.doors.map(door => ({ room, door }))).find(({ door }) =>
    rooms.some(room => room.id === door.to && !room.unit && ['corridor', 'elevator_lobby', 'concourse'].includes(room.kind)));
  if (!entry) return null;
  const { u, v, lu, lv } = unit.rect, corridor = entry.door.to;
  // where along its front the unit's own entrance stands, in its frame
  const [du, dv] = doorUvPoint(entry.door, entry.room);
  switch (entry.door.edge) {
    case 'v0': return { origin: [u, v], turn: 0, width: lu, depth: lv, corridor, entryAt: du - u };
    case 'v1': return { origin: [u + lu, v + lv], turn: 180, width: lu, depth: lv, corridor, entryAt: u + lu - du };
    case 'u0': return { origin: [u, v + lv], turn: -90, width: lv, depth: lu, corridor, entryAt: v + lv - dv };
    case 'u1': return { origin: [u + lu, v], turn: 90, width: lv, depth: lu, corridor, entryAt: dv - v };
  }
}

/** The side wall of a unit (low or high in its own frame) that is a party wall rather than the
 *  facade: the one whose middle stands further from the floor's outline. */
function partySide(local: UnitFrame, outline: readonly Point[]): 'low' | 'high' {
  const at = (u: number) => Math.abs(boundaryDistance(inBuilding([u, local.depth / 2], local), outline as Point[]));
  return at(.05) >= at(local.width - .05) ? 'low' : 'high';
}

function inBuilding(point: Point, local: UnitFrame): Point {
  const p = uvToWorld(point, makeFrame(local.turn)); return [p[0] + local.origin[0], p[1] + local.origin[1]];
}

function mapRoom(room: PlanRoom, local: UnitFrame): PlanRoom {
  const polygon = room.polygon!.map(point => inBuilding(point, local)), b = polygonBounds(polygon);
  const edgeNormal = { u0: [-1, 0], u1: [1, 0], v0: [0, -1], v1: [0, 1] } as const;
  return { ...room, rect: { u: b.x, v: b.z, lu: b.w, lv: b.d }, polygon,
    ...(room.holes?.length ? { holes: room.holes.map(ring => ring.map(point => inBuilding(point, local))) } : {}),
    doors: room.doors.map(door => {
      const position = inBuilding(doorUvPoint(door, room), local);
      const normal = uvToWorld([...edgeNormal[door.edge]], makeFrame(local.turn));
      const edge: PlanDoor['edge'] = Math.abs(normal[0]) > .5 ? normal[0] > 0 ? 'u1' : 'u0' : normal[1] > 0 ? 'v1' : 'v0';
      return { ...door, edge, position, at: position[edge.startsWith('v') ? 0 : 1] };
    }) };
}

function mapFurniture(piece: PlanFurniture, local: UnitFrame): PlanFurniture {
  return { ...piece, at: inBuilding(piece.at, local), rotationDeg: ((piece.rotationDeg - local.turn + 360) % 360) as PlanFurniture['rotationDeg'] };
}

function mapRect(rect: UvRect, local: UnitFrame): UvRect {
  const points: Point[] = [[rect.u, rect.v], [rect.u + rect.lu, rect.v], [rect.u + rect.lu, rect.v + rect.lv], [rect.u, rect.v + rect.lv]];
  const b = polygonBounds(points.map(point => inBuilding(point, local)));
  return { u: b.x, v: b.z, lu: b.w, lv: b.d };
}

function roomToWorld(room: PlanRoom, frame: Frame): Room {
  return { id: room.id, kind: room.kind, unit: room.unit, polygon: toWorldPolygon(room.polygon!, frame),
    ...(room.holes?.length ? { holes: room.holes.map(ring => toWorldPolygon(ring, frame)) } : {}),
    doors: room.doors.map(door => ({ id: door.id, to: door.to, width: door.width, leaves: door.leaves ?? 1,
      position: uvToWorld(doorUvPoint(door, room), frame), angleDeg: ((door.edge.startsWith('v') ? 0 : 90) + frame.angleDeg + 360) % 360 })) };
}

function openEdgeAt(room: Room, at: Point, slice: FloorDuplex): boolean {
  const voids = [...slice.loungeVoids, slice.stairOpening];
  for (const ring of [room.polygon, ...room.holes ?? []]) for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
    if (Math.min(Math.hypot(a[0] - at[0], a[1] - at[1]), Math.hypot(b[0] - at[0], b[1] - at[1])) > 1e-5) continue;
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (voids.some(ring => Math.abs(boundaryDistance(at, ring)) < 1e-5 && Math.abs(boundaryDistance(mid, ring)) < 1e-5)) return true;
  }
  return false;
}

function install(plan: BuildingPlan, request: InteriorRequest, floor: FloorInterior, previous: Unit, rooms: PlanRoom[],
  furniture: PlanFurniture[], carpets: { room: string; rect: UvRect }[], slice: FloorDuplex, route: DuplexRouteProof['lower'], local: UnitFrame): void {
  const uv = plan.uvFloors.get(floor.floor)!, removed = new Set(previous.rooms.map(room => room.id));
  const removedDoors = new Set(previous.rooms.flatMap(room => room.doors.map(door => door.id)));
  const own = new Set(rooms.map(room => room.id));
  uv.rooms = [...uv.rooms.filter(room => !removed.has(room.id)).map(room => ({ ...room, doors: room.doors.filter(door => !removed.has(door.to)) })), ...rooms];
  uv.furniture = [...uv.furniture.filter(piece => !removed.has(piece.room)), ...furniture];
  uv.carpets = [...uv.carpets.filter(carpet => !removed.has(carpet.room)), ...carpets];
  floor.rooms = [...floor.rooms.filter(room => !removed.has(room.id)).map(room => ({ ...room, doors: room.doors.filter(door => !removed.has(door.to)) })), ...rooms.map(room => roomToWorld(room, plan.core.frame))];
  floor.furniture = [...floor.furniture.filter(piece => !removed.has(piece.room)), ...furniture.map(piece => furnitureToWorld(piece, plan.core.frame))];
  floor.duplexes = [...floor.duplexes ?? [], slice];
  const bp = request.blueprint.floors.find(bp => bp.index === floor.floor)!;
  const plate = constructionPlate(bp, plan.core.frame, shellWallDepth(request.blueprint.facade));
  const ids = scopedIds(slice.id, slice.level);
  const lights = planLights(rooms, plan.core, plate, floor.ceilingElevation, floor.ceilingElevation, ids, request.building.tier)
    .filter(light => own.has(light.room) && !(slice.level === 'lower'
      && [...slice.loungeVoids, slice.stairOpening].some(ring => boundaryDistance([light.position[0], light.position[2]], ring) >= -1e-6)));
  floor.lights = [...floor.lights.filter(light => !removed.has(light.room)), ...lights,
    ...furnitureLights(furniture, plan.core.frame, floor.elevation, request.building.tier, 'luxury', request.building.interiorStyle,
      rooms, 'apartment')];
  if (slice.level === 'upper') for (const [index, polygon] of [...slice.loungeVoids, slice.stairOpening].entries()) {
    const id = `${slice.id}-air-${index}`;
    floor.rooms.push({ id, kind: 'living', unit: slice.unit, polygon, doors: [] });
    const ring = polygon.map(point => worldToUv(point, plan.core.frame)), b = polygonBounds(ring);
    const air: PlanRoom = { id, kind: 'living', unit: slice.unit, rect: { u: b.x, v: b.z, lu: b.w, lv: b.d }, polygon: ring, doors: [] };
    floor.lights.push(...planLights([air], plan.core, plate, floor.ceilingElevation, floor.ceilingElevation, ids, request.building.tier).filter(light => light.room === id));
  }
  const grid = plan.navGrids.get(floor.floor)!;
  const localFrame = makeFrame(local.turn);
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    const p = worldToUv(grid.center(col, row), plan.core.frame);
    const at = worldToUv([p[0] - local.origin[0], p[1] - local.origin[1]], localFrame);
    if (at[0] >= 0 && at[0] <= slice.width && at[1] >= 0 && at[1] <= slice.depth) grid.set(col, row, route.grid.isWalkableAt(at));
    else if (at[0] >= 0 && at[0] <= slice.width && at[1] > -.45 && at[1] < 0) {
      grid.set(col, row, slice.level === 'lower' && Math.abs(at[0] - (slice.width - 7.5)) < .8 - .34);
    }
  }
  const circulation = plan.circulation.get(floor.floor);
  if (circulation) {
    circulation.endpoints = circulation.endpoints.filter(endpoint => !removed.has(endpoint.source) && !removedDoors.has(endpoint.source));
    const retained = new Set(circulation.endpoints.map(endpoint => endpoint.id));
    circulation.routes = circulation.routes.filter(route => retained.has(route.to));
  }
}

function scopedIds(id: string, level: string): IdGen {
  let n = 0; const next = (kind: string) => `${id}-${level}-${kind}-${n++}`;
  return { room: () => next('room'), door: () => next('door'), furniture: () => next('furniture'), light: () => next('light') };
}
