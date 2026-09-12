import { expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "./index.js";

it("publishes complete luxury groups through the building planner", () => {
  const { request } = makeFixture({ seed: 8, width: 40, depth: 32, floors: 3,
    type: "residential", tier: "high_rich" });
  request.assignments = [{ floor: 0, kind: "lobby" }, { floor: 1, kind: "residence_studios", spans: 2 }];
  const plan = planBuilding(request, resolveAssignments(request));
  const furniture = plan.floors[0]!.furniture;
  const sofas = furniture.filter(item => item.kind === "sofa" && item.size[0] === 3.5);
  expect(sofas).toHaveLength(2);
  expect(sofas[0]!.room).toBe(sofas[1]!.room);
  expect(Math.abs(sofas[0]!.rotationDeg - sofas[1]!.rotationDeg)).toBe(180);
  const studios = plan.floors[1]!.furniture;
  const kitchen = studios.find(item => item.kind === "kitchen_block" && item.size[0] === 4)!;
  expect(kitchen).toBeDefined();
  const room = studios.filter(item => item.room === kitchen.room);
  expect(room.filter(item => item.kind === "stool")).toHaveLength(3);
  expect(room.some(item => item.kind === "bed_double" && item.size[0] === 2)).toBe(true);
  expect(room.some(item => item.kind === "sofa" && item.size[0] === 2.8)).toBe(true);
});
