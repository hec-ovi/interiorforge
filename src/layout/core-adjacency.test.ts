import { expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import defaults from "../../schemas/core-feasibility.json" with { type: "json" };
import { resolveAssignments } from "../blueprint/validate.js";
import type { CoreAdjacency } from "../core/types.js";
import { broadFacadeFixture } from "./facade-plan.fixture.js";
import { coreFeasibility, planBuilding } from "./index.js";
import { facadeDepth } from "./shell.js";
import { uvToWorld } from "./uv.js";
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
  expect(feasibility.adjacencyFailure).toMatchObject({ floor: 2, opening: "w:2:1:1", role: "room", requiredDepth: 100 });
  expect(feasibility.adjacencyFailure!.availableDepth).toBeLessThan(100);
  expect(() => planBuilding(f.request, resolveAssignments(f.request)))
    .toThrow(/E_FLOOR_TOO_SMALL.*floor 2 opening w:2:1:1 requires 100.000m of room depth/);
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
