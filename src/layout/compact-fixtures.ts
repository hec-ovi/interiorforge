import type { Point } from '../core/geom.js';
import type { Rng } from '../core/rng.js';
import type { PlanRoom, EdgeName } from './plan-types.js';
import { roomCoversRect, roomEdges } from './room-shape.js';
import { doorApproaches } from './architecture-access.js';
import { BATHROOM_WALL_CLEARANCE, overlaps } from './bathroom-recipe.js';
import type { UvRect } from './uv.js';

export type CompactFixtureKind = 'toilet' | 'sink' | 'shower' | 'kitchen_block' | 'fridge';
type Size = readonly [number, number, number];
export interface CompactFixture {
  kind: CompactFixtureKind;
  footprint: UvRect;
  operation: UvRect;
  rotationDeg: 0 | 90 | 180 | 270;
}
export interface CompactFixtureGroup { fixtures: CompactFixture[]; paths: Point[][] }
/** Opt-in requirements for callers with larger operating fronts. Defaults retain
 * the established compact bathroom/kitchen behavior. */
export interface CompactFixturePolicy {
  front?: Partial<Record<CompactFixtureKind, number>>;
  accepts?: (fixtures: readonly CompactFixture[]) => boolean;
}
const BODY = .34; // unchanged player capsule radius 0.32 m plus its 0.02 m skin
const STEP = .1;
/** Complete arrangements checked for body paths before a room is reported as unfittable. */
const ARRANGEMENT_BUDGET = 4000;

/** Complete canonical fixtures, fitted before any one consumes another's only corner.
 * Endpoints and the exact middle are always considered; random starts never discard
 * the sole usable position on a short wall. No facade depth is deducted here: the
 * caller already supplies the physical construction envelope. */
export function fitCompactFixtures(
  room: PlanRoom, kinds: readonly CompactFixtureKind[], sizes: Record<CompactFixtureKind, Size>, rng: Rng,
  fits: (footprint: UvRect, kind: CompactFixtureKind) => boolean,
  covers: (operation: UvRect) => boolean,
  obstacles: readonly UvRect[] = [],
  policy: CompactFixturePolicy = {},
): CompactFixtureGroup | null {
  const walls = rng.shuffle(roomEdges(room).filter(wall => wall.edge !== null));
  const candidates = kinds.map(kind => {
    const [width, depth] = sizes[kind], options: CompactFixture[] = [];
    for (const wall of walls) {
      const edge = wall.edge!, horizontal = edge.startsWith('v'), axis = horizontal ? 0 : 1;
      const low = Math.min(wall.a[axis]!, wall.b[axis]!), high = Math.max(wall.a[axis]!, wall.b[axis]!);
      const available = high - low - width - .2;
      if (available < -1e-8) continue;
      const offsets = new Set([0, Math.max(0, available), Math.max(0, available / 2)]);
      for (let at = STEP; at < available; at += STEP) offsets.add(at);
      for (const offset of offsets) {
        const footprint = against(edge, wall.a[1 - axis]!, low + .1 + offset, width, depth);
        const rotationDeg = edge === 'v0' ? 0 : edge === 'v1' ? 180 : edge === 'u0' ? 90 : 270;
        const clearWidth = Math.max(width, kind === 'toilet' ? .8 : kind === 'sink' ? .65 : width);
        const side = (clearWidth - width) / 2;
        const front = policy.front?.[kind] ?? (kind === 'toilet' || kind === 'sink' ? .7 : .75);
        const operation = edge.startsWith('v')
          ? { u: footprint.u - side, v: footprint.v - (edge === 'v1' ? front : 0), lu: clearWidth, lv: depth + front }
          : { u: footprint.u - (edge === 'u1' ? front : 0), v: footprint.v - side, lu: depth + front, lv: clearWidth };
        if (fits(footprint, kind) && covers(operation)) options.push({ kind, footprint, operation, rotationDeg });
      }
    }
    return options;
  });
  const fixtures: CompactFixture[] = [];
  let result: CompactFixtureGroup | null = null;
  // The room and its obstacles stay fixed during the search: rasterise their walkable
  // floor once. Only the candidate fixtures change between complete arrangements.
  const floor = walkableFloor(room, obstacles);
  let arrangements = 0;
  const search = (index: number): boolean => {
    if (index === kinds.length) {
      // A room with no legal arrangement would otherwise try every combination of
      // every 0.1 m offset; past the budget the room reports that nothing fits.
      if (++arrangements > ARRANGEMENT_BUDGET) return false;
      if (policy.accepts && !policy.accepts(fixtures)) return false;
      const paths = accessPaths(room, fixtures, floor);
      if (!paths) return false;
      result = { fixtures: [...fixtures], paths }; return true;
    }
    for (const candidate of candidates[index]!) {
      if (arrangements > ARRANGEMENT_BUDGET) return false;
      if (fixtures.some(other => overlaps(candidate.footprint, other.footprint, .1)
        || other.kind !== 'kitchen_block' && overlaps(candidate.footprint, other.operation)
        || candidate.kind !== 'kitchen_block' && overlaps(candidate.operation, other.footprint))) continue;
      // A kitchen worktop's unused end may adjoin a fridge. Its two actual
      // sink/cooktop use positions are checked by the body-path search below.
      fixtures.push(candidate);
      if (search(index + 1)) return true;
      fixtures.pop();
    }
    return false;
  };
  search(0);
  return result;
}
function against(edge: EdgeName, wall: number, along: number, width: number, depth: number): UvRect {
  const inset = BATHROOM_WALL_CLEARANCE + .01;
  if (edge === 'v0') return { u: along, v: wall + inset, lu: width, lv: depth };
  if (edge === 'v1') return { u: along, v: wall - inset - depth, lu: width, lv: depth };
  if (edge === 'u0') return { u: wall + inset, v: along, lu: depth, lv: width };
  return { u: wall - inset - depth, v: along, lu: depth, lv: width };
}

/** Body-centre paths from a real door approach to the usable front of every
 * fixture. They may share open operating floor, but never cross another fixture. */
export function fixtureAccessPaths(room: PlanRoom, fixtures: readonly CompactFixture[], obstacles: readonly UvRect[] = []): Point[][] | null {
  return accessPaths(room, fixtures, walkableFloor(room, obstacles));
}

interface WalkableFloor { cols: number; rows: number; point(index: number): Point; cells: Uint8Array }

/** Body-centre cells inside the room, clear of its walls and of the fixed obstacles. */
function walkableFloor(room: PlanRoom, obstacles: readonly UvRect[]): WalkableFloor {
  const r = room.rect, cols = Math.ceil(r.lu / STEP) + 1, rows = Math.ceil(r.lv / STEP) + 1;
  const point = (index: number): Point => [r.u + index % cols * STEP, r.v + Math.floor(index / cols) * STEP];
  const cells = new Uint8Array(cols * rows);
  for (let i = 0; i < cells.length; i++) {
    const p = point(i), body = { u: p[0] - BODY, v: p[1] - BODY, lu: BODY * 2, lv: BODY * 2 };
    if (roomCoversRect(room, body, BATHROOM_WALL_CLEARANCE) && obstacles.every(fp => !overlaps(body, fp))) cells[i] = 1;
  }
  return { cols, rows, point, cells };
}

function accessPaths(room: PlanRoom, fixtures: readonly CompactFixture[], floor: WalkableFloor): Point[][] | null {
  const { cols, rows, point } = floor;
  const walkable = floor.cells.slice();
  for (let i = 0; i < walkable.length; i++) if (walkable[i]) {
    const p = point(i), body = { u: p[0] - BODY, v: p[1] - BODY, lu: BODY * 2, lv: BODY * 2 };
    if (fixtures.some(f => overlaps(body, f.footprint))) walkable[i] = 0;
  }
  const closest = (p: Point, limit: number): number => {
    let best = -1, distance = limit;
    for (let i = 0; i < walkable.length; i++) if (walkable[i]) {
      const q = point(i), d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < distance) { best = i; distance = d; }
    }
    return best;
  };
  const entries = room.doors.map(door => doorApproaches(door, room)[0]);
  if (!entries.length) return []; // program-only fitting has no doorway yet
  const start = entries.map(p => closest(p, .25)).find(index => index >= 0);
  if (start === undefined) return null;
  const previous = new Int32Array(walkable.length).fill(-1), queue = [start]; previous[start] = start;
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!, x = at % cols, y = Math.floor(at / cols);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx!, ny = y + dy!, next = ny * cols + nx;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !walkable[next] || previous[next] !== -1) continue;
      previous[next] = at; queue.push(next);
    }
  }
  const paths: Point[][] = [];
  const targets = fixtures.flatMap(f => {
    const fp = f.footprint, angle = f.rotationDeg * Math.PI / 180;
    const depth = f.rotationDeg % 180 ? fp.lu : fp.lv;
    const along = f.kind === 'kitchen_block' ? [-.65, .65] : [f.kind === 'shower' && Math.max(fp.lu, fp.lv) >= 1.3 ? .21 : 0];
    return along.map(offset => [fp.u + fp.lu / 2 + Math.sin(angle) * (depth / 2 + BODY + .025) + Math.cos(angle) * offset,
      fp.v + fp.lv / 2 + Math.cos(angle) * (depth / 2 + BODY + .025) - Math.sin(angle) * offset] as Point);
  });
  for (const target of [...entries, ...targets]) {
    const end = closest(target, .18);
    if (end < 0 || previous[end] === -1) return null;
    const path: Point[] = [];
    for (let at = end; ; at = previous[at]!) { path.push(point(at)); if (at === start) break; }
    paths.push(path.reverse());
  }
  return paths;
}
