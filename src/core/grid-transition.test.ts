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
  expect(grid.predecessors([1.5, 1.5])).toEqual(Int32Array.from([3, 4, 5, 4, 4, 4, 3, 4, 5]));
  grid.set(1, 1, false);
  expect(grid.neighbors(4, certify(grid, []))).toEqual([]);
  expect(grid.neighbors(-1)).toEqual([]);
  for (const start of [[1.5, 1.5], [-0.5, 0.5], [3.5, 0.5]] as Point[]) {
    for (const transition of [undefined, certify(grid, [])]) {
      expect(grid.flood(start, transition)).toEqual(new Uint8Array(9));
      expect(grid.predecessors(start, transition)).toEqual(new Int32Array(9).fill(-1));
    }
  }
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
  expect(grid.predecessors(a)).toEqual(Int32Array.from([0, -1, -1, -1]));
  expect(grid.predecessors(a, transition)).toEqual(Int32Array.from([0, -1, -1, 0]));
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
    expect(grid.predecessors(a, transition)[diagonal ? 3 : 1]).toBe(-1);
  }
});

it("certifies only first-discovery edges in a fully connected neighborhood", () => {
  const grid = WalkGrid.forPolygon([[0, 0], [3, 0], [3, 3], [0, 3]], 1, { x: 0, z: 0, w: 3, d: 3 });
  for (const method of ["flood", "predecessors"] as const) {
    const edges: [number, number][] = [];
    const result = grid[method]([1.5, 1.5], (from, to) => { edges.push([from, to]); return true; });
    expect(edges).toEqual([5, 3, 7, 1, 8, 6, 2, 0].map(to => [4, to]));
    expect(result).toEqual(method === "flood" ? new Uint8Array(9).fill(1) : new Int32Array(9).fill(4));
  }
});

it("matches reference BFS masks and parents for bounded occupancy and directed certificates", () => {
  for (let pattern = 0; pattern < 64; pattern++) {
    const grid = new WalkGrid([-5, 7], 0.0625, 3, 2);
    for (let i = 0; i < 6; i++) grid.set(i % 3, Math.floor(i / 3), (pattern & (1 << i)) !== 0);
    for (const root of [0, 2, 5]) for (const directed of [false, true]) {
      const start = grid.center(root % 3, Math.floor(root / 3));
      const approve: GridTransition | undefined = directed ? (from, to) => from < to && (from + to) % 3 !== 0 : undefined;
      const expected = new Int32Array(6).fill(-1), queue: number[] = [];
      if (grid.isWalkableAt(start)) { expected[root] = root; queue.push(root); }
      for (let head = 0; head < queue.length; head++) {
        const from = queue[head]!;
        for (const next of grid.neighbors(from, approve)) if (expected[next] === -1) {
          expected[next] = from;
          queue.push(next);
        }
      }
      const accepted = new Set<string>();
      const certificate = approve ? (from: number, to: number): boolean => {
        const clear = approve(from, to);
        if (clear) accepted.add(`${from}:${to}`);
        return clear;
      } : undefined;
      const parents = grid.predecessors(start, certificate);
      expect(parents).toEqual(expected);
      expect(grid.flood(start, approve)).toEqual(Uint8Array.from(expected, parent => Number(parent !== -1)));
      if (approve) for (const [to, from] of parents.entries()) {
        if (from !== -1 && from !== to) expect(accepted.has(`${from}:${to}`)).toBe(true);
      }
    }
  }
});
