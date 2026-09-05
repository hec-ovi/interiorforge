import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import type { WalkGrid } from "../core/grid.js";
import { AGENT_RADIUS, DOOR, SPINE_KINDS } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { doorUvPoint, elevatorWaitUv, stairEntryUv } from "./plan-floor.js";
import type { PlanRoom } from "./plan-types.js";
import { pointInUvRect, uvRectCenter, uvToWorld, worldToUv, type Frame, type UvRect } from "./uv.js";

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
): FloorCirculation {
  const narrow = rooms.flatMap((room) => room.doors).find((door) => door.width < 2 * AGENT_RADIUS);
  if (narrow) throw new InteriorError("E_UNREACHABLE_SPACE", `door ${narrow.id} width ${narrow.width} is below body width ${2 * AGENT_RADIUS}`, floor);
  const spine = rooms.find((room) => SPINE_KINDS.has(room.kind))!;
  const root = closestCell(grid, uvToWorld(uvRectCenter(spine.rect), core.frame), spine, core.frame);
  const previous = new Int32Array(grid.cols * grid.rows).fill(-1);
  const queue = new Int32Array(previous.length);
  const neighbors = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const;
  let head = 0, tail = 1;
  queue[0] = root;
  previous[root] = root;
  while (head < tail) {
    const at = queue[head++]!;
    const col = at % grid.cols, row = Math.floor(at / grid.cols);
    for (const [dc, dr] of neighbors) {
      const c = col + dc, r = row + dr;
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows || !grid.isWalkable(c, r)) continue;
      const next = r * grid.cols + c;
      if (previous[next] !== -1) continue;
      previous[next] = at;
      queue[tail++] = next;
    }
  }
  const endpoints: CirculationEndpoint[] = [];
  const routes: FloorCirculation["routes"] = [];
  const add = (id: string, kind: CirculationEndpoint["kind"], source: string, point: Point, room?: PlanRoom): void => {
    if (endpoints.some((endpoint) => endpoint.id === id)) return;
    const maxDisplacement = kind === "room" ? null : DOOR.clearance / 2;
    const target = closestCell(grid, point, room, core.frame, maxDisplacement);
    if (previous[target] === -1) throw new InteriorError("E_UNREACHABLE_SPACE", `physical circulation cannot reach ${id}`, floor);
    const reversed: Point[] = [];
    for (let at = target; ; at = previous[at]!) {
      reversed.push(grid.center(at % grid.cols, Math.floor(at / grid.cols)));
      if (at === root) break;
    }
    const points = simplify(reversed.reverse());
    endpoints.push({ id, kind, source, position: points.at(-1)!, intendedPosition: point, maxDisplacement });
    routes.push({ to: id, points });
  };
  for (const room of rooms) {
    add(`room:${room.id}`, "room", room.id, uvToWorld(uvRectCenter(room.rect), core.frame), room);
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
    cellSize: grid.cellSize, origin: grid.center(root % grid.cols, Math.floor(root / grid.cols)), endpoints, routes };
}

function closestCell(grid: WalkGrid, point: Point, room: PlanRoom | undefined, frame: Frame, maxDisplacement: number | null = null): number {
  const [c0, r0] = grid.cellAt(point);
  // A room hub may be clipped away by the real plate; select its nearest physical cell.
  const limit = maxDisplacement === null ? Math.max(grid.cols, grid.rows) : Math.ceil(maxDisplacement / grid.cellSize) + 1;
  for (let ring = 0; ring <= limit; ring++) {
    let best = -1, distance = Infinity;
    for (let r = Math.max(0, r0 - ring); r <= Math.min(grid.rows - 1, r0 + ring); r++) {
      for (let c = Math.max(0, c0 - ring); c <= Math.min(grid.cols - 1, c0 + ring); c++) {
        if (Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== ring || !grid.isWalkable(c, r)) continue;
        const p = grid.center(c, r);
        if (room && !pointInUvRect(worldToUv(p, frame), room.rect)) continue;
        const d = Math.hypot(p[0] - point[0], p[1] - point[1]);
        if (maxDisplacement !== null && d > maxDisplacement) continue;
        if (d < distance) { distance = d; best = r * grid.cols + c; }
      }
    }
    if (best !== -1) return best;
  }
  throw new InteriorError("E_UNREACHABLE_SPACE", `no circulation approach for ${room?.id ?? "core"} within ${maxDisplacement ?? "room"} m of ${JSON.stringify(point)}`);
}

function simplify(points: Point[]): Point[] {
  return points.filter((point, index) => {
    if (index === 0 || index === points.length - 1) return true;
    const before = points[index - 1]!, after = points[index + 1]!;
    return Math.abs((point[0] - before[0]) * (after[1] - point[1]) - (point[1] - before[1]) * (after[0] - point[0])) > 1e-10;
  });
}

/** Conservative frame-space boxes cover the physical swept width of every route. */
export function circulationKeepouts(plan: FloorCirculation, frame: Frame): UvRect[] {
  const boxes = new Map<string, UvRect>();
  for (const route of plan.routes) for (let i = 0; i < route.points.length; i++) {
    const a = worldToUv(route.points[i]!, frame), b = worldToUv(route.points[Math.min(i + 1, route.points.length - 1)]!, frame);
    const rect = { u: Math.min(a[0], b[0]) - AGENT_RADIUS, v: Math.min(a[1], b[1]) - AGENT_RADIUS,
      lu: Math.abs(a[0] - b[0]) + 2 * AGENT_RADIUS, lv: Math.abs(a[1] - b[1]) + 2 * AGENT_RADIUS };
    boxes.set(JSON.stringify(rect), rect);
  }
  return [...boxes.values()];
}

export function verifyCirculation(plan: FloorCirculation, grid: WalkGrid): void {
  const reached = grid.flood(plan.origin);
  for (const endpoint of plan.endpoints) {
    const [c, r] = grid.cellAt(endpoint.position);
    if (!grid.isWalkable(c, r) || reached[r * grid.cols + c] !== 1) {
      throw new InteriorError("E_UNREACHABLE_SPACE", `furnished physical circulation blocks ${endpoint.id}`, plan.floor);
    }
  }
}
