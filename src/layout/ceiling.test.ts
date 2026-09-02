import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "./index.js";
import { CEILING, ceilingClear, ceilingUnder, SOFFIT_DEPTH } from "./constants.js";

describe("ceilingUnder", () => {
  it("keeps the standard drop over punched windows", () => {
    expect(ceilingUnder([{ sill: 0.9, height: 1.5 }], 4)).toBe(ceilingClear(4));
    expect(ceilingUnder([], 4)).toBe(ceilingClear(4));
  });

  it("rises to the head of the glass, so nothing shows between ceiling and window", () => {
    // curtain wall: the exterior glazes from a 1 m spandrel up past the standard drop
    expect(ceilingUnder([{ sill: 1, height: 2.8 }], 4)).toBeCloseTo(3.8, 6);
    // never into the slab soffit above
    expect(ceilingUnder([{ sill: 1, height: 3 }], 4)).toBeCloseTo(4 - SOFFIT_DEPTH, 6);
    // a low storey gives up its service void before its clear height
    expect(ceilingUnder([], CEILING.minClear + 0.1)).toBeCloseTo(CEILING.minClear + 0.1 - SOFFIT_DEPTH, 6);
  });
});

describe("published ceiling elevation", () => {
  it("stays level with the glass head of its floor under a curtain wall", () => {
    const fix = makeFixture({ seed: 9, floors: 6, facadeStyle: "curtain-wall" });
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    let glazed = 0;
    for (const floor of plan.floors) {
      const bp = fix.request.blueprint.floors.find((f) => f.index === floor.floor)!;
      const head = Math.max(0, ...bp.openings.map((o) => o.sill + o.height));
      if (head <= ceilingClear(bp.height)) continue; // punched window: the standard drop wins
      glazed++;
      // the slab needs its soffit; everything above the ceiling is glazed to the line
      expect(floor.ceilingElevation).toBeGreaterThanOrEqual(bp.elevation + head - SOFFIT_DEPTH - 1e-6);
    }
    expect(glazed).toBeGreaterThan(0);
  });
});
