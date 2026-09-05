import { expect, it } from "vitest";
import type { Point } from "./geom.js";
import { roomFootprintContains, type RoomFootprint } from "./room-footprint.js";
import { segmentCoveredByFootprints, segmentRectInterval } from "./segment-coverage.js";

function placement(angle: number, [ox, oz]: Point): (point: Point) => Point {
  const radians = angle * Math.PI / 180;
  return ([x, z]) => [ox + x * Math.cos(radians) - z * Math.sin(radians), oz + x * Math.sin(radians) + z * Math.cos(radians)];
}

it("clips closed segment parameters for crossing, tangent, parallel and stationary paths", () => {
  const rect = { x: 1, z: 1, w: 2, d: 2 };
  expect(segmentRectInterval([0, 2], [4, 2], rect)).toEqual([0.25, 0.75]);
  expect(segmentRectInterval([4, 2], [0, 2], rect)).toEqual([0.25, 0.75]);
  expect(segmentRectInterval([0, 2], [2, 0], rect)).toEqual([0.5, 0.5]);
  expect(segmentRectInterval([0, 0], [4, 0], rect)).toBeNull();
  expect(segmentRectInterval([2, 2], [2, 2], rect)).toEqual([0, 1]);
  expect(segmentRectInterval([0, 2], [0, 2], rect)).toBeNull();
});

it("certifies whole union coverage across a shared seam and along an outer boundary", () => {
  const polygons: Point[][] = [
    [[0, 0], [1, 0], [1, 2], [0, 2]],
    [[1, 0], [2, 0], [2, 2], [1, 2]],
  ];
  for (const angle of [0, 37, 174.80557109226515]) {
    const transform = placement(angle, [17, -23]);
    const rooms = polygons.map(polygon => ({ polygon: polygon.map(transform) }));
    expect(segmentCoveredByFootprints(transform([0.5, 1]), transform([1.5, 1]), rooms)).toBe(true);
  }
  const room = { polygon: polygons[0]! };
  expect(segmentCoveredByFootprints([0, 0], [1, 0], [room])).toBe(true);
  expect(segmentCoveredByFootprints([0.5, 1], [0.5, 1], [room])).toBe(true);
  expect(segmentCoveredByFootprints([0.5, 1], [0.5, 1], [])).toBe(false);
});

it("rejects private corners, narrow uncovered intervals and hole tolerance bands", () => {
  const left = { polygon: [[0, 0], [1, 0], [1, 2], [0, 2]] as Point[] };
  const low = { polygon: [[1, 0], [2, 0], [2, 1], [1, 1]] as Point[] };
  expect(segmentCoveredByFootprints([0.5, 1.75], [1.75, 0.5], [left, low])).toBe(false);
  const separated = { polygon: [[1.000001, 0], [2, 0], [2, 2], [1.000001, 2]] as Point[] };
  expect(segmentCoveredByFootprints([0.5, 1], [1.5, 1], [left, separated])).toBe(false);
  const room: RoomFootprint = {
    polygon: [[0, 0], [4, 0], [4, 4], [0, 4]],
    holes: [[[1.2, 1], [1.2, 2], [1.3, 2], [1.3, 1]]],
  };
  const a: Point = [0.5, 1 - 5e-9], b: Point = [3.5, 1 - 5e-9];
  for (const point of [a, b, [2, 1 - 5e-9] as Point]) expect(roomFootprintContains(room, point)).toBe(true);
  expect(segmentCoveredByFootprints(a, b, [room])).toBe(false);
  expect(segmentCoveredByFootprints([0.5, 1.5], [3.5, 1.5], [room])).toBe(false);
  expect(segmentCoveredByFootprints([0.5, 0.5], [3.5, 0.5], [room])).toBe(true);
  expect(segmentCoveredByFootprints([1.25, 1.5], [1.25, 1.5], [room])).toBe(false);
  expect(segmentCoveredByFootprints([1, -5e-9], [3, -5e-9], [room])).toBe(true);
});

it("certifies a filled hole across its shared tolerance band and rejects a microscopic unfilled gap", () => {
  const hole: Point[] = [[3, 6], [3, 8], [8, 8], [8, 6]];
  const common: RoomFootprint = { polygon: [[0, 0], [10, 0], [10, 10], [0, 10]], holes: [hole] };
  const corridor = { polygon: [...hole].reverse() };
  const a: Point = [5.5, 6.03125], b: Point = [5.5, 5.96875];
  expect(segmentCoveredByFootprints(a, b, [common, corridor])).toBe(true);
  expect(segmentCoveredByFootprints(b, a, [corridor, common])).toBe(true);
  expect(segmentCoveredByFootprints(a, b, [common])).toBe(false);
  expect(segmentCoveredByFootprints(a, b, [corridor])).toBe(false);
  for (const angle of [37, 174.80557109226515]) {
    const transform = placement(angle, [202, 711]);
    const moved = [
      { polygon: common.polygon.map(transform), holes: [hole.map(transform)] },
      { polygon: corridor.polygon.map(transform) },
    ];
    expect(segmentCoveredByFootprints(transform(a), transform(b), moved)).toBe(true);
    expect(segmentCoveredByFootprints(transform(b), transform(a), moved)).toBe(true);
  }
  const recessed = { polygon: [[3, 6 + 5e-9], [8, 6 + 5e-9], [8, 8], [3, 8]] as Point[] };
  expect(segmentCoveredByFootprints(a, b, [common, recessed])).toBe(false);
});
