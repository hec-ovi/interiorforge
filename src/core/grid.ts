import type { Point, Rect } from "./geom.js";
import { GridBoundary, gridCenterBound } from "./grid-boundary.js";
import { ROOM_FOOTPRINT_EPS, roomFootprintContains, type RoomFootprint } from "./room-footprint.js";
import type { RigidFrame2D } from "./rigid-frame.js";

/** Stable directed-edge certificate; traversal may skip already-reached targets. */
export type GridTransition = (fromIndex: number, toIndex: number) => boolean;

const CARDINAL = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const CERTIFIED = [...CARDINAL, [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;

/** Walkable occupancy grid for one floor. Cell (c, r) covers
 *  [origin + c*cell, origin + (c+1)*cell) on each axis; walkability is sampled at cell centers. */
export class WalkGrid {
  readonly origin: Point;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  private readonly cells: Uint8Array;

  constructor(origin: Point, cellSize: number, cols: number, rows: number) {
    this.origin = origin;
    this.cellSize = cellSize;
    this.cols = cols;
    this.rows = rows;
    this.cells = new Uint8Array(cols * rows);
  }

  static forPolygon(outline: readonly Point[], cellSize: number, bounds: Rect): WalkGrid {
    const cols = Math.ceil(bounds.w / cellSize);
    const rows = Math.ceil(bounds.d / cellSize);
    const grid = new WalkGrid([bounds.x, bounds.z], cellSize, cols, rows);
    grid.fillPolygon(outline, 1);
    return grid;
  }

  static forRoomFootprint(footprint: RoomFootprint, cellSize: number, bounds: Rect, frame?: RigidFrame2D): WalkGrid {
    if (frame) return WalkGrid.forFramedFootprint(footprint, cellSize, bounds, frame);
    const grid = WalkGrid.forPolygon(footprint.polygon, cellSize, bounds);
    const boundary = new GridBoundary(grid, ROOM_FOOTPRINT_EPS);
    boundary.fill(footprint.polygon, true);
    for (const hole of footprint.holes ?? []) {
      grid.fillPolygon(hole, 0);
      boundary.fill(hole, false);
    }
    return grid;
  }

  private static forFramedFootprint(footprint: RoomFootprint, cellSize: number, bounds: Rect, frame: RigidFrame2D): WalkGrid {
    const sourceRings = [footprint.polygon, ...(footprint.holes ?? [])];
    const worldRings = sourceRings.map(ring => ring.map(point => frame.toWorld(point)));
    const grid = WalkGrid.forRoomFootprint({ polygon: worldRings[0]!, holes: worldRings.slice(1) }, cellSize, bounds);
    let magnitude = Math.max(1, Math.abs(frame.origin[0]), Math.abs(frame.origin[1]));
    for (const ring of [...sourceRings, ...worldRings]) for (const [x, z] of ring) {
      magnitude = Math.max(magnitude, Math.abs(x), Math.abs(z));
    }
    // Enclose forward/inverse products, sums and translation. Membership keeps its own EPS.
    const enclosure = 64 * Number.EPSILON * magnitude;
    const boundary = new GridBoundary(grid, ROOM_FOOTPRINT_EPS + enclosure);
    const correct = (c: number, r: number): void => {
      grid.set(c, r, roomFootprintContains(footprint, frame.toLocal(grid.center(c, r))));
    };
    for (const ring of worldRings) boundary.forEach(ring, correct);
    return grid;
  }

  private fillPolygon(outline: readonly Point[], value: 0 | 1): void {
    const crossings: number[] = [];
    for (let r = 0; r < this.rows; r++) {
      const z = this.origin[1] + (r + 0.5) * this.cellSize;
      crossings.length = 0;
      for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const [xi, zi] = outline[i]!;
        const [xj, zj] = outline[j]!;
        // Keep pointInPolygon's edge orientation, arithmetic and vertex convention.
        if (zi > z !== zj > z) crossings.push(((xj - xi) * (z - zi)) / (zj - zi) + xi);
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i < crossings.length; i += 2) {
        const start = gridCenterBound(this, crossings[i]!, 0);
        const end = gridCenterBound(this, crossings[i + 1]!, 0);
        this.cells.fill(value, r * this.cols + start, r * this.cols + end);
      }
    }
  }

  center(c: number, r: number): Point {
    return [this.origin[0] + (c + 0.5) * this.cellSize, this.origin[1] + (r + 0.5) * this.cellSize];
  }

  cellAt([x, z]: Point): [number, number] {
    return [Math.floor((x - this.origin[0]) / this.cellSize), Math.floor((z - this.origin[1]) / this.cellSize)];
  }

  inBounds(c: number, r: number): boolean {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  isWalkable(c: number, r: number): boolean {
    return this.inBounds(c, r) && this.cells[r * this.cols + c] === 1;
  }

  isWalkableAt(p: Point): boolean {
    const [c, r] = this.cellAt(p);
    return this.isWalkable(c, r);
  }

  set(c: number, r: number, walkable: boolean): void {
    if (this.inBounds(c, r)) this.cells[r * this.cols + c] = walkable ? 1 : 0;
  }

  /** Marks every cell whose center lies inside the rect (grown by margin) as blocked. */
  blockRect(rect: Rect, margin = 0): void {
    this.forRect(rect, margin, (c, r) => {
      this.cells[r * this.cols + c] = 0;
    });
  }

  /** Marks every cell whose center lies inside the rect as walkable. */
  openRect(rect: Rect): void {
    this.forRect(rect, 0, (c, r) => {
      this.cells[r * this.cols + c] = 1;
    });
  }

  private forRect(rect: Rect, margin: number, fn: (c: number, r: number) => void): void {
    const c0 = Math.max(0, Math.floor((rect.x - margin - this.origin[0]) / this.cellSize));
    const r0 = Math.max(0, Math.floor((rect.z - margin - this.origin[1]) / this.cellSize));
    const c1 = Math.min(this.cols - 1, Math.ceil((rect.x + rect.w + margin - this.origin[0]) / this.cellSize));
    const r1 = Math.min(this.rows - 1, Math.ceil((rect.z + rect.d + margin - this.origin[1]) / this.cellSize));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const [x, z] = this.center(c, r);
        if (x >= rect.x - margin && x <= rect.x + rect.w + margin && z >= rect.z - margin && z <= rect.z + rect.d + margin) {
          fn(c, r);
        }
      }
    }
  }

  /** Cardinal adjacency by default; every optional diagonal needs an explicit certificate. */
  neighbors(index: number, transition?: GridTransition): number[] {
    const result: number[] = [];
    this.visitNeighbors(index, next => result.push(next), transition);
    return result;
  }

  private visitNeighbors(
    index: number, visit: (next: number) => void, transition?: GridTransition,
    reached?: Uint8Array,
  ): void {
    if (this.cells[index] !== 1) return;
    const c = index % this.cols, r = (index - c) / this.cols;
    for (const [dc, dr] of transition ? CERTIFIED : CARDINAL) {
      const nc = c + dc, nr = r + dr, next = nr * this.cols + nc;
      if (this.isWalkable(nc, nr) && (!reached || reached[next] === 0)
        && (!transition || transition(index, next))) visit(next);
    }
  }

  /** Flood fill through the same neighbor authority used for route reconstruction. */
  flood(from: Point, transition?: GridTransition): Uint8Array {
    return this.traverse(from, transition);
  }

  /** First-discovery BFS parents; unreachable cells are -1 and the root points to itself. */
  predecessors(from: Point, transition?: GridTransition): Int32Array {
    const parents = new Int32Array(this.cols * this.rows).fill(-1);
    this.traverse(from, transition, parents);
    return parents;
  }

  private traverse(from: Point, transition?: GridTransition, parents?: Int32Array): Uint8Array {
    const reached = new Uint8Array(this.cols * this.rows);
    const [sc, sr] = this.cellAt(from);
    if (!this.isWalkable(sc, sr)) return reached;
    const queue = new Int32Array(reached.length);
    let current = sr * this.cols + sc, tail = 1;
    queue[0] = current;
    reached[current] = 1;
    if (parents) parents[current] = current;
    const visit = (next: number): void => {
      reached[next] = 1;
      if (parents) parents[next] = current;
      queue[tail++] = next;
    };
    for (let head = 0; head < tail; head++) {
      current = queue[head]!;
      this.visitNeighbors(current, visit, transition, reached);
    }
    return reached;
  }

  reaches(visited: Uint8Array, p: Point): boolean {
    const [c, r] = this.cellAt(p);
    return this.inBounds(c, r) && visited[r * this.cols + c] === 1;
  }

  walkableCount(): number {
    let n = 0;
    for (const v of this.cells) n += v;
    return n;
  }

  /** Row-major bitmask, base64, for the NPC nav export. */
  toBase64(): string {
    const bytes = new Uint8Array(Math.ceil((this.cols * this.rows) / 8));
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] === 1) bytes[i >> 3] = bytes[i >> 3]! | (1 << (i & 7));
    }
    return base64Encode(bytes);
  }

  static fromBase64(encoded: string, origin: Point, cellSize: number, cols: number, rows: number): WalkGrid {
    const grid = new WalkGrid(origin, cellSize, cols, rows);
    const bytes = base64Decode(encoded);
    for (let i = 0; i < cols * rows; i++) {
      grid.cells[i] = (bytes[i >> 3]! >> (i & 7)) & 1;
    }
    return grid;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64Encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64[a >> 2]! + B64[((a & 3) << 4) | (b >> 4)]!;
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)]! : "=";
    out += i + 2 < bytes.length ? B64[c & 63]! : "=";
  }
  return out;
}

function base64Decode(encoded: string): Uint8Array {
  const clean = encoded.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]!) << 18) |
      (B64.indexOf(clean[i + 1] ?? "A") << 12) |
      (B64.indexOf(clean[i + 2] ?? "A") << 6) |
      B64.indexOf(clean[i + 3] ?? "A");
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
