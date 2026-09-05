import { Ajv2020 } from "ajv/dist/2020.js";
import { expect, it } from "vitest";
import floorSchema from "../../schemas/floor.schema.json" with { type: "json" };
import type { FloorInterior, Room } from "./types.js";

const validate = new Ajv2020({ strict: false }).compile(floorSchema);
const room: Room = {
  id: "common", kind: "lounge", polygon: [[0, 0], [12, 0], [12, 10], [0, 10]],
  holes: [[[4, 3], [4, 7], [8, 7], [8, 3]]], doors: [],
};
const floor: FloorInterior = {
  floor: 0, kind: "lobby", elevation: 0, height: 4, ceilingElevation: 3.6, coreAngleDeg: 0,
  core: { elevators: [], stairs: [], shafts: [] }, openingReservations: [], rooms: [room], furniture: [], lights: [],
};

it("accepts room exclusion rings and polygon-only floor exports", () => {
  expect(validate(floor)).toBe(true);
  const { holes: _holes, ...legacy } = room;
  expect(validate({ ...floor, rooms: [legacy] })).toBe(true);
});

it("rejects incomplete exclusion rings and malformed coordinates", () => {
  for (const holes of [[[[4, 3], [4, 7]]], [[[4, 3], [4, 7], [8]]], [[[4, 3], [4, 7], [8, "7"]]]]) {
    expect(validate({ ...floor, rooms: [{ ...room, holes }] })).toBe(false);
  }
});
