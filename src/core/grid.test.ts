import { describe, expect, it } from "vitest";
import { pointInPolygon, polygonBounds, type Point, type Rect } from "./geom.js";
import { WalkGrid } from "./grid.js";

function expectCenterMembership(outline: Point[], cellSize: number, bounds: Rect): void {
  const actual = WalkGrid.forPolygon(outline, cellSize, bounds);
  const expected = new WalkGrid([bounds.x, bounds.z], cellSize, actual.cols, actual.rows);
  for (let r = 0; r < actual.rows; r++) {
    for (let c = 0; c < actual.cols; c++) {
      expected.set(c, r, pointInPolygon(expected.center(c, r), outline));
    }
  }
  expect(actual.toBase64()).toBe(expected.toBase64());
}

describe("WalkGrid.forPolygon", () => {
  it("preserves center membership on edges, horizontal tangencies and rounded coordinates", () => {
    const square: Point[] = [[0.5, 0.5], [3.5, 0.5], [3.5, 3.5], [0.5, 3.5]];
    const grid = WalkGrid.forPolygon(square, 1, { x: 0, z: 0, w: 4, d: 4 });
    expect(Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => Number(grid.isWalkable(c, r))),
    )).toEqual([[1, 1, 1, 0], [1, 1, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0]]);

    const notch: Point[] = [
      [0.5, 0.5], [6.5, 0.5], [6.5, 6.5], [4.5, 6.5],
      [4.5, 2.5], [3.5, 3.5], [2.5, 2.5], [2.5, 6.5], [0.5, 6.5],
    ];
    for (const offset of [0, -Number.EPSILON * 8, Number.EPSILON * 8, 1e9]) {
      const outline = notch.map(([x, z]): Point => [x + offset, z + offset]);
      for (const cellSize of [1, 0.3]) {
        const bounds = { x: offset, z: offset, w: 7, d: 7 };
        expectCenterMembership(outline, cellSize, bounds);
        expectCenterMembership([...outline].reverse(), cellSize, bounds);
      }
    }
  });

  it("matches ray membership for bounded concave, rotated, cropped and oversize grids", () => {
    for (let seed = 0; seed < 16; seed++) {
      const count = 6 + seed % 9;
      const angle = seed * Math.PI / 19;
      const outline = Array.from({ length: count }, (_, i): Point => {
        const radius = i % 2 === 0 ? 8 : 3 + seed % 4;
        const theta = angle + i * 2 * Math.PI / count;
        return [Math.cos(theta) * radius - 17.125, Math.sin(theta) * radius + 12.4];
      });
      const bounds = polygonBounds(outline);
      for (const padding of [-1.15, 0, 1.35]) {
        const region = {
          x: bounds.x - padding, z: bounds.z - padding,
          w: bounds.w + padding * 2, d: bounds.d + padding * 2,
        };
        for (const cellSize of [0.25, 0.3, 1]) {
          expectCenterMembership(outline, cellSize, region);
          expectCenterMembership([...outline].reverse(), cellSize, region);
        }
      }
    }
  });
});
