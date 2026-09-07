import { buildPlacements } from "./placements.js";
import type { InteriorRequest, NpcSupport } from "../core/types.js";
import { SPINE_KINDS } from "../layout/constants.js";
import type { BuildingPlan } from "../layout/index.js";
import { InteriorError } from "../core/errors.js";
import { roomFloodStart } from "./anchor-placement.js";
import { coreAnchors, floorAnchors } from "./anchors.js";
import { anchorConflicts } from "./keep-out.js";
import { buildNav } from "./nav.js";
import { buildRoles } from "./roles.js";

export { findPath, type PathLeg, type PathQuery } from "./find-path.js";

export function buildNpcSupport(plan: BuildingPlan, request: InteriorRequest): NpcSupport {
  const anchors = [];
  for (const floor of plan.floors) {
    if (floor.rooms.length === 0) continue;
    const grid = plan.navGrids.get(floor.floor)!;
    const corridor = floor.rooms.find((r) => SPINE_KINDS.has(r.kind))!;
    const lower = floor.mezzanineOf === undefined ? undefined : plan.floors.find(f => f.floor === floor.mezzanineOf);
    const start = lower?.loft?.stair.upperEntry ?? (corridor ? roomFloodStart(grid, corridor) : null);
    if (!start) throw new InteriorError("E_UNREACHABLE_SPACE", `floor ${floor.floor} has no walkable entry`, floor.floor);
    const visited = grid.flood(start);
    const floorAnchorList = [
      ...floorAnchors(floor, grid, visited),
      ...(floor.mezzanineOf === undefined ? coreAnchors(floor, grid, visited, plan.core) : []),
    ];
    const blocked = anchorConflicts(floor, floorAnchorList);
    if (blocked.length > 0) {
      throw new InteriorError(
        "E_UNREACHABLE_SPACE",
        `anchor ${blocked[0]!.anchor} stands in door ${blocked[0]!.door}`,
        floor.floor,
      );
    }
    anchors.push(...floorAnchorList);
  }
  const { roles, routines } = buildRoles(plan.floors, anchors, request);
  return {
    buildingId: request.building.id,
    anchors,
    placements: buildPlacements(plan, anchors, roles),
    roles,
    routines,
    nav: buildNav(plan.floors, plan.navGrids, plan.core, request),
  };
}
