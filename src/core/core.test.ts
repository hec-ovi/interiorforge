import { describe, expect, it } from "vitest";
import { createRng } from "./rng.js";
import {
  isCcw, pointInPolygon, polygonArea, polygonBounds,
  rectContainsRect, rectInPolygon, rectsOverlap, pointAlongEdge,
} from "./geom.js";
import type { Point } from "./geom.js";

describe("rng", () => {
  it("same seed and keys give an identical stream; different keys give a different one", () => {
    const a = createRng(42, "building", 7);
    const b = createRng(42, "building", 7);
    const c = createRng(42, "building", 8);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    const seqC = Array.from({ length: 20 }, () => c.next());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it("key paths do not collide on concatenation", () => {
    const joined = createRng(1, "ab");
    const split = createRng(1, "a", "b");
    expect(joined.next()).not.toEqual(split.next());
  });

  it("int, range, pick and shuffle stay within their declared bounds", () => {
    const rng = createRng(7, "bounds");
    for (let i = 0; i < 200; i++) {
      const v = rng.int(3, 6);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(6);
      const r = rng.range(1.5, 2.5);
      expect(r).toBeGreaterThanOrEqual(1.5);
      expect(r).toBeLessThan(2.5);
    }
    expect(["a", "b"]).toContain(rng.pick(["a", "b"]));
    expect(rng.shuffle([1, 2, 3, 4]).toSorted()).toEqual([1, 2, 3, 4]);
  });
});

describe("geom", () => {
  const square: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

  it("area and winding", () => {
    expect(polygonArea(square)).toBe(100);
    expect(isCcw(square)).toBe(true);
    expect(isCcw([...square].reverse())).toBe(false);
  });

  it("point in polygon", () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
    expect(pointInPolygon([11, 5], square)).toBe(false);
  });

  it("rect ops", () => {
    expect(polygonBounds(square)).toEqual({ x: 0, z: 0, w: 10, d: 10 });
    expect(rectsOverlap({ x: 0, z: 0, w: 5, d: 5 }, { x: 4, z: 4, w: 5, d: 5 })).toBe(true);
    expect(rectsOverlap({ x: 0, z: 0, w: 5, d: 5 }, { x: 6, z: 0, w: 5, d: 5 })).toBe(false);
    expect(rectContainsRect({ x: 0, z: 0, w: 10, d: 10 }, { x: 1, z: 1, w: 5, d: 5 })).toBe(true);
    expect(rectInPolygon({ x: 1, z: 1, w: 8, d: 8 }, square)).toBe(true);
    expect(rectInPolygon({ x: 5, z: 5, w: 8, d: 8 }, square)).toBe(false);
  });

  it("point along an edge", () => {
    expect(pointAlongEdge(square, 0, 3)).toEqual([3, 0]);
    expect(pointAlongEdge(square, 1, 5)).toEqual([10, 5]);
  });
});
