import { describe, expect, it } from "vitest";
import { makeFixture } from "./fixture.js";
import { validateRequest } from "./validate.js";
import type { OpeningGlazing } from "../core/types.js";

function fixture() {
  const { request } = makeFixture({ seed: "glazing-validation", floors: 2, wallDepth: 0.23 });
  const floor = request.blueprint.floors.find((item) => item.openings.some((opening) => opening.kind === "window"))!;
  const opening = floor.openings.find((item) => item.kind === "window")!;
  opening.glazing = {
    offset: opening.offset + 0.05, sill: opening.sill + 0.05,
    width: opening.width - 0.1, height: opening.height - 0.1,
    glassDepth: 0.04, housingBackDepth: 0.13,
  };
  return { request, floor, opening, field: opening.glazing };
}

describe("window clear-field validation", () => {
  it("accepts fitted fields, optional wall depth and overall cuts without window glazing", () => {
    const { request, opening } = fixture();
    expect(validateRequest(request)).toBe(request);
    delete request.blueprint.facade!.wallDepth;
    expect(validateRequest(request)).toBe(request);
    delete opening.glazing;
    expect(validateRequest(request)).toBe(request);
  });

  it("rejects a clear field outside any edge of its window cut", () => {
    const mutations: ((field: OpeningGlazing) => void)[] = [
      (field) => { field.offset -= 0.1; },
      (field) => { field.width += 0.1; },
      (field) => { field.sill -= 0.1; },
      (field) => { field.height += 0.1; },
    ];
    for (const mutate of mutations) {
      const { request, floor, opening, field } = fixture();
      mutate(field);
      expect(() => validateRequest(request)).toThrowError(expect.objectContaining({
        code: "E_BLUEPRINT_INVALID", floor: floor.index,
        message: expect.stringContaining(`window ${opening.id} glazing exceeds its wall opening`),
      }));
    }
  });

  it("rejects reversed glass and housing depths and housing outside the measured shell", () => {
    const reversed = fixture();
    reversed.field.glassDepth = 0.14;
    expect(() => validateRequest(reversed.request)).toThrowError(expect.objectContaining({
      code: "E_BLUEPRINT_INVALID", message: expect.stringContaining("glazing lies behind its housing"),
    }));
    const outside = fixture();
    outside.field.housingBackDepth = 0.24;
    expect(() => validateRequest(outside.request)).toThrowError(expect.objectContaining({
      code: "E_BLUEPRINT_INVALID", message: expect.stringContaining("housing exceeds facade wall depth"),
    }));
  });
});
