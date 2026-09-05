import { expect, it } from "vitest";
import { clipPolygonToConvex, clipPolygonToRect, polygonArea, rectCorners, type Point } from "./geom.js";
import { roomFootprintContains } from "./room-footprint.js";
import { segmentCoveredByFootprints } from "./segment-coverage.js";

const plate: Point[] = [[0.44, 0.4400000000000013], [29.56, 0.44], [29.56, 23.56], [0.4400000000000013, 23.56]];
const rect = { x: 14.5, z: 0, w: 12.5, d: 8.5 };

it("assigns exact rectangle planes to crossing vertices while retaining free coordinates and source vertices", () => {
  expect(clipPolygonToRect(plate, rect)).toEqual([
    [14.5, 8.5], [14.5, 0.44000000000000067], [27, 0.4400000000000001], [27, 8.5],
  ]);
  const bounds = { x: 0.123, z: 0.456, w: 4.789, d: 3.234 };
  const surrounding: Point[] = [[-3.1, -2.9], [8.2, -1.7], [9.1, 8.3], [-2.8, 7.4]];
  for (const outline of [surrounding, [...surrounding].reverse()]) {
    const clipped = clipPolygonToRect(outline, bounds);
    expect(new Set(clipped.map(point => JSON.stringify(point)))).toEqual(new Set(rectCorners(bounds).map(point => JSON.stringify(point))));
    expect(Math.sign(polygonArea(clipped))).toBe(Math.sign(polygonArea(outline)));
  }
  const inside: Point[] = [[Number.EPSILON, 2], [4, Number.EPSILON], [8, 8]];
  const snapshot = structuredClone(inside);
  expect(clipPolygonToRect(inside, { x: 0, z: 0, w: 10, d: 10 })).toEqual(snapshot);
  expect(inside).toEqual(snapshot);
  expect(clipPolygonToRect(inside, { x: 20, z: 20, w: 1, d: 1 })).toEqual([]);
});

it("keeps generic convex crossing coordinates interpolated", () => {
  const snapshot = structuredClone(plate);
  expect(clipPolygonToConvex(plate, rectCorners(rect))).toEqual([
    [14.5, 8.499999999999998], [14.5, 0.44000000000000067],
    [27, 0.4400000000000001], [27, 8.499999999999998],
  ]);
  expect(plate).toEqual(snapshot);
});

it("certifies the complete seam between a clipped room and its requested rectangle boundary", () => {
  const room = { polygon: clipPolygonToRect(plate, rect) };
  const common = { polygon: [[14.5, 8.5], [27, 8.5], [27, 11], [14.5, 11]] as Point[] };
  const a: Point = [22.40625, 8.46875], b: Point = [22.40625, 8.53125];
  expect(roomFootprintContains(room, a)).toBe(true);
  expect(roomFootprintContains(common, b)).toBe(true);
  expect(segmentCoveredByFootprints(a, b, [room, common])).toBe(true);
  expect(segmentCoveredByFootprints(b, a, [common, room])).toBe(true);
  const recessed = { polygon: clipPolygonToRect(plate, { ...rect, d: rect.d - 4e-8 }) };
  expect(segmentCoveredByFootprints(a, b, [recessed, common])).toBe(false);
});
