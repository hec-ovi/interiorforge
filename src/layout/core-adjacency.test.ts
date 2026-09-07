import { expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import defaults from "../../schemas/core-feasibility.json" with { type: "json" };
import { resolveAssignments } from "../blueprint/validate.js";
import type { CoreAdjacency } from "../core/types.js";
import { broadFacadeFixture } from "./facade-plan.fixture.js";
import { CoreFacadeClearance } from "./core-adjacency.js";
import { coreFeasibility, planBuilding } from "./index.js";
import { facadeDepth } from "./shell.js";
import { makeFrame, uvToWorld } from "./uv.js";
import resultSchema from "./schema/core-feasibility.schema.json" with { type: "json" };

const validateResult = new Ajv2020({ strict: false }).compile(resultSchema);

function fixture(angle = 0) {
  const result = broadFacadeFixture(31, angle);
  result.request.blueprint.facade!.coreAdjacency = structuredClone(defaults.constants.coreAdjacency) as CoreAdjacency;
  result.request.blueprint.coreFrame = { anglesDeg: [angle, angle + 90] };
  return result;
}

it("keeps requested clear depth after the full lining while preserving complete room programs", () => {
  for (const angle of [0, 37]) {
    const f = fixture(angle), bp = f.request.blueprint;
    const feasibility = coreFeasibility(bp);
    expect(feasibility.fits).toBe(true);
    expect(validateResult(feasibility), JSON.stringify(validateResult.errors)).toBe(true);
    const plan = planBuilding(f.request, resolveAssignments(f.request));
    const stair = plan.core.stairB!;
    const available = 64 - facadeDepth(bp.facade) - stair.u - stair.lu;
    expect(available).toBeGreaterThanOrEqual(defaults.constants.coreAdjacency.glazing.clearDepth - 1e-6);
    expect(available).toBeLessThan(defaults.constants.coreAdjacency.glazing.clearDepth + 0.5);
    expect(plan.floors.map(floor => floor.rooms.filter(room => room.kind === "bathroom").length)).toEqual([0, 2, 2]);
    expect(bp.facade!.coreAdjacency!.glazing.clearDepth).toBe(defaults.constants.coreAdjacency.glazing.clearDepth);
  }
});

it("reports the same explicit no-fit for an opening-specific furnished-depth request", () => {
  const f = fixture(), bp = f.request.blueprint;
  bp.facade!.coreAdjacency!.overrides = [{ floor: 2, opening: "w:2:1:1", role: "room", clearDepth: 100 }];
  const feasibility = coreFeasibility(bp);
  expect(validateResult(feasibility), JSON.stringify(validateResult.errors)).toBe(true);
  expect(feasibility.fits).toBe(false);
  expect(feasibility.blocker).toBe("opening_reservations");
  expect(feasibility.placement).toBeUndefined();
  expect(feasibility.adjacencyFailure).toEqual({
    floor: 2, opening: "w:2:1:1", coreSolid: "stair-b", role: "room",
    requiredDepth: 100, availableDepth: 26.329999999999995,
  });
  expect(() => planBuilding(f.request, resolveAssignments(f.request)))
    .toThrow("E_FLOOR_TOO_SMALL: core stair-b beside floor 2 opening w:2:1:1 requires 100.000m of room depth after the full lining; candidate provides 26.330m");
});

it("remeasures moved solids while keeping opening and solid order for equal deficits", () => {
  const bp = fixture().request.blueprint;
  const clearance = new CoreFacadeClearance(bp, makeFrame(0), facadeDepth(bp.facade));
  const rect = { u: 57.9, v: 12, lu: 5.6, lv: 2.5 };
  expect(clearance.conflict([["first", rect], ["second", rect]])).toMatchObject({
    floor: 0, opening: "w:0:1:1", coreSolid: "first",
  });
  expect(clearance.conflict([["second", rect], ["first", rect]])!.coreSolid).toBe("second");
  rect.u -= 2;
  expect(clearance.conflict([["first", rect]])).toBeUndefined();
});

it("locks the reported actual stair footprint when Exterior publishes its roof frame and center", () => {
  const f = fixture(37), bp = f.request.blueprint;
  const first = coreFeasibility(bp), stair = first.placement!.stairA;
  bp.roof = { elevation: 11.7, bulkhead: { ...stair } };
  const repeated = coreFeasibility(bp);
  expect(repeated.fits).toBe(true);
  const plan = planBuilding(f.request, resolveAssignments(f.request));
  const actual = uvToWorld([plan.core.stairA.u + plan.core.stairA.lu / 2, plan.core.stairA.v + plan.core.stairA.lv / 2], plan.core.frame);
  expect(actual[0]).toBeCloseTo(stair.center[0], 8);
  expect(actual[1]).toBeCloseTo(stair.center[1], 8);
  expect(repeated.frameAngleDeg).toBeCloseTo(first.frameAngleDeg, 8);
  bp.roof.bulkhead!.center = [500, 500];
  expect(coreFeasibility(bp).fits).toBe(false);
  expect(() => planBuilding(f.request, resolveAssignments(f.request))).toThrow(/E_FLOOR_TOO_SMALL/);
});

it("rejects ambiguous policy references and invalid persisted frame constraints", () => {
  const f = fixture(), bp = f.request.blueprint;
  bp.facade!.coreAdjacency!.overrides = [{ floor: 0, opening: "missing", role: "structure", clearDepth: 0 }];
  expect(() => coreFeasibility(bp)).toThrow(/E_BLUEPRINT_INVALID.*absent opening/);
  const rule = { floor: 0, opening: "street", role: "structure" as const, clearDepth: 0 };
  bp.facade!.coreAdjacency!.overrides = [rule, rule];
  expect(() => coreFeasibility(bp)).toThrow(/E_BLUEPRINT_INVALID.*duplicate/);
  bp.facade!.coreAdjacency!.overrides = [];
  bp.coreFrame = { anglesDeg: [0, 180] };
  expect(() => coreFeasibility(bp)).toThrow(/E_BLUEPRINT_INVALID.*unique modulo 180/);
});

it("round-trips an exact allowed axis through an entrance flip and roof placement", () => {
  const angle = 174.80557109226515, f = fixture(angle), bp = f.request.blueprint;
  bp.floors[0]!.openings.find(opening => opening.kind === "door")!.edge = 2;
  const first = coreFeasibility(bp);
  expect(first.fits).toBe(true);
  const stair = first.placement!.stairA;
  const reported = Math.atan2(stair.axis[1], stair.axis[0]) * 180 / Math.PI;
  expect(Math.abs(Math.sin((reported - angle) * Math.PI / 180))).toBeLessThan(1e-12);
  bp.roof = { elevation: 11.7, bulkhead: stair };
  expect(coreFeasibility(bp).fits).toBe(true);
});
