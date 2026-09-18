import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import { DOOR } from "./constants.js";
import { ArchitectureAccess, accessPermits, closestArchitectureCell, commonTransit } from "./architecture-access.js";
import type { CorePlan } from "./core-plan.js";
import { buildNavGrid } from "./navgrid.js";
import { elevatorWaitUv, stairEntryUv } from "./plan-floor.js";
import type { PlanRoom } from "./plan-types.js";
import { doorBetween, type IdGen } from "./rooms.js";
import { fitDoorToStretch } from "./tile-fit.js";
import type { FloorBounds } from "./shell.js";
import type { UvRect } from "./uv.js";
import { uvToWorld } from "./uv.js";

/** Proves all sampled room components within their access domains and fits useful shared-wall doors. */
export function validateArchitecture(
  worldOutline: readonly Point[], bounds: FloorBounds, rooms: PlanRoom[],
  sealed: UvRect[], core: CorePlan, floorIndex: number, ids: IdGen,
): ArchitectureAccess {
  const rebuild = (): ArchitectureAccess => new ArchitectureAccess(
    buildNavGrid(worldOutline, bounds, rooms, [], sealed, core, true), rooms, core.frame,
  );
  let access = rebuild();
  for (;;) {
    const empty = rooms.find(room => access.cells(room).length === 0);
    if (empty) throw new InteriorError("E_UNREACHABLE_SPACE", `room ${empty.id}(${empty.kind}) has no body-clear cell`, floorIndex);
    const unreached = rooms.filter(room => missing(access, room) > 0);
    if (unreached.length === 0) {
      ensureCoreReached(access, core, floorIndex);
      return access;
    }
    const fixed = repairOne(unreached, rooms, access, ids, bounds.inner, rebuild);
    if (!fixed) {
      const room = unreached[0]!;
      throw new InteriorError("E_UNREACHABLE_SPACE",
        `no ${commonTransit(room) ? "public" : "access-domain"} shared-wall repair for ${room.id}(${room.kind}): ${missing(access, room)} unreachable body-clear cells`, floorIndex);
    }
    access = fixed;
  }
}

function missing(access: ArchitectureAccess, room: PlanRoom): number {
  const visited = access.reached(room);
  return access.cells(room).reduce((count, cell) => count + (visited[cell] === 1 ? 0 : 1), 0);
}

function ensureCoreReached(access: ArchitectureAccess, core: CorePlan, floorIndex: number): void {
  const grid = access.publicGrid(), visited = access.publicReached();
  const targets: [string, Point][] = [["stair-a", uvToWorld(stairEntryUv(core, "a"), core.frame)]];
  if (core.stairB) {
    targets.push(["stair-b", uvToWorld(stairEntryUv(core, "b"), core.frame)]);
  }
  core.elevators.forEach((_, i) => {
    targets.push([core.elevators[i]!.id, uvToWorld(elevatorWaitUv(core, i), core.frame)]);
  });
  for (const [id, point] of targets) {
    const cell = closestArchitectureCell(grid, point, undefined, core.frame, DOOR.clearance / 2);
    if (visited[cell] !== 1) {
      throw new InteriorError("E_UNREACHABLE_SPACE", `core element ${id} front has no public route`, floorIndex);
    }
  }
}

function repairOne(
  unreached: PlanRoom[], rooms: PlanRoom[], access: ArchitectureAccess,
  ids: IdGen, plate: readonly Point[], rebuild: () => ArchitectureAccess,
): ArchitectureAccess | null {
  const deficit = rooms.reduce((count, room) => count + missing(access, room), 0);
  for (const room of unreached) {
    const visited = access.reached(room);
    const reachedRooms = rooms.filter(target => target !== room && accessPermits(room, target)
      && access.cells(target).some(cell => visited[cell] === 1));
    reachedRooms.sort((a, b) => publicRank(a) - publicRank(b));
    for (const target of reachedRooms) {
      // Probe another fitted opening when the existing door does not connect the sampled plate.
      const existing = [
        ...room.doors.filter((d) => d.to === target.id),
        ...target.doors.filter((d) => d.to === room.id),
      ];
      for (const fraction of [0.5, 0.1, 0.9, 0.3, 0.7]) {
        const door = doorBetween(room, target.id, target, ids, 1, DOOR.single, fraction);
        if (!door) break;
        // a repair door lands after the refit pass, so it takes the plate test itself
        if (fitDoorToStretch(door, room, target, plate) === null) {
          room.doors.pop();
          break;
        }
        if (existing.every(d => Math.abs(d.at - door.at) > 0.7)) {
          const candidate = rebuild();
          const remaining = rooms.reduce((count, item) => count + missing(candidate, item), 0);
          // A strictly decreasing integer deficit terminates without a room-count limit.
          const preserves = remaining < deficit && rooms.every(item => {
            const before = access.reached(item), after = candidate.reached(item);
            return access.cells(item).every(cell => before[cell] !== 1 || after[cell] === 1);
          });
          if (preserves) return candidate;
        }
        room.doors.pop();
      }
    }
  }
  return null;
}

function publicRank(room: PlanRoom): number {
  switch (room.kind) {
    case "corridor": case "elevator_lobby": case "concourse": return 0;
    case "reception": case "dining_area": case "gym_floor": case "parking_area": case "sales_floor": return 1;
    case "lounge": case "office_open": case "terrace_open": return 2;
    default: return 3;
  }
}
