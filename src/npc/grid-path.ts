import type { Point } from "../core/geom.js";
import type { WalkGrid } from "../core/grid.js";
import { MinHeap } from "./min-heap.js";

/** Grid A* with line-of-sight smoothing between two walkable points of one floor, as
 *  GridSearch.walk returns it. Null when either end is blocked or no walk joins them. */
export function gridPath(grid: WalkGrid, from: Point, to: Point): Point[] | null {
  if (!grid.isWalkableAt(from) || !grid.isWalkableAt(to)) return null;
  return new GridSearch(grid, from, [to]).walk(to, true);
}

/** The point itself when it stands on a walkable cell, else the nearest walkable cell
 *  centre within `radius` metres (lower row, then lower column on a tie), else null. */
export function nearestWalkable(grid: WalkGrid, point: Point, radius: number): Point | null {
  if (grid.isWalkableAt(point)) return point;
  const [pc, pr] = grid.cellAt(point), reach = Math.ceil(radius / grid.cellSize);
  let best: Point | null = null, bestDistance = radius;
  for (let r = pr - reach; r <= pr + reach; r++) {
    for (let c = pc - reach; c <= pc + reach; c++) {
      if (!grid.isWalkable(c, r)) continue;
      const center = grid.center(c, r);
      const distance = Math.hypot(center[0] - point[0], center[1] - point[1]);
      if (distance < bestDistance || (distance === bestDistance && !best)) {
        best = center;
        bestDistance = distance;
      }
    }
  }
  return best;
}

/** Best-first search from one walkable root over its floor's 8-connected walkable cells,
 *  never cutting a blocked corner, grown only as far as its walks need. It runs A* toward the
 *  nearest of its goals by octile distance, a consistent bound, so every cell it settles holds
 *  its shortest walk and one search answers walks to all its goals. */
export class GridSearch {
  private readonly cost: Float64Array;
  private readonly parent: Int32Array;
  private readonly closed: Uint8Array;
  private readonly open = new MinHeap();
  private readonly goals: [number, number][];

  constructor(private readonly grid: WalkGrid, private readonly root: Point, goals: readonly Point[]) {
    const size = grid.cols * grid.rows, [c, r] = grid.cellAt(root);
    this.goals = goals.map(goal => grid.cellAt(goal));
    this.cost = new Float64Array(size).fill(Infinity);
    this.parent = new Int32Array(size).fill(-1);
    this.closed = new Uint8Array(size);
    this.cost[r * grid.cols + c] = 0;
    this.open.push(r * grid.cols + c, this.estimate(c, r));
  }

  /** The exact ends and the smoothed turns between them, rounded to the centimetre: from the
   *  root to `point` when `outward`, else from `point` to the root. Null when unreachable. */
  walk(point: Point, outward: boolean): Point[] | null {
    const grid = this.grid, [c, r] = grid.cellAt(point), target = r * grid.cols + c;
    if (!grid.isWalkable(c, r)) return null;
    while (!this.closed[target] && this.open.size > 0) this.expand();
    if (!this.closed[target]) return null;
    const cells: Point[] = [];
    for (let at = target; at !== -1; at = this.parent[at]!) cells.push(grid.center(at % grid.cols, Math.floor(at / grid.cols)));
    const line = outward ? [this.root, ...cells.reverse(), point] : [point, ...cells, this.root];
    const turns = smooth(grid, line).slice(1, -1).map(([x, z]): Point => [round2(x), round2(z)]);
    return [line[0]!, ...turns, line.at(-1)!];
  }

  private expand(): void {
    const grid = this.grid, current = this.open.pop();
    if (this.closed[current]) return;
    this.closed[current] = 1;
    const c = current % grid.cols, r = (current - c) / grid.cols;
    for (const [dc, dr, step] of NEIGHBORS) {
      const nc = c + dc, nr = r + dr;
      if (!grid.isWalkable(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (!grid.isWalkable(c + dc, r) || !grid.isWalkable(c, r + dr))) continue;
      const next = nr * grid.cols + nc, reached = this.cost[current]! + step;
      if (reached < this.cost[next]!) {
        this.cost[next] = reached;
        this.parent[next] = current;
        this.open.push(next, reached + this.estimate(nc, nr));
      }
    }
  }

  private estimate(c: number, r: number): number {
    let best = Infinity;
    for (const [gc, gr] of this.goals) {
      const dc = Math.abs(c - gc), dr = Math.abs(r - gr);
      best = Math.min(best, dc + dr + (Math.SQRT2 - 2) * Math.min(dc, dr));
    }
    return best;
  }
}

const NEIGHBORS: readonly [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** Greedy line-of-sight shortcutting; keeps paths tight around corners. */
function smooth(grid: WalkGrid, points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]!];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !lineOfSight(grid, points[i]!, points[j]!)) j--;
    out.push(points[j]!);
    i = j;
  }
  return out;
}

function lineOfSight(grid: WalkGrid, a: Point, b: Point): boolean {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (grid.cellSize / 2)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (!grid.isWalkableAt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
  }
  return true;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
