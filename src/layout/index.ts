import { planUpperLoft } from "./lofts/upper-floor.js";
import { InteriorError } from "../core/errors.js";
import type { WalkGrid } from "../core/grid.js";
import type { FloorAssignment, FloorInterior, InteriorRequest } from "../core/types.js";
import type { CorePlan } from "./core-plan.js";
import { planCore } from "./core-plan.js";
import { entryAtLowEnd, stairRunHeadroom } from "../geometry/stairs.js";
import { STAIR } from "./constants.js";
import type { UvFloorData } from "./plan-floor.js";
import { planFloor } from "./plan-floor.js";
import type { FloorCirculation } from "./circulation.js";
export type { FloorCirculation, CirculationEndpoint } from "./circulation.js";

export type { CorePlan, CoreFeasibility } from "./core-plan.js";
export { coreFeasibility, corePlacement } from "./core-plan.js";
export type { PlannedFloor, UvFloorData } from "./plan-floor.js";
export { elevatorWaitUv, stairEntryUv } from "./core-plan.js";

export interface BuildingPlan {
  circulation: Map<number, FloorCirculation>;
  floors: FloorInterior[];
  core: CorePlan;
  navGrids: Map<number, WalkGrid>;
  /** frame-space working data per floor, for the geometry and npc passes */
  uvFloors: Map<number, UvFloorData>;
  assignments: FloorAssignment[];
}

/** Plans every floor of one building. `request` must already be validated; `assignments`
 *  must cover every blueprint floor (blueprint box resolves them). */
export function planBuilding(request: InteriorRequest, assignments: FloorAssignment[], selected?: ReadonlySet<number>): BuildingPlan {
  // Two stairs are the norm; a second stair whose flights cannot keep their headroom on
  // every floor is not built at all, so navigation and routines follow the stairs there are.
  const first = planCore(request, assignments);
  const core = first.stairB && !stairRunFits(first, request) ? planCore(request, assignments, true) : first;
  const byIndex = new Map(request.blueprint.floors.map((f) => [f.index, f]));
  const sorted = [...assignments].sort((a, b) => a.floor - b.floor);

  const floors: FloorInterior[] = [];
  const circulation = new Map<number, FloorCirculation>();
  const navGrids = new Map<number, WalkGrid>();
  const uvFloors = new Map<number, UvFloorData>();
  for (const assignment of sorted) {
    if (selected && !selected.has(assignment.floor)) continue;
    const spans = assignment.spans ?? 1;
    // a spans-2 assignment is one space: its ceiling sits above both blueprint floors
    let spaceHeight = 0;
    for (let i = 0; i < spans; i++) spaceHeight += byIndex.get(assignment.floor + i)?.height ?? 0;
    for (let i = 0; i < spans; i++) {
      const bpFloor = byIndex.get(assignment.floor + i);
      if (!bpFloor) {
        throw new InteriorError("E_ASSIGNMENT_INVALID", `assignment references missing floor ${assignment.floor + i}`);
      }
      const lower = floors.find(f => f.floor === assignment.floor);
      const planned = i > 0 && lower?.loft
        ? planUpperLoft(lower, bpFloor, core, request)
        : planFloor(request, core, bpFloor, assignment.kind, i > 0, spaceHeight);
      if (planned.circulation) circulation.set(bpFloor.index, planned.circulation);
      floors.push(planned.interior);
      navGrids.set(bpFloor.index, planned.grid);
      uvFloors.set(bpFloor.index, planned.uv);
    }
  }
  return { floors, core, navGrids, uvFloors, circulation, assignments: sorted };
}

/** Whether stair B keeps the published headroom for every floor height it repeats on. */
function stairRunFits(core: CorePlan, request: InteriorRequest): boolean {
  const low = entryAtLowEnd(core, "b");
  return request.blueprint.floors.every((floor) =>
    stairRunHeadroom(core.stairB!, low, floor.height) >= STAIR.headroom - 1e-6);
}
