import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import schema from "../../schemas/blueprint.schema.json" with { type: "json" };
import feasibility from "../../schemas/core-feasibility.json" with { type: "json" };
import type { Blueprint, CoreAdjacency } from "./types.js";

const validate = new Ajv2020({ strict: false }).compile(schema);
const policy: CoreAdjacency = {
  glazing: { role: "circulation", clearDepth: feasibility.constants.coreAdjacency.glazing.clearDepth },
  overrides: [{ floor: 0, opening: "window", role: "room", clearDepth: 3 }],
};

function blueprint(coreAdjacency?: unknown): Blueprint {
  return {
    buildingId: "core-policy",
    facade: coreAdjacency === undefined ? {} : { coreAdjacency: coreAdjacency as CoreAdjacency },
    floors: [{
      index: 0, kind: "lobby", elevation: 0, height: 4,
      outline: [[0, 0], [20, 0], [20, 14], [0, 14]],
      openings: [{ id: "window", kind: "window", edge: 0, offset: 1, width: 2, height: 2, sill: 1 }],
    }],
  };
}

describe("core-adjacency policy schema", () => {
  it("accepts persisted degree axes and rejects empty or nonnumeric frame constraints", () => {
    expect(validate({ ...blueprint(), coreFrame: { anglesDeg: [0, 90] } })).toBe(true);
    for (const anglesDeg of [[], [0, 0], ["90"]]) {
      expect(validate({ ...blueprint(), coreFrame: { anglesDeg } })).toBe(false);
    }
  });

  it("accepts the published game-design default, explicit overrides and structural compatibility", () => {
    expect(validate(blueprint(policy))).toBe(true);
    expect(validate(blueprint({ glazing: { role: "structure", clearDepth: 0 } }))).toBe(true);
    expect(validate(blueprint())).toBe(true);
  });

  it("rejects incomplete rules, unknown roles, negative depth and malformed references", () => {
    for (const invalid of [
      {}, { glazing: { role: "room" } }, { glazing: { clearDepth: 1 } },
      { glazing: { role: "corridor", clearDepth: 1 } },
      { glazing: { role: "room", clearDepth: -1 } },
      { glazing: { role: "structure", clearDepth: 0, extra: true } },
      { ...policy, overrides: [{ ...policy.overrides![0], floor: 0.5 }] },
      { ...policy, overrides: [{ ...policy.overrides![0], opening: "" }] },
      { ...policy, overrides: [{ ...policy.overrides![0], clearDepth: -1 }] },
    ]) expect(validate(blueprint(invalid)), JSON.stringify(invalid)).toBe(false);
  });
});
