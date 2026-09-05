import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import { DOOR, SPINE_KINDS } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { buildNavGrid } from "./navgrid.js";
import { elevatorWaitUv, stairEntryUv } from "./plan-floor.js";
import type { PlanRoom } from "./plan-types.js";
import { doorBetween, type IdGen } from "./rooms.js";
import { fitDoorToStretch } from "./tile-fit.js";
import type { FloorBounds } from "./shell.js";
import type { UvRect } from "./uv.js";
import { uvRectWorldBounds, uvToWorld, worldToUv } from "./uv.js";
import { roomAnchor, roomContains } from "./room-shape.js";

const MAX_REPAIRS = 20;

/** Builds the architecture grid, proves every room, stair and elevator front is reachable from the
 *  corridor, and repairs unreached rooms by adding a door to a reached neighbor.
 *  Deterministic; throws E_UNREACHABLE_SPACE when repair cannot fix the floor. */
export function validateArchitecture(
  worldOutline: readonly Point[], bounds: FloorBounds, rooms: PlanRoom[],
  sealed: UvRect[], core: CorePlan, floorIndex: number, ids: IdGen,
): WalkGrid {
  const corridor = rooms.find((r) => SPINE_KINDS.has(r.kind));
  if (!corridor) throw new InteriorError("E_UNREACHABLE_SPACE", "floor has no corridor room", floorIndex);
  const start = uvToWorld(roomAnchor(corridor), core.frame);

  for (let attempt = 0; ; attempt++) {
    const grid = buildNavGrid(worldOutline, bounds, rooms, [], sealed, core, true);
    const visited = grid.flood(start);
    const unreached = rooms.filter((room) => !roomReached(grid, visited, room, core));

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
    const fixed = repairOne(unreached, rooms, grid, visited, core, ids, bounds.inner);
    if (!fixed) {
      throw new InteriorError(
        "E_UNREACHABLE_SPACE",
        `no shared wall to repair ${unreached[0]!.id}(${unreached[0]!.kind})`,
        floorIndex,
      );
    }
  }
}

function roomReached(grid: WalkGrid, visited: Uint8Array, room: PlanRoom, core: CorePlan): boolean {
  return sampleCells(grid, room, core, (c, r) => visited[r * grid.cols + c] === 1);
}

/** True when any walkable-and-matching cell falls inside the room footprint. */
function sampleCells(
  grid: WalkGrid, room: PlanRoom, core: CorePlan, match: (c: number, r: number) => boolean,
): boolean {
  const bbox = uvRectWorldBounds(room.rect, core.frame);
  const [c0, r0] = grid.cellAt([bbox.x, bbox.z]);
  const [c1, r1] = grid.cellAt([bbox.x + bbox.w, bbox.z + bbox.d]);
  for (let r = Math.max(0, r0); r <= Math.min(grid.rows - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(grid.cols - 1, c1); c++) {
      if (!grid.isWalkable(c, r)) continue;
      if (!roomContains(room, worldToUv(grid.center(c, r), core.frame))) continue;
      if (match(c, r)) return true;
    }
  }
  return false;
}

function ensureCoreReached(grid: WalkGrid, visited: Uint8Array, core: CorePlan, floorIndex: number): void {
  const targets: [string, Point][] = [["stair-a", uvToWorld([stairEntryUv(core, "a")[0], core.vFace - 0.8], core.frame)]];
  if (core.stairB) {
    targets.push(["stair-b", uvToWorld(stairEntryUv(core, "b"), core.frame)]);
  }
  core.elevators.forEach((_, i) => {
    targets.push([core.elevators[i]!.id, uvToWorld(elevatorWaitUv(core, i), core.frame)]);
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
  core: CorePlan, ids: IdGen, plate: readonly Point[],
): boolean {
  for (const room of unreached) {
    const reachedRooms = rooms.filter((r) => r !== room && roomReached(grid, visited, r, core));
    // prefer public rooms so the repair door lands somewhere sensible
    reachedRooms.sort((a, b) => publicRank(a) - publicRank(b));
    for (const target of reachedRooms) {
      // Probe another fitted opening when the existing door does not connect the sampled plate.
      const existing = [
        ...room.doors.filter((d) => d.to === target.id),
        ...target.doors.filter((d) => d.to === room.id),
      ];
      if (existing.length >= 3) continue;
      for (const fraction of [0.5, 0.1, 0.9, 0.3, 0.7]) {
        const door = doorBetween(room, target.id, target, ids, 1, DOOR.single, fraction);
        if (!door) break;
        // a repair door lands after the refit pass, so it takes the plate test itself
        if (fitDoorToStretch(door, room, target, plate) === null) {
          room.doors.pop();
          break;
        }
        if (existing.every((d) => Math.abs(d.at - door.at) > 0.7)) return true;
        room.doors.pop(); // same spot as an existing door: discard and try the next probe
      }
    }
  }
  return false;
}

function publicRank(room: PlanRoom): number {
  switch (room.kind) {
    case "corridor": case "elevator_lobby": case "concourse": return 0;
    case "reception": case "dining_area": case "gym_floor": case "parking_area": case "sales_floor": return 1;
    case "living": case "office_open": return 2;
    default: return 3;
  }
}
