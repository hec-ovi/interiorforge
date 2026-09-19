import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import { WalkGrid, type GridTransition } from "../core/grid.js";
import type { RoomFootprint } from "../core/room-footprint.js";
import { RigidFrame2D } from "../core/rigid-frame.js";
import type { RoomKind } from "../core/types.js";
import { BODY_CLEAR, SPINE_KINDS } from "./constants.js";
import { ArchitectureDomain } from "./architecture-domain.js";
import type { ArchitecturalGrid } from "./navgrid.js";
import type { PlanRoom } from "./plan-types.js";
import { roomAnchor, roomContains, roomPolygon } from "./room-shape.js";
import { uvRectWorldBounds, uvToWorld, worldToUv, type Frame } from "./uv.js";

const COMMON: ReadonlySet<RoomKind> = new Set([
  "corridor", "elevator_lobby", "concourse", "reception", "lounge", "office_open",
  "dining_area", "sales_floor", "gym_floor", "terrace_open", "parking_area",
]);

export function commonTransit(room: PlanRoom): boolean {
  return room.unit === undefined && COMMON.has(room.kind);
}

/** A dwelling or venue is its own access domain, including its service rooms. */
export function accessPermits(owner: PlanRoom, through: PlanRoom): boolean {
  if (commonTransit(through)) return true;
  if (commonTransit(owner)) return false;
  return owner.unit !== undefined ? owner.unit === through.unit : through.unit === undefined;
}

function domain(room: PlanRoom): string {
  return commonTransit(room) ? "common" : room.unit === undefined ? "destinations" : `unit:${room.unit}`;
}

/** Cells of one room a body can actually occupy: a pocket thinner than a body in either
 *  direction is a void the room happens to cover, not space anyone stands in, so access
 *  never asks whether it is reachable. */
function standable(cells: readonly number[], grid: WalkGrid): number[] {
  const all = new Set(cells), seen = new Set<number>(), out: number[] = [];
  for (const start of cells) {
    if (seen.has(start)) continue;
    const stack = [start], part: number[] = [];
    seen.add(start);
    while (stack.length) {
      const cell = stack.pop()!;
      part.push(cell);
      const c = cell % grid.cols, r = (cell - cell % grid.cols) / grid.cols;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (c + dc < 0 || c + dc >= grid.cols || r + dr < 0 || r + dr >= grid.rows) continue;
        const next = (r + dr) * grid.cols + c + dc;
        if (all.has(next) && !seen.has(next)) { seen.add(next); stack.push(next); }
      }
    }
    let lowC = Infinity, highC = -Infinity, lowR = Infinity, highR = -Infinity;
    for (const cell of part) {
      const c = cell % grid.cols, r = (cell - cell % grid.cols) / grid.cols;
      lowC = Math.min(lowC, c); highC = Math.max(highC, c);
      lowR = Math.min(lowR, r); highR = Math.max(highR, r);
    }
    if ((highC - lowC + 1) * grid.cellSize >= BODY_CLEAR && (highR - lowR + 1) * grid.cellSize >= BODY_CLEAR)
      for (const cell of part) out.push(cell);
  }
  return out.sort((a, b) => a - b);
}

/** Access masks retain the physical grid's wall/body clearance and exact room ownership. */
export class ArchitectureAccess {
  readonly origin: Point;
  private readonly roomCells = new Map<string, number[]>();
  private readonly grids = new Map<string, WalkGrid>();
  private readonly floods = new Map<WalkGrid, Uint8Array>();
  private readonly domains = new Map<WalkGrid, ArchitectureDomain>();
  private readonly domainRooms = new Map<WalkGrid, PlanRoom[]>();
  private readonly footprints = new Map<string, RoomFootprint>();
  private readonly spine: PlanRoom;
  private readonly ownershipFrame: RigidFrame2D;

  constructor(readonly physical: ArchitecturalGrid, private readonly rooms: PlanRoom[], frame: Frame) {
    this.ownershipFrame = new RigidFrame2D(frame.angleDeg);
    for (const room of rooms) {
      const cells: number[] = [];
      const bounds = uvRectWorldBounds(room.rect, frame);
      const footprint = { polygon: roomPolygon(room), holes: room.holes };
      this.footprints.set(room.id, footprint);
      const membership = WalkGrid.forRoomFootprint(footprint, physical.cellSize,
      { x: physical.origin[0], z: physical.origin[1], w: physical.cols * physical.cellSize, d: physical.rows * physical.cellSize },
      this.ownershipFrame);
      const [c0, r0] = physical.cellAt([bounds.x, bounds.z]);
      const [c1, r1] = physical.cellAt([bounds.x + bounds.w, bounds.z + bounds.d]);
      for (let r = Math.max(0, r0); r <= Math.min(physical.rows - 1, r1); r++) {
        for (let c = Math.max(0, c0); c <= Math.min(physical.cols - 1, c1); c++) {
          if (physical.isWalkable(c, r) && membership.isWalkable(c, r)) {
            cells.push(r * physical.cols + c);
          }
        }
      }
      this.roomCells.set(room.id, standable(cells, physical));
    }
    const spine = rooms.find(room => commonTransit(room) && SPINE_KINDS.has(room.kind));
    if (!spine) throw new InteriorError("E_UNREACHABLE_SPACE", "floor has no common corridor room");
    this.spine = spine;
    const grid = this.gridFor(spine);
    const root = closestArchitectureCell(grid, uvToWorld(roomAnchor(spine), frame), spine, frame);
    this.origin = grid.center(root % grid.cols, Math.floor(root / grid.cols));
  }

  cells(room: PlanRoom): readonly number[] { return this.roomCells.get(room.id)!; }

  publicGrid(): WalkGrid { return this.gridFor(this.spine); }
  publicReached(): Uint8Array { return this.reached(this.spine); }
  publicTransition(): GridTransition | undefined { return this.transitionFor(this.spine); }

  segmentPermitted(a: Point, b: Point, room?: PlanRoom): boolean {
    const grid = room ? this.gridFor(room) : this.publicGrid();
    return this.physical.architecture?.clear(a, b) === true && this.domains.get(grid)?.covers(a, b) === true;
  }

  gridFor(room?: PlanRoom): WalkGrid {
    if (!room) return this.physical;
    const key = domain(room), cached = this.grids.get(key);
    if (cached) return cached;
    const source = this.physical;
    const grid = new WalkGrid(source.origin, source.cellSize, source.cols, source.rows);
    const footprints: RoomFootprint[] = [];
    const permitted: PlanRoom[] = [];
    for (const candidate of this.rooms) {
      if (!accessPermits(room, candidate)) continue;
      permitted.push(candidate);
      footprints.push(this.footprints.get(candidate.id)!);
      for (const cell of this.cells(candidate)) grid.set(cell % grid.cols, Math.floor(cell / grid.cols), true);
    }
    this.grids.set(key, grid);
    this.domainRooms.set(grid, permitted);
    if (source.architecture) this.domains.set(grid, new ArchitectureDomain(grid, footprints,
      source.architecture.transition, this.ownershipFrame));
    return grid;
  }

  transitionFor(room?: PlanRoom): GridTransition | undefined {
    return room ? this.domains.get(this.gridFor(room))?.transition : this.physical.architecture?.transition;
  }

  reached(room?: PlanRoom): Uint8Array {
    const grid = this.gridFor(room);
    let reached = this.floods.get(grid);
    if (!reached) {
      reached = room && grid !== this.publicGrid()
        ? this.extendPublicReach(grid, this.transitionFor(room))
        : grid.flood(this.origin, this.transitionFor(room));
      this.floods.set(grid, reached);
    }
    return reached;
  }

  /** Every public root is already certified; expand only the domain's remaining vertices. */
  private extendPublicReach(grid: WalkGrid, transition?: GridTransition): Uint8Array {
    const reached = this.publicReached().slice();
    const queue = new Int32Array(reached.length);
    let head = 0, tail = 0;
    for (const room of this.domainRooms.get(grid)!) for (const cell of this.cells(room)) {
      if (reached[cell]) continue;
      if (grid.neighbors(cell, transition).some(next => reached[next] === 1)) {
        reached[cell] = 1;
        queue[tail++] = cell;
      }
    }
    while (head < tail) {
      for (const next of grid.neighbors(queue[head++]!, transition)) {
        if (reached[next]) continue;
        reached[next] = 1;
        queue[tail++] = next;
      }
    }
    return reached;
  }
}

export function closestArchitectureCell(
  grid: WalkGrid, point: Point, room: PlanRoom | undefined, frame: Frame, maxDisplacement: number | null = null,
): number {
  const [c0, r0] = grid.cellAt(point);
  const limit = maxDisplacement === null ? Math.max(grid.cols, grid.rows) : Math.ceil(maxDisplacement / grid.cellSize) + 1;
  for (let ring = 0; ring <= limit; ring++) {
    let best = -1, distance = Infinity;
    for (let r = Math.max(0, r0 - ring); r <= Math.min(grid.rows - 1, r0 + ring); r++) {
      for (let c = Math.max(0, c0 - ring); c <= Math.min(grid.cols - 1, c0 + ring); c++) {
        if (Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== ring || !grid.isWalkable(c, r)) continue;
        const p = grid.center(c, r);
        if (room && !roomContains(room, worldToUv(p, frame))) continue;
        const d = Math.hypot(p[0] - point[0], p[1] - point[1]);
        if (maxDisplacement !== null && d > maxDisplacement) continue;
        if (d < distance) { distance = d; best = r * grid.cols + c; }
      }
    }
    if (best !== -1) return best;
  }
  throw new InteriorError("E_UNREACHABLE_SPACE", `no circulation approach for ${room?.id ?? "core"} within ${maxDisplacement ?? "room"} m of ${JSON.stringify(point)}`);
}
