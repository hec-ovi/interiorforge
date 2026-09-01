import type { Point } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import type { Nav, NpcSupport } from "../core/types.js";

export type PathLeg =
  | { kind: "walk"; floor: number; points: Point[] }
  | { kind: "ride"; connector: string; fromFloor: number; toFloor: number };

export interface PathQuery {
  floor: number;
  position: Point;
}

/** Reference pathfinder over the exported npc.json alone: grid A* with line-of-sight
 *  smoothing per floor, one connector ride across floors. Null when no route exists. */
export function findPath(npc: NpcSupport, from: PathQuery, to: PathQuery): PathLeg[] | null {
  const grids = gridCache(npc.nav);
  if (from.floor === to.floor) {
    const points = walk(grids, npc.nav, from.floor, from.position, to.position);
    return points ? [{ kind: "walk", floor: from.floor, points }] : null;
  }

  // pick the connector minimizing walk distance on both ends; elevators win for long travel
  const tall = Math.abs(to.floor - from.floor) > 1;
  let best: { connector: string; entryFrom: Point; entryTo: Point; cost: number } | null = null;
  for (const c of npc.nav.connectors) {
    if (!c.floors.includes(from.floor) || !c.floors.includes(to.floor)) continue;
    const entryFrom = c.entryByFloor[String(from.floor)];
    const entryTo = c.entryByFloor[String(to.floor)];
    if (!entryFrom || !entryTo) continue;
    const dist = distance(from.position, entryFrom) + distance(entryTo, to.position);
    const cost = dist + (tall && c.kind === "stair" ? 1000 : 0);
    if (!best || cost < best.cost) best = { connector: c.id, entryFrom, entryTo, cost };
  }
  if (!best) return null;

  const legA = walk(grids, npc.nav, from.floor, from.position, best.entryFrom);
  const legB = walk(grids, npc.nav, to.floor, best.entryTo, to.position);
  if (!legA || !legB) return null;
  return [
    { kind: "walk", floor: from.floor, points: legA },
    { kind: "ride", connector: best.connector, fromFloor: from.floor, toFloor: to.floor },
    { kind: "walk", floor: to.floor, points: legB },
  ];
}

function gridCache(nav: Nav): Map<number, WalkGrid> {
  const cached = cacheStore.get(nav);
  if (cached) return cached;
  const map = new Map<number, WalkGrid>();
  for (const f of nav.floors) {
    map.set(f.floor, WalkGrid.fromBase64(f.walkable, f.origin, nav.cellSize, f.cols, f.rows));
  }
  cacheStore.set(nav, map);
  return map;
}

const cacheStore = new WeakMap<Nav, Map<number, WalkGrid>>();

function walk(grids: Map<number, WalkGrid>, nav: Nav, floor: number, from: Point, to: Point): Point[] | null {
  const grid = grids.get(floor);
  if (!grid) return null;
  const start = nearestWalkable(grid, from);
  const goal = nearestWalkable(grid, to);
  if (!start || !goal) return null;
  const cells = aStar(grid, start, goal);
  if (!cells) return null;
  const points = cells.map(([c, r]) => grid.center(c, r));
  const smoothed = smooth(grid, [from, ...points, to]);
  return smoothed.map(([x, z]) => [round2(x), round2(z)] as Point);
}

function nearestWalkable(grid: WalkGrid, p: Point): [number, number] | null {
  const [c0, r0] = grid.cellAt(p);
  if (grid.isWalkable(c0, r0)) return [c0, r0];
  for (let radius = 1; radius <= 4; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
        if (grid.isWalkable(c0 + dc, r0 + dr)) return [c0 + dc, r0 + dr];
      }
    }
  }
  return null;
}

function aStar(grid: WalkGrid, start: [number, number], goal: [number, number]): [number, number][] | null {
  const cols = grid.cols;
  const key = (c: number, r: number) => r * cols + c;
  const open = new MinHeap();
  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const h = (c: number, r: number) => Math.hypot(c - goal[0], r - goal[1]);
  const startKey = key(...start);
  gScore.set(startKey, 0);
  open.push(startKey, h(...start));

  while (open.size > 0) {
    const current = open.pop()!;
    const c = current % cols;
    const r = (current - c) / cols;
    if (c === goal[0] && r === goal[1]) {
      const path: [number, number][] = [[c, r]];
      let k = current;
      while (cameFrom.has(k)) {
        k = cameFrom.get(k)!;
        path.push([k % cols, (k - (k % cols)) / cols]);
      }
      return path.reverse();
    }
    const g = gScore.get(current)!;
    for (const [dc, dr, cost] of NEIGHBORS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!grid.isWalkable(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (!grid.isWalkable(c + dc, r) || !grid.isWalkable(c, r + dr))) continue;
      const nk = key(nc, nr);
      const ng = g + cost;
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        cameFrom.set(nk, current);
        open.push(nk, ng + h(nc, nr));
      }
    }
  }
  return null;
}

const NEIGHBORS: [number, number, number][] = [
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
  const dist = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(dist / (grid.cellSize / 2)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    if (!grid.isWalkableAt([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false;
  }
  return true;
}

class MinHeap {
  private keys: number[] = [];
  private prios: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, prio: number): void {
    this.keys.push(key);
    this.prios.push(prio);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prios[parent]! <= this.prios[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number | undefined {
    if (this.keys.length === 0) return undefined;
    const top = this.keys[0]!;
    const lastKey = this.keys.pop()!;
    const lastPrio = this.prios.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = lastKey;
      this.prios[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < this.keys.length && this.prios[l]! < this.prios[smallest]!) smallest = l;
        if (r < this.keys.length && this.prios[r]! < this.prios[smallest]!) smallest = r;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b]!, this.keys[a]!];
    [this.prios[a], this.prios[b]] = [this.prios[b]!, this.prios[a]!];
  }
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
