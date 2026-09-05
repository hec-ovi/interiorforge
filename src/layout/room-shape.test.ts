import { expect, it } from "vitest";
import { polygonArea } from "../core/geom.js";
import { doorUvPoint } from "./plan-floor.js";
import type { PlanRoom } from "./plan-types.js";
import { roomAnchor, roomContains, roomCoversRect, roomEdges, roomPolygon, sharedRoomEdges } from "./room-shape.js";

it("publishes exact concave occupancy and inboard shared-wall door coordinates", () => {
  const main: PlanRoom = { id: "main", kind: "studio_main", rect: { u: 0, v: 0, lu: 10, lv: 8 },
    polygon: [[0, 0], [3, 0], [3, 3], [6, 3], [6, 0], [10, 0], [10, 8], [0, 8]], doors: [] };
  const bath: PlanRoom = { id: "bath", kind: "bathroom", rect: { u: 3, v: 0, lu: 3, lv: 3 }, doors: [] };
  expect(polygonArea(roomPolygon(main))).toBe(71);
  expect(polygonArea(roomPolygon(bath))).toBe(9);
  expect(roomContains(main, [4.5, 1.5])).toBe(false);
  expect(roomContains(main, roomAnchor(main))).toBe(true);
  expect(roomCoversRect(main, { u: 1, v: 1, lu: 7, lv: 1 })).toBe(false);
  expect(roomCoversRect(main, { u: 1, v: 4, lu: 7, lv: 2 }, 0.05)).toBe(true);
  expect(roomEdges(main).filter(segment => segment.edge === "v0")).toHaveLength(3);
  expect(sharedRoomEdges(main, bath)).toContainEqual({ edge: "v0", c: 3, lo: 3, hi: 6 });
  const door = { id: "bath-entry", to: bath.id, leaves: 1 as const, width: 1, edge: "v0" as const,
    at: 4.5, position: [4.5, 3] as [number, number] };
  expect(doorUvPoint(door, main)).toEqual([4.5, 3]);
  expect(doorUvPoint({ id: "legacy", to: "outside", leaves: 1, width: 1, edge: "u1", at: 1.5 }, bath))
    .toEqual([6, 1.5]);
});
