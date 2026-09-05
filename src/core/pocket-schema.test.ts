import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, it } from "vitest";
import schema from "../../schemas/blueprint.schema.json" with { type: "json" };
import type { Blueprint, OpeningDoor } from "./types.js";

const validate = new Ajv2020({ strict: false }).compile(schema);
const door: OpeningDoor = {
  clearance: { offset: 10, sill: 0, width: 3, height: 2.5, backDepth: 0.4 },
  cassette: { offset: 8.3, sill: 0, width: 6.4, height: 2.7, backDepth: 0.4 },
  motion: { kind: "pocket", maxTravel: 1.54, clearDepth: 0, leaves: [
    { leaf: 0, travelU: -1.54, pocket: { offset: 8.46, sill: 0, width: 1.54, height: 2.5, frontDepth: 0.05, backDepth: 0.25 } },
    { leaf: 1, travelU: 1.54, pocket: { offset: 13, sill: 0, width: 1.54, height: 2.5, frontDepth: 0.05, backDepth: 0.25 } },
  ] },
};
function blueprint(assembly: unknown): Blueprint {
  return {
    buildingId: "pocket-schema", facade: { wallDepth: 0.4 },
    floors: [{ index: 0, kind: "lobby", elevation: 0, height: 4,
      outline: [[0, 0], [30, 0], [30, 20], [0, 20]],
      openings: [{ id: "entry", kind: "door", edge: 0, offset: 10, width: 3, height: 2.5, sill: 0, leaves: 2, door: assembly as OpeningDoor }],
    }],
  };
}

it("accepts complete pocket metadata and retains legacy moving-door fields", () => {
  expect(validate(blueprint(door))).toBe(true);
  for (const motion of [{ kind: "swing", clearDepth: 1.5 }, { kind: "roller", clearDepth: 0 }, { clearDepth: 1 }]) {
    expect(validate(blueprint({ motion }))).toBe(true);
  }
});

it("rejects incomplete or contradictory pocket shapes at the consumed schema boundary", () => {
  const invalid: unknown[] = [
    { ...door, cassette: undefined }, { ...door, clearance: undefined },
    { ...door, motion: { ...door.motion, clearDepth: 1 } },
    { ...door, motion: { ...door.motion, leaves: [] } },
    { ...door, motion: { kind: "swing", clearDepth: 1 } },
  ];
  const motion = door.motion!;
  if (motion.kind !== "pocket") throw new Error("expected typed pocket motion");
  for (const change of [{ travelU: 0 }, { leaf: 2 }, { pocket: { ...motion.leaves[0]!.pocket, frontDepth: -1 } }]) {
    invalid.push({ ...door, motion: { ...motion, leaves: [{ ...motion.leaves[0], ...change }] } });
  }
  for (const value of invalid) expect(validate(blueprint(value)), JSON.stringify(value)).toBe(false);
});
