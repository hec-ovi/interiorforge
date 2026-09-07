import { expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "../layout/index.js";
import { buildNpcSupport, findPath } from "./index.js";

it("routes to the open side of each fitted sleeping pod", () => {
  const { request } = makeFixture({ seed: 8, width: 36, depth: 28, floors: 2, tier: "mid", type: "residential" });
  const assignments = resolveAssignments(request).map(item => item.floor === 1 ? { ...item, kind: "residence_studio" as const } : item);
  const plan = planBuilding(request, assignments), support = buildNpcSupport(plan, request);
  const entrance = support.anchors.find(anchor => anchor.kind === "entrance")!;
  const pods = plan.floors.flatMap(floor => floor.furniture.filter(item => item.kind === "sleeping_pod"));
  expect(pods.length).toBeGreaterThan(0);
  for (const pod of pods) {
    const anchor = support.anchors.find(anchor => anchor.kind === "bed" && anchor.furniture === pod.id)!;
    expect(anchor).toBeDefined();
    expect(findPath(support, { floor: entrance.floor, position: entrance.position },
      { floor: anchor.floor, position: anchor.position })).not.toBeNull();
  }
});
