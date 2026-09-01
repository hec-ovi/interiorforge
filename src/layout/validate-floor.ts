import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import type { CorePlan } from "./core-plan.js";
import { buildNavGrid } from "./navgrid.js";
import type { PlanFurniture, PlanRoom } from "./plan-types.js";
import { doorBetween, type IdGen } from "./rooms.js";
import type { Axis, UvRect } from "./uv.js";
import { toWorldPoint, toWorldRect } from "./uv.js";

const MAX_REPAIRS = 20;

/** Builds the nav grid, proves every room, stair and elevator front is reachable from the
 *  corridor, and repairs unreached rooms by adding a door to a reached neighbor.
 *  Deterministic; throws E_UNREACHABLE_SPACE when repair cannot fix the floor. */
export function validateAndRepair(
  outline: readonly Point[], rooms: PlanRoom[], furniture: PlanFurniture[], sealed: UvRect[],
  core: CorePlan, axis: Axis, floorIndex: number, ids: IdGen,
): WalkGrid {
  const corridor = rooms.find((r) => r.kind === "corridor" || r.kind === "elevator_lobby");
  if (!corridor) throw new InteriorError("E_UNREACHABLE_SPACE", "floor has no corridor room", floorIndex);
  const start = toWorldPoint(
    [corridor.rect.u + corridor.rect.lu / 2, corridor.rect.v + corridor.rect.lv / 2], axis,
  );

  for (let attempt = 0; ; attempt++) {
    const grid = buildNavGrid(outline, rooms, furniture, sealed, core, axis);
    const visited = grid.flood(start);
    const unreached = rooms.filter((room) => !roomReached(grid, visited, room, axis));

    if (unreached.length === 0) {
      ensureCoreReached(grid, visited, core, floorIndex);
      return grid;
    }
    if (attempt >= MAX_REPAIRS) {
      throw new InteriorError(
        "E_UNREACHABLE_SPACE",
        `rooms unreachable after repair: ${unreached.map((r) => `${r.id}(${r.kind})`).join(", ")}`,
        floorIndex,
      );
    }
    const fixed = repairOne(unreached, rooms, grid, visited, axis, ids);
    if (!fixed) {
      throw new InteriorError(
        "E_UNREACHABLE_SPACE",
        `no shared wall to repair ${unreached[0]!.id}(${unreached[0]!.kind})`,
        floorIndex,
      );
    }
  }
}

function roomReached(grid: WalkGrid, visited: Uint8Array, room: PlanRoom, axis: Axis): boolean {
  return sampleCells(grid, room.rect, axis, (c, r) => visited[r * grid.cols + c] === 1);
}

/** True when any walkable-and-matching cell whose CENTER lies inside the rect exists. */
function sampleCells(
  grid: WalkGrid, rect: UvRect, axis: Axis, match: (c: number, r: number) => boolean,
): boolean {
  const world = toWorldRect(rect, axis);
  const [c0, r0] = grid.cellAt([world.x, world.z]);
  const [c1, r1] = grid.cellAt([world.x + world.w, world.z + world.d]);
  for (let r = Math.max(0, r0); r <= Math.min(grid.rows - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(grid.cols - 1, c1); c++) {
      const [x, z] = grid.center(c, r);
      if (x < world.x || x > world.x + world.w || z < world.z || z > world.z + world.d) continue;
      if (grid.isWalkable(c, r) && match(c, r)) return true;
    }
  }
  return false;
}

function ensureCoreReached(grid: WalkGrid, visited: Uint8Array, core: CorePlan, floorIndex: number): void {
  const targets: [string, Point][] = [];
  const aUv = core.axis === "x"
    ? { u: core.stairA.x, lu: core.stairA.w }
    : { u: core.stairA.z, lu: core.stairA.d };
  targets.push(["stair-a", toWorldPoint([aUv.u + aUv.lu - 0.7, core.vFace - 0.8], core.axis)]);
  if (core.stairB) {
    const bUv = core.axis === "x"
      ? { u: core.stairB.x, v: core.stairB.z, lv: core.stairB.d }
      : { u: core.stairB.z, v: core.stairB.x, lv: core.stairB.w };
    targets.push(["stair-b", toWorldPoint([bUv.u - 0.8, bUv.v + bUv.lv / 2], core.axis)]);
  }
  core.elevators.forEach((e, i) => {
    const u = (core.axis === "x" ? e.rect.x : e.rect.z) + (core.axis === "x" ? e.rect.w : e.rect.d) / 2;
    targets.push([e.id, toWorldPoint([u, core.vFace - 0.8], core.axis)]);
    void i;
  });
  for (const [id, point] of targets) {
    if (!nearReached(grid, visited, point)) {
      throw new InteriorError("E_UNREACHABLE_SPACE", `core element ${id} front is not reachable`, floorIndex);
    }
  }
}

/** The exact cell may fall on an eroded band; accept any reached cell within 2 cells. */
function nearReached(grid: WalkGrid, visited: Uint8Array, p: Point): boolean {
  const [c0, r0] = grid.cellAt(p);
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const c = c0 + dc;
      const r = r0 + dr;
      if (grid.isWalkable(c, r) && visited[r * grid.cols + c] === 1) return true;
    }
  }
  return false;
}

function repairOne(
  unreached: PlanRoom[], rooms: PlanRoom[], grid: WalkGrid, visited: Uint8Array,
  axis: Axis, ids: IdGen,
): boolean {
  for (const room of unreached) {
    const reachedRooms = rooms.filter(
      (r) => r !== room && roomReached(grid, visited, r, axis),
    );
    // prefer public rooms so the repair door lands somewhere sensible
    reachedRooms.sort((a, b) => publicRank(a) - publicRank(b));
    for (const target of reachedRooms) {
      if (doorBetween(room, target.id, target.rect, ids)) return true;
    }
  }
  return false;
}

function publicRank(room: PlanRoom): number {
  switch (room.kind) {
    case "corridor": case "elevator_lobby": return 0;
    case "reception": case "dining_area": case "gym_floor": case "parking_area": return 1;
    case "living": case "office_open": return 2;
    default: return 3;
  }
}
