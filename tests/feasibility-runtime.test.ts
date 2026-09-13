import { expect, it } from "vitest";
import { coreFeasibility as source } from "../src/feasibility.js";
import { coreFeasibility as compiled } from "../dist/feasibility.js";
import { makeFixture } from "../src/index.js";

it("the built browser-safe entry returns the same fit and no-fit result", () => {
  for (const dimensions of [{ width: 26, depth: 20 }, { width: 6, depth: 6 }]) {
    const { request } = makeFixture({ ...dimensions, floors: 1 });
    const result = compiled(request.blueprint);
    expect(result).toEqual(source(request.blueprint));
    expect(result.fits).toBe(dimensions.width === 26);
    if (result.fits) expect(result.placement?.stairA).toBeDefined();
    else expect(result.blocker).toBeDefined();
  }
});
