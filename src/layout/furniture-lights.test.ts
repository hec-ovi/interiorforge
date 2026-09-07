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
      expect(lights).toHaveLength(expected.reduce((n,item) => n + (item.kind === "sleeping_pod" ? 5 : 1), 0));
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
}, 30_000);


it("places cyan pod light on four vertical lenses and the ceiling lens", async () => {
  const { furnitureLights } = await import("./furniture-lights.js");
  const { makeFrame } = await import("./uv.js");
  const lights = furnitureLights([{id:"pod",kind:"sleeping_pod",room:"room",at:[4,6],
    rotationDeg:90,size:[2.5,1.5,2]}],makeFrame(30),3,"mid");
  expect(lights).toHaveLength(5);
  expect(lights.filter(light => light.axis?.[1] === 1)).toHaveLength(4);
  for (const light of lights) {
    expect(light.color).toEqual([.025,.72,1]);
    expect(Math.hypot(...light.direction!)).toBeCloseTo(1);
    expect(Math.hypot(...light.axis!)).toBeCloseTo(1);
  }
});
