import { expect, it } from "vitest";
import { polygonArea } from "../core/geom.js";
import { RoomRegion } from "./room-region.js";
import { roomArea, roomContains } from "./room-shape.js";

it("subtracts joined core solids and facade units without erasing the usable connecting plate", () => {
  const outline: [number, number][] = [[0, 0], [20, 0], [20, 14], [0, 14]];
  const cuts = [
    { u: 2, v: 0, lu: 5, lv: 4 }, { u: 10, v: 0, lu: 6, lv: 4 },
    { u: 7, v: 6, lu: 4, lv: 3 }, { u: 11, v: 6, lu: 3, lv: 3 },
  ];
  const rooms = new RoomRegion(outline).subtract(cuts);
  expect(rooms).toHaveLength(1);
  const common = rooms[0]!;
  expect(roomArea(common)).toBeCloseTo(215, 6);
  expect(common.holes).toHaveLength(1);
  expect(polygonArea(common.holes![0]!)).toBeLessThan(0);
  expect(roomContains(common, [8, 7])).toBe(false);
  expect(roomContains(common, [8, 5])).toBe(true);
  expect(roomContains(common, [3, 1])).toBe(false);
  expect(new RoomRegion(outline).subtract(cuts)).toEqual(rooms);
});

it("retains separate positive-area regions when an occupied band spans an irregular plate", () => {
  const outline: [number, number][] = [[0, 0], [20, 0.2], [19, 14], [0, 13]];
  const rooms = new RoomRegion(outline).subtract([{ u: 8, v: -1, lu: 2, lv: 16 }]);
  expect(rooms).toHaveLength(2);
  expect(rooms.every(room => roomArea(room) > 90)).toBe(true);
  expect(rooms.some(room => roomContains(room, [4, 4]))).toBe(true);
  expect(rooms.some(room => roomContains(room, [15, 4]))).toBe(true);
  expect(rooms.some(room => roomContains(room, [9, 4]))).toBe(false);
});
