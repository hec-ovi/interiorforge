import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import blueprintSchema from "../../schemas/blueprint.schema.json" with { type: "json" };
import type { Blueprint, OpeningGlazing } from "./types.js";

const validate = new Ajv2020({ strict: false }).compile(blueprintSchema);
const glazing: OpeningGlazing = {
  offset: 1.1, sill: 0.8, width: 1.8, height: 1.9, glassDepth: 0.04, housingBackDepth: 0.13,
};

function blueprint(clearField?: unknown): Blueprint {
  return {
    buildingId: "schema-window",
    floors: [{
      index: 0, kind: "lobby", elevation: 0, height: 4,
      outline: [[0, 0], [10, 0], [10, 8], [0, 8]],
      openings: [{
        id: "window", kind: "window", edge: 0, offset: 1, sill: 0.7, width: 2, height: 2.1,
        ...(clearField === undefined ? {} : { glazing: clearField as OpeningGlazing }),
      }],
    }],
  };
}

describe("consumed glazing schema", () => {
  it("accepts the typed Exterior field and preserves input without it", () => {
    expect(validate(blueprint(glazing))).toBe(true);
    expect(validate(blueprint())).toBe(true);
  });

  it("requires the complete field with canonical positive sizes and nonnegative coordinates and depths", () => {
    for (const key of Object.keys(glazing) as (keyof OpeningGlazing)[]) {
      const incomplete: Partial<OpeningGlazing> = { ...glazing };
      delete incomplete[key];
      expect(validate(blueprint(incomplete)), `missing ${key}`).toBe(false);
      expect(validate(blueprint({ ...glazing, [key]: -1 })), `negative ${key}`).toBe(false);
      expect(validate(blueprint({ ...glazing, [key]: 0 })), `zero ${key}`)
        .toBe(key !== "width" && key !== "height");
    }
    expect(validate(blueprint({ ...glazing, unknownDepth: 1 }))).toBe(false);
  });
});
