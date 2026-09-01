import type { InteriorRequest, NpcSupport } from "../core/types.js";
import { SPINE_KINDS } from "../layout/constants.js";
import type { BuildingPlan } from "../layout/index.js";
import { uvRectCenter, uvToWorld } from "../layout/uv.js";
import { coreAnchors, floorAnchors } from "./anchors.js";
import { buildNav } from "./nav.js";
import { buildRoles } from "./roles.js";

export { findPath, type PathLeg, type PathQuery } from "./find-path.js";

export function buildNpcSupport(plan: BuildingPlan, request: InteriorRequest): NpcSupport {
  const anchors = [];
  for (const floor of plan.floors) {
    if (floor.rooms.length === 0) continue;
    const grid = plan.navGrids.get(floor.floor)!;
    const corridor = floor.rooms.find((r) => SPINE_KINDS.has(r.kind))!;
    const uvRooms = plan.uvFloors.get(floor.floor)!.rooms;
    const uvCorridor = uvRooms.find((r) => r.id === corridor.id)!;
    const visited = grid.flood(uvToWorld(uvRectCenter(uvCorridor.rect), plan.core.frame));
    const roomCenters = new Map(
      uvRooms.map((r) => [r.id, uvToWorld(uvRectCenter(r.rect), plan.core.frame)]),
    );
    anchors.push(
      ...floorAnchors(floor, grid, visited, roomCenters),
      ...coreAnchors(floor, grid, visited, corridor.id, plan.core),
    );
  }
  const { roles, routines } = buildRoles(plan.floors, anchors, request);
  return {
    buildingId: request.building.id,
    anchors,
    roles,
    routines,
    nav: buildNav(plan.floors, plan.navGrids, plan.core),
  };
}
