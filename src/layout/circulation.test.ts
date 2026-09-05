import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments, validateRequest } from "../blueprint/validate.js";
import { planBuilding } from "./index.js";
import { worldToUv } from "./uv.js";

const validate = new Ajv().compile(JSON.parse(readFileSync(new URL("./schema/circulation.schema.json", import.meta.url), "utf8")));

it("reserves schema-valid routes to every room, door and core approach before fitting grounded furniture", () => {
  const fixture = makeFixture({ seed: 21, floors: 10, basements: 1 });
  const plan = planBuilding(fixture.request, resolveAssignments(fixture.request));
  let seats = 0;
  for (const [floor, circulation] of plan.circulation) {
    expect(validate(circulation), JSON.stringify(validate.errors)).toBe(true);
    const data = plan.uvFloors.get(floor)!;
    const endpointIds = circulation.endpoints.map((endpoint) => endpoint.id);
    expect(new Set(endpointIds).size).toBe(endpointIds.length);
    for (const room of data.rooms) {
      expect(endpointIds).toContain(`room:${room.id}`);
      for (const door of room.doors) {
        expect(endpointIds).toContain(`door:${door.id}:${room.id}`);
        if (data.rooms.some((candidate) => candidate.id === door.to)) expect(endpointIds).toContain(`door:${door.id}:${door.to}`);
      }
    }
    expect(endpointIds).toContain("core:stair-a");
    if (plan.core.stairB) expect(endpointIds).toContain("core:stair-b");
    for (const elevator of plan.core.elevators) expect(endpointIds).toContain(`core:${elevator.id}`);
    for (const endpoint of circulation.endpoints) {
      if (endpoint.maxDisplacement !== null) {
        expect(Math.hypot(endpoint.position[0] - endpoint.intendedPosition[0], endpoint.position[1] - endpoint.intendedPosition[1]))
          .toBeLessThanOrEqual(endpoint.maxDisplacement);
      }
      const route = circulation.routes.find((candidate) => candidate.to === endpoint.id)!;
      expect(route.points[0]).toEqual(circulation.origin);
      expect(route.points.at(-1)).toEqual(endpoint.position);
    }
    const radius = circulation.bodyWidth / 2;
    for (const item of data.furniture) {
      if ((item.elevation ?? 0) > 0) continue;
      if (["chair", "stool", "office_chair"].includes(item.kind)) seats++;
      const rotated = item.rotationDeg % 180 !== 0;
      const w = item.size[rotated ? 1 : 0], d = item.size[rotated ? 0 : 1];
      const x0 = item.at[0] - w / 2, y0 = item.at[1] - d / 2;
      for (const route of circulation.routes) for (let index = 0; index < route.points.length; index++) {
        const a = worldToUv(route.points[index]!, plan.core.frame);
        const b = worldToUv(route.points[Math.min(index + 1, route.points.length - 1)]!, plan.core.frame);
        const overlaps = x0 < Math.max(a[0], b[0]) + radius && x0 + w > Math.min(a[0], b[0]) - radius
          && y0 < Math.max(a[1], b[1]) + radius && y0 + d > Math.min(a[1], b[1]) - radius;
        expect(overlaps, `${item.id} intersects route ${route.to}`).toBe(false);
      }
    }
  }
  expect(seats).toBeGreaterThan(0);
});

it("keeps narrow rotated entrance approaches near their actual target and reproduces route selection", () => {
  const fixture = makeFixture({ seed: 33, floors: 2, width: 26, depth: 20, rotationDeg: 23 });
  for (const floor of fixture.request.blueprint.floors) {
    for (const opening of floor.openings) if (opening.kind === "door") opening.width = 0.7;
  }
  const assignments = resolveAssignments(fixture.request);
  const first = planBuilding(fixture.request, assignments);
  const second = planBuilding(fixture.request, assignments);
  expect([...first.circulation]).toEqual([...second.circulation]);
  const ground = first.circulation.get(0)!;
  expect(ground.minimumDoorWidth).toBe(0.7);
  expect(ground.endpoints.some((endpoint) => endpoint.kind === "entrance")).toBe(true);
});

it("rejects an entrance narrower than the published body instead of relocating its approach", () => {
  const fixture = makeFixture({ seed: 33, floors: 2, width: 26, depth: 20 });
  for (const floor of fixture.request.blueprint.floors) {
    for (const opening of floor.openings) if (opening.kind === "door") opening.width = 0.55;
  }
  const request = validateRequest(fixture.request);
  expect(() => planBuilding(request, resolveAssignments(request))).toThrowError(expect.objectContaining({ code: "E_UNREACHABLE_SPACE" }));
});
