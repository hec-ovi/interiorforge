import { InteriorError } from "../core/errors.js";
import type { WalkGrid } from "../core/grid.js";
import type { FloorAssignment, FloorInterior, InteriorRequest } from "../core/types.js";
import type { CorePlan } from "./core-plan.js";
import { planCore } from "./core-plan.js";
import type { UvFloorData } from "./plan-floor.js";
import { planFloor } from "./plan-floor.js";

export type { CorePlan } from "./core-plan.js";
export type { PlannedFloor, UvFloorData } from "./plan-floor.js";
export { elevatorWaitUv, stairEntryUv } from "./plan-floor.js";

export interface BuildingPlan {
  floors: FloorInterior[];
  core: CorePlan;
  navGrids: Map<number, WalkGrid>;
  /** frame-space working data per floor, for the geometry and npc passes */
  uvFloors: Map<number, UvFloorData>;
  assignments: FloorAssignment[];
}

/** Plans every floor of one building. `request` must already be validated; `assignments`
 *  must cover every blueprint floor (blueprint box resolves them). */
export function planBuilding(request: InteriorRequest, assignments: FloorAssignment[]): BuildingPlan {
  const core = planCore(request, assignments);
  const byIndex = new Map(request.blueprint.floors.map((f) => [f.index, f]));
  const sorted = [...assignments].sort((a, b) => a.floor - b.floor);

  const floors: FloorInterior[] = [];
  const navGrids = new Map<number, WalkGrid>();
  const uvFloors = new Map<number, UvFloorData>();
  for (const assignment of sorted) {
    const spans = assignment.spans ?? 1;
    for (let i = 0; i < spans; i++) {
      const bpFloor = byIndex.get(assignment.floor + i);
      if (!bpFloor) {
        throw new InteriorError("E_ASSIGNMENT_INVALID", `assignment references missing floor ${assignment.floor + i}`);
      }
      const planned = planFloor(request, core, bpFloor, assignment.kind, i > 0);
      floors.push(planned.interior);
      navGrids.set(bpFloor.index, planned.grid);
      uvFloors.set(bpFloor.index, planned.uv);
    }
  }
  return { floors, core, navGrids, uvFloors, assignments: sorted };
}
