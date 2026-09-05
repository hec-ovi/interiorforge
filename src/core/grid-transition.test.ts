import { expect, it } from "vitest";
import type { Point } from "./geom.js";
import { WalkGrid, type GridTransition } from "./grid.js";
import { segmentSweepClear, type SweepObstacle } from "./segment-sweep.js";

function certify(grid: WalkGrid, obstacles: SweepObstacle[]): GridTransition {
  const point = (index: number): Point => grid.center(index % grid.cols, Math.floor(index / grid.cols));
  return (from, to) => segmentSweepClear(point(from), point(to), obstacles);
}

it("keeps default cardinal order and blocked-source flood behavior", () => {
  const grid = WalkGrid.forPolygon([[0, 0], [3, 0], [3, 3], [0, 3]], 1, { x: 0, z: 0, w: 3, d: 3 });
  expect(grid.neighbors(4)).toEqual([5, 3, 7, 1]);
  expect(grid.neighbors(4, certify(grid, []))).toEqual([5, 3, 7, 1, 8, 6, 2, 0]);
  expect(grid.flood([1.5, 1.5])).toEqual(new Uint8Array(9).fill(1));
  grid.set(1, 1, false);
  expect(grid.neighbors(4, certify(grid, []))).toEqual([]);
  expect(grid.neighbors(-1)).toEqual([]);
  expect(grid.flood([1.5, 1.5], certify(grid, []))).toEqual(new Uint8Array(9));
});

it("admits an explicitly certified diagonal between open centers at the original resolution", () => {
  const grid = new WalkGrid([0, 0], 0.0625, 2, 2);
  grid.set(0, 0, true);
  grid.set(1, 1, true);
  const a = grid.center(0, 0), b = grid.center(1, 1), separation = 0.3 + 0.0007892417;
  const shift = ([x, z]: Point): Point => [x - separation * Math.SQRT1_2, z + separation * Math.SQRT1_2];
  const transition = certify(grid, [{ a: shift(a), b: shift(b), clearance: 0.3 }]);
  expect(grid.neighbors(0)).toEqual([]);
  expect(grid.reaches(grid.flood(a), b)).toBe(false);
  expect(grid.neighbors(0, transition)).toEqual([3]);
  expect(grid.reaches(grid.flood(a, transition), b)).toBe(true);
});

it("rejects cardinal and diagonal body sweeps whose endpoint centers are both clear", () => {
  for (const diagonal of [false, true]) {
    const grid = new WalkGrid([0, 0], 0.0625, 2, diagonal ? 2 : 1);
    grid.set(0, 0, true);
    grid.set(1, diagonal ? 1 : 0, true);
    const a = grid.center(0, 0), b = grid.center(1, diagonal ? 1 : 0);
    const n: Point = diagonal ? [-Math.SQRT1_2, Math.SQRT1_2] : [0, 1];
    const obstruction: Point = [(a[0] + b[0]) / 2 + n[0] * 0.2999, (a[1] + b[1]) / 2 + n[1] * 0.2999];
    const obstacles = [{ a: obstruction, b: obstruction, clearance: 0.3 }];
    expect(segmentSweepClear(a, a, obstacles)).toBe(true);
    expect(segmentSweepClear(b, b, obstacles)).toBe(true);
    const transition = certify(grid, obstacles);
    expect(grid.neighbors(0, transition)).toEqual([]);
    expect(grid.reaches(grid.flood(a, transition), b)).toBe(false);
  }
});
