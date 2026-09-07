import { expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "./index.js";

it("publishes fitted light sources for each illuminated furniture assembly", () => {
  let total = 0;
  for (const tier of ["rich", "poor", "mid"] as const) {
    const { request } = makeFixture({ seed: 21, tier, floors: 4, width: 34, depth: 26 });
    const plan = planBuilding(request, resolveAssignments(request));
    for (const floor of plan.floors) {
      const expected = floor.furniture.filter(item => tier !== "poor"
        && ["ornament_wall", "room_divider", "sleeping_pod"].includes(item.kind));
      const lights = floor.lights.filter(light => light.furniture);
      expect(lights).toHaveLength(expected.length);
      total += lights.length;
      for (const item of expected) {
        const light = lights.find(light => light.furniture === item.id)!;
        expect(light.room).toBe(item.room);
        expect(light.position[1]).toBeGreaterThan(floor.elevation);
        expect(light.position[1]).toBeLessThan(floor.elevation + item.size[2]);
        expect(light.length).toBeLessThan(item.size[0]);
        expect(light.intensity).toBeGreaterThan(0);
      }
    }
  }
  expect(total).toBeGreaterThan(0);
});
