import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import type { WalkGrid } from "../core/grid.js";
import { AGENT_RADIUS, DOOR } from "./constants.js";
import { ArchitectureAccess, closestArchitectureCell } from "./architecture-access.js";
import { circulationSweep } from "./circulation-sweep.js";
import type { CorePlan } from "./core-plan.js";
import { doorUvPoint } from "./plan-floor.js";
import { elevatorWaitUv, stairEntryUv } from "./core-plan.js";
import type { PlanRoom } from "./plan-types.js";
import type { ArchitecturalGrid } from "./navgrid.js";
import { roomAnchor } from "./room-shape.js";
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
): FloorCirculation {
  const narrow = rooms.flatMap((room) => room.doors).find((door) => door.width < 2 * AGENT_RADIUS);
  if (narrow) throw new InteriorError("E_UNREACHABLE_SPACE", `door ${narrow.id} width ${narrow.width} is below body width ${2 * AGENT_RADIUS}`, floor);
  const [rootCol, rootRow] = grid.cellAt(access.origin);
  const root = rootRow * grid.cols + rootCol;
  const trees = new Map<WalkGrid, Int32Array>();
  const endpoints: CirculationEndpoint[] = [];
  const routes: FloorCirculation["routes"] = [];
  const add = (id: string, kind: CirculationEndpoint["kind"], source: string, point: Point, room?: PlanRoom): void => {
    if (endpoints.some((endpoint) => endpoint.id === id)) return;
    const routeGrid = room ? access.gridFor(room) : access.publicGrid();
    let previous = trees.get(routeGrid);
    if (!previous) {
      previous = routeGrid.predecessors(access.origin, room ? access.transitionFor(room) : access.publicTransition());
      trees.set(routeGrid, previous);
    }
    const maxDisplacement = kind === "room" ? null : DOOR.clearance / 2;
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
    add(`room:${room.id}`, "room", room.id, uvToWorld(roomAnchor(room), core.frame), room);
    for (const door of room.doors) {
      const p = doorUvPoint(door, room);
      const inward: Point = door.openFront?.inward
        ?? (door.edge === "v0" ? [0, 1] : door.edge === "v1" ? [0, -1] : door.edge === "u0" ? [1, 0] : [-1, 0]);
      const depth = DOOR.clearance - AGENT_RADIUS;
      const approach: Point = [p[0] + inward[0] * depth, p[1] + inward[1] * depth];
      add(`door:${door.id}:${room.id}`, door.to === "outside" ? "entrance" : "door", door.id, uvToWorld(approach, core.frame), room);
      const other = rooms.find((candidate) => candidate.id === door.to);
      if (other) add(`door:${door.id}:${other.id}`, "door", door.id,
        uvToWorld([p[0] - inward[0] * depth, p[1] - inward[1] * depth], core.frame), other);
    }
  }
  add("core:stair-a", "stair", "stair-a", uvToWorld(stairEntryUv(core, "a"), core.frame));
  if (core.stairB) add("core:stair-b", "stair", "stair-b", uvToWorld(stairEntryUv(core, "b"), core.frame));
  core.elevators.forEach((elevator, index) => add(`core:${elevator.id}`, "elevator", elevator.id, uvToWorld(elevatorWaitUv(core, index), core.frame)));
  return { floor, bodyWidth: 2 * AGENT_RADIUS,
    minimumDoorWidth: Math.min(1, ...rooms.flatMap((room) => room.doors.map((door) => door.width))),
    cellSize: grid.cellSize, origin: access.origin, endpoints, routes };
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
