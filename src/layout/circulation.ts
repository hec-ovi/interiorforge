import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import type { WalkGrid } from "../core/grid.js";
import { AGENT_RADIUS, DOOR } from "./constants.js";
import { ArchitectureAccess, closestArchitectureCell, commonTransit, doorApproaches } from "./architecture-access.js";
import { circulationSweep } from "./circulation-sweep.js";
import type { CorePlan } from "./core-plan.js";
import { elevatorWaitUv, stairEntryUv } from "./core-plan.js";
import type { PlanRoom } from "./plan-types.js";
import type { ArchitecturalGrid } from "./navgrid.js";
import { roomAnchor, roomClearance } from "./room-shape.js";
import { uvToWorld, type Frame, type UvRect } from "./uv.js";

export interface CirculationEndpoint {
  id: string;
  kind: "room" | "door" | "entrance" | "stair" | "elevator";
  source: string;
  position: Point;
  intendedPosition: Point;
  maxDisplacement: number | null;
}

export interface FloorCirculation {
  floor: number;
  bodyWidth: number;
  minimumDoorWidth: number;
  cellSize: number;
  origin: Point;
  endpoints: CirculationEndpoint[];
  routes: { to: string; points: Point[] }[];
}

/** Architecture-only physical routes. The NPC seat-use graph is a separate output. */
export function reserveCirculation(
  grid: WalkGrid, rooms: PlanRoom[], core: CorePlan, floor: number,
  access = new ArchitectureAccess(grid, rooms, core.frame),
  fixtureRoomsAtEntry = false,
): FloorCirculation {
  const narrow = rooms.flatMap((room) => room.doors).find((door) => door.width < 2 * AGENT_RADIUS);
  if (narrow) throw new InteriorError("E_UNREACHABLE_SPACE", `door ${narrow.id} width ${narrow.width} is below body width ${2 * AGENT_RADIUS}`, floor);
  const [rootCol, rootRow] = grid.cellAt(access.origin);
  const root = rootRow * grid.cols + rootCol;
  const trees = new Map<WalkGrid, Int32Array>();
  const endpoints: CirculationEndpoint[] = [];
  const routes: FloorCirculation["routes"] = [];
  const add = (id: string, kind: CirculationEndpoint["kind"], source: string, point: Point, room?: PlanRoom, reach = DOOR.clearance / 2): void => {
    if (endpoints.some((endpoint) => endpoint.id === id)) return;
    const routeGrid = room ? access.gridFor(room) : access.publicGrid();
    let previous = trees.get(routeGrid);
    if (!previous) {
      previous = routeGrid.predecessors(access.origin, room ? access.transitionFor(room) : access.publicTransition());
      trees.set(routeGrid, previous);
    }
    const maxDisplacement = kind === "room" ? null : reach;
    const target = closestArchitectureCell(routeGrid, point, room, core.frame, maxDisplacement);
    if (previous[target] === -1) throw new InteriorError("E_UNREACHABLE_SPACE", `physical circulation cannot reach ${id} through its access domain`, floor);
    const reversed: Point[] = [];
    for (let at = target; ; at = previous[at]!) {
      reversed.push(grid.center(at % grid.cols, Math.floor(at / grid.cols)));
      if (at === root) break;
    }
    const points = simplify(reversed.reverse(), (a, b) => access.segmentPermitted(a, b, room));
    endpoints.push({ id, kind, source, position: points.at(-1)!, intendedPosition: point, maxDisplacement });
    routes.push({ to: id, points });
  };
  for (const room of rooms) {
    add(`room:${room.id}`, "room", room.id, uvToWorld(roomArrival(room, rooms, fixtureRoomsAtEntry), core.frame), room);
    for (const door of room.doors) {
      const [approach, opposite] = doorApproaches(door, room);
      // An entrance is approached anywhere across its leaf; a portal across the open band it crosses.
      add(`door:${door.id}:${room.id}`, door.to === "outside" ? "entrance" : "door", door.id, uvToWorld(approach, core.frame), room,
        door.to === "outside" ? Math.max(DOOR.clearance / 2, door.width / 2) : undefined);
      const other = rooms.find((candidate) => candidate.id === door.to);
      if (other) add(`door:${door.id}:${other.id}`, "door", door.id,
        uvToWorld(opposite, core.frame), other);
    }
  }
  add("core:stair-a", "stair", "stair-a", uvToWorld(stairEntryUv(core, "a"), core.frame));
  if (core.stairB) add("core:stair-b", "stair", "stair-b", uvToWorld(stairEntryUv(core, "b"), core.frame));
  core.elevators.forEach((elevator, index) => add(`core:${elevator.id}`, "elevator", elevator.id, uvToWorld(elevatorWaitUv(core, index), core.frame)));
  return { floor, bodyWidth: 2 * AGENT_RADIUS,
    minimumDoorWidth: Math.min(1, ...rooms.flatMap((room) => room.doors.map((door) => door.width))),
    cellSize: grid.cellSize, origin: access.origin, endpoints, routes };
}

/** A bedroom's arrival is a standing place beyond its doorway, not the bed zone at
 * its geometric centre. Keep the same physical body sweep and all door approaches;
 * reserving the centre made otherwise generous 4×4m bedrooms impossible to furnish. */
function roomArrival(room: PlanRoom, rooms: readonly PlanRoom[], fixtureRoomsAtEntry: boolean): Point {
  if (room.kind === 'living' && room.unit && room.furnishingKeepouts?.length) {
    const foyer = room.furnishingKeepouts[0]!;
    return [foyer.u + foyer.lu / 2, foyer.v + foyer.lv / 2];
  }
  // Fixtures are destinations around the perimeter, not furniture-free geometric
  // centres. Their atomic planner separately verifies body paths to every fixture.
  const fittedHomeKitchen = room.kind === 'kitchen' && room.unit !== undefined
    && rooms.some(main => main.unit === room.unit && main.kind === 'living' && main.furnishingKeepouts?.length);
  // A reference bath keeps its authored size, too tight for vanity, shower and toilet
  // around a reserved centre: its fixtures stand around the perimeter of a free floor.
  const referenceBath = room.kind === 'bathroom' && room.template !== undefined;
  if (fittedHomeKitchen || referenceBath || fixtureRoomsAtEntry && (room.kind === 'bathroom' || room.kind === 'kitchen')) {
    for (const door of room.doors) {
      const inside = doorApproaches(door, room)[0];
      if (roomClearance(room, inside) >= AGENT_RADIUS + .05) return inside;
    }
  }
  const loungeEntries = room.kind === 'lounge'
    ? room.doors.length + rooms.filter(other => other !== room).reduce((sum, other) => sum + other.doors.filter(door => door.to === room.id).length, 0)
    : 0;
  // A residents' lounge with one entrance is a destination, not a shortcut across
  // the floor. Its arrival leaves the seating centre free, as a meeting room's
  // arrival leaves its actual meeting table free. Through-lounges keep their hub.
  if (room.kind === "bedroom" || room.kind === 'meeting' || room.kind === 'office_private' && room.unit !== undefined
    || room.kind === 'lounge' && loungeEntries === 1) {
    for (const door of room.doors) {
      const [inside, outside] = doorApproaches(door, room);
      const du = inside[0] - outside[0], dv = inside[1] - outside[1];
      const distance = Math.hypot(du, dv);
      if (distance < 1e-8) continue;
      const candidate: Point = [inside[0] + du / distance * AGENT_RADIUS,
        inside[1] + dv / distance * AGENT_RADIUS];
      if (roomClearance(room, candidate) >= AGENT_RADIUS + 0.05) return candidate;
    }
  }
  return roomAnchor(room);
}

function simplify(points: Point[], permitted: (a: Point, b: Point) => boolean): Point[] {
  const kept: Point[] = [points[0]!];
  let start = 0;
  for (let index = 1; index < points.length; index++) {
    const point = points[index]!;
    const before = points[index - 1]!, after = points[index + 1]!;
    if (after && Math.abs((point[0] - before[0]) * (after[1] - point[1])
      - (point[1] - before[1]) * (after[0] - point[0])) <= 1e-10) continue;
    if (index === start + 1 || permitted(points[start]!, point)) kept.push(point);
    else kept.push(...points.slice(start + 1, index + 1));
    start = index;
  }
  return kept;
}

/** Conservative frame-space boxes cover the physical swept width of every route. */
export function circulationKeepouts(plan: FloorCirculation, frame: Frame): UvRect[] {
  return circulationSweep(plan, frame);
}

/** Furniture must leave a visibly generous route through common halls, beyond the
 * minimum body sweep. Existing physical routes can run 0.3m from a wall; keeping
 * furniture another 1.7m away leaves a 2m passage beside that wall. This is a
 * furnishing reservation, not a claim that narrow architectural doors grew wider.
 * Apply these boxes only to public rooms, so a nearby bedroom keeps its bed zone. */
export const PUBLIC_FURNITURE_ROUTE_RADIUS = 1.7;
export function publicCirculationKeepouts(plan: FloorCirculation, frame: Frame, rooms: readonly PlanRoom[]): UvRect[] {
  const publicRooms = new Set(rooms.filter(commonTransit).map(room => room.id));
  const targets = new Set(plan.endpoints.filter(endpoint =>
    endpoint.kind === 'stair' || endpoint.kind === 'elevator' || endpoint.kind === 'entrance'
    || endpoint.kind === 'room' && publicRooms.has(endpoint.source)
    || endpoint.kind === 'door' && [...publicRooms].some(id => endpoint.id.endsWith(`:${id}`)))
    .map(endpoint => endpoint.id));
  return circulationSweep({ ...plan, bodyWidth: PUBLIC_FURNITURE_ROUTE_RADIUS * 2,
    routes: plan.routes.filter(route => targets.has(route.to)) }, frame);
}

/** Keep a comfortable route in a home's living/entry space without reserving the
 * same wide bands inside bedrooms, kitchens or bathrooms. The 1.2m furniture
 * offset plus the existing wall/body clearance preserves about 1.5m beside walls. */
export function protectPrivateLivingRoutes(plan: FloorCirculation, frame: Frame, rooms: PlanRoom[]): void {
  for (const main of rooms.filter(room => room.kind === 'living' && room.unit && room.furnishingKeepouts?.length)) {
    const members = rooms.filter(room => room.unit === main.unit);
    const ids = new Set(members.map(room => room.id));
    const destinations = new Set(plan.endpoints.filter(endpoint => endpoint.kind === 'room' && ids.has(endpoint.source)
      || endpoint.kind === 'door' && members.some(room => endpoint.id.endsWith(`:${room.id}`))).map(endpoint => endpoint.id));
    main.furnishingKeepouts!.push(...circulationSweep({ ...plan, bodyWidth: 2.4,
      routes: plan.routes.filter(route => destinations.has(route.to)) }, frame));
  }
}

export function verifyCirculation(plan: FloorCirculation, grid: ArchitecturalGrid): void {
  if (grid.architecture) {
    for (const route of plan.routes) for (let i = 0; i < route.points.length; i++) {
      const a = route.points[i]!, b = route.points[Math.min(i + 1, route.points.length - 1)]!;
      if (!grid.isWalkableAt(a) || !grid.architecture.clear(a, b)) {
        throw new InteriorError("E_UNREACHABLE_SPACE", `furnished physical circulation blocks saved route ${route.to}`, plan.floor);
      }
    }
    return;
  }
  const reached = grid.flood(plan.origin);
  for (const endpoint of plan.endpoints) {
    const [c, r] = grid.cellAt(endpoint.position);
    if (!grid.isWalkable(c, r) || reached[r * grid.cols + c] !== 1) {
      throw new InteriorError("E_UNREACHABLE_SPACE", `furnished physical circulation blocks ${endpoint.id}`, plan.floor);
    }
  }
}
