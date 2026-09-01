import { polygonBounds } from "../core/geom.js";
import type { InteriorRequest, NpcSupport } from "../core/types.js";
import type { BuildingPlan } from "../layout/index.js";
import { coreAnchors, floorAnchors } from "./anchors.js";
import { buildNav } from "./nav.js";
import { buildRoles } from "./roles.js";

export { findPath, type PathLeg, type PathQuery } from "./find-path.js";

export function buildNpcSupport(plan: BuildingPlan, request: InteriorRequest): NpcSupport {
  const anchors = [];
  for (const floor of plan.floors) {
    if (floor.rooms.length === 0) continue;
    const grid = plan.navGrids.get(floor.floor)!;
    const corridor = floor.rooms.find((r) => r.kind === "corridor" || r.kind === "elevator_lobby")!;
    const b = polygonBounds(corridor.polygon);
    const visited = grid.flood([b.x + b.w / 2, b.z + b.d / 2]);
    anchors.push(...floorAnchors(floor, grid, visited), ...coreAnchors(floor, grid, visited, corridor.id));
  }
  const { roles, routines } = buildRoles(plan.floors, anchors, request);
  return {
    buildingId: request.building.id,
    anchors,
    roles,
    routines,
    nav: buildNav(plan.floors, plan.navGrids),
  };
}
