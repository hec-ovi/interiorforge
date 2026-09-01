import type { Point, Rect } from "./geom.js";
import { pointInPolygon } from "./geom.js";

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
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (pointInPolygon(grid.center(c, r), outline)) grid.cells[r * cols + c] = 1;
      }
    }
    return grid;
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

  /** 4-connected flood fill from a start point; returns the visited mask. */
  flood(from: Point): Uint8Array {
    const visited = new Uint8Array(this.cols * this.rows);
    const [sc, sr] = this.cellAt(from);
    if (!this.isWalkable(sc, sr)) return visited;
    const queue: number[] = [sr * this.cols + sc];
    visited[sr * this.cols + sc] = 1;
    while (queue.length > 0) {
      const idx = queue.pop()!;
      const c = idx % this.cols;
      const r = (idx - c) / this.cols;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nc = c + dc;
        const nr = r + dr;
        const nIdx = nr * this.cols + nc;
        if (this.isWalkable(nc, nr) && visited[nIdx] === 0) {
          visited[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
    return visited;
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
