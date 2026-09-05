import { expect, it } from "vitest";
import { roomFootprintAnchor, roomFootprintArea, roomFootprintClearance, roomFootprintContains,
  type RoomFootprint } from "./room-footprint.js";

it("excludes the complete central core and places its target in the surrounding room", () => {
  const room: RoomFootprint = {
    polygon: [[0, 0], [12, 0], [12, 10], [0, 10]],
    holes: [[[2, 2], [2, 8], [10, 8], [10, 2]]],
  };
  expect(roomFootprintArea(room)).toBe(72);
  expect(roomFootprintContains(room, [6, 5])).toBe(false);
  expect(roomFootprintContains(room, [2, 5])).toBe(false);
  expect(roomFootprintContains(room, [0, 5])).toBe(true);
  expect(roomFootprintClearance(room, [6, 1])).toBe(1);
  expect(roomFootprintClearance(room, [6, 5])).toBe(-3);
  const target = roomFootprintAnchor(room);
  expect(roomFootprintContains(room, target)).toBe(true);
  expect(roomFootprintClearance(room, target)).toBe(1);
  expect(roomFootprintAnchor(room)).toEqual(target);
  expect(roomFootprintAnchor({ polygon: room.polygon })).toEqual([6, 5]);
});
