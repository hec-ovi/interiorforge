import { expect, it } from "vitest";
import { segmentDistance, segmentSweepClear } from "./segment-sweep.js";

it("measures complete segments across crossings, overlap, endpoints and degenerate points", () => {
  expect(segmentDistance([0, 0], [2, 2], [0, 2], [2, 0])).toBe(0);
  expect(segmentDistance([0, 0], [2, 0], [1, 0], [3, 0])).toBe(0);
  expect(segmentDistance([0, 0], [1, 0], [1, 0], [1, 2])).toBe(0);
  expect(segmentDistance([0, 0], [2, 0], [0.5, 0.75], [1.5, 0.75])).toBe(0.75);
  expect(segmentDistance([0, 0], [1, 0], [2, 1], [3, 2])).toBe(Math.SQRT2);
  expect(segmentDistance([1, 0], [1, 0], [0, 0], [2, 0])).toBe(0);
  expect(segmentDistance([0, 0], [0, 0], [3, 4], [3, 4])).toBe(5);
});

it("certifies positive tangency while rejecting closed contact and every smaller separation", () => {
  expect(segmentSweepClear([0, 0], [2, 0], [])).toBe(true);
  expect(segmentSweepClear([0, 0], [2, 0], [{ a: [0, 0.3], b: [2, 0.3], clearance: 0.3 }])).toBe(true);
  expect(segmentSweepClear([0, 0], [2, 0], [{ a: [0, 0.3 - 1e-12], b: [2, 0.3 - 1e-12], clearance: 0.3 }])).toBe(false);
  expect(segmentSweepClear([0, 0], [2, 0], [{ a: [1, -1], b: [1, 1], clearance: 0 }])).toBe(false);
  expect(segmentSweepClear([0, 0], [2, 0], [{ a: [2, 0], b: [3, 0], clearance: 0 }])).toBe(false);
  expect(segmentSweepClear([0, 0], [2, 0], [
    { a: [0, 2], b: [2, 2], clearance: 1 },
    { a: [0, 0.5], b: [2, 0.5], clearance: 0.6 },
  ])).toBe(false);
});
