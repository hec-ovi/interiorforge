import { describe, expect, it } from "vitest";
import { CEILING, ceilingClear, ceilingUnder } from "./constants.js";

describe("ceilingUnder", () => {
  it("meets the spandrel line under a curtain wall and keeps the standard drop elsewhere", () => {
    expect(ceilingUnder([{ spandrel: 0.6 }, {}], 4)).toBeCloseTo(3.4, 6);
    expect(ceilingUnder([], 4)).toBe(ceilingClear(4));
    // a spandrel that would leave less than the clear minimum is ignored
    expect(ceilingUnder([{ spandrel: 1.5 }], CEILING.minClear + 1)).toBe(ceilingClear(CEILING.minClear + 1));
  });
});
