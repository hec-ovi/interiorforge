import { expect, it } from "vitest";
import { roomFootprintContains } from "../core/room-footprint.js";
import { segmentCoveredByFootprints } from "../core/segment-coverage.js";
import { broadFacadeFixture } from "./facade-plan.fixture.js";
import { planBuilding } from "./index.js";

it.each([0, 37])("retains public core approaches beside a mechanical floor at %s degrees", angle => {
  const fixture = broadFacadeFixture(31, angle);
  fixture.request.blueprint.floors = [fixture.request.blueprint.floors[0]!];
  fixture.request.blueprint.facade!.grids = fixture.request.blueprint.facade!.grids!.filter(grid => grid.floor === 0);
  const plan = planBuilding(fixture.request, [{ floor: 0, kind: "mechanical" }]);
  const floor = plan.floors[0]!, circulation = plan.circulation.get(0)!;
  const publicRooms = floor.rooms.filter(room => room.kind === "corridor" && room.unit === undefined);
  expect(floor.rooms.some(room => room.kind === "mechanical_room")).toBe(true);
  expect(floor.core.stairs).toHaveLength(2);
  for (const endpoint of circulation.endpoints.filter(item => item.kind === "stair" || item.kind === "elevator")) {
    expect(publicRooms.some(room => roomFootprintContains(room, endpoint.intendedPosition)), endpoint.id).toBe(true);
    expect(publicRooms.some(room => roomFootprintContains(room, endpoint.position)), endpoint.id).toBe(true);
    const route = circulation.routes.find(item => item.to === endpoint.id)!;
    for (let i = 1; i < route.points.length; i++) {
      expect(segmentCoveredByFootprints(route.points[i - 1]!, route.points[i]!, publicRooms), endpoint.id).toBe(true);
    }
  }
});
