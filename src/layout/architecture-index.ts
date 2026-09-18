import type { Point, Rect } from "../core/geom.js";
import { segmentDistance, type SweepObstacle } from "../core/segment-sweep.js";

/** Local candidates only; exact intersection and coverage remain Core's responsibility. */
export class ArchitectureIndex<T> {
  private readonly buckets: number[][];
  private readonly entries: T[] = [];
  private readonly seen: number[] = [];
  private readonly found: T[] = [];
  private queryId = 0;
  private readonly cols: number;
  private readonly rows: number;

  constructor(private readonly bounds: Rect, private readonly size = 1) {
    this.cols = Math.ceil(bounds.w / size);
    this.rows = Math.ceil(bounds.d / size);
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
  }

  add(value: T, bounds: Rect, segment?: SweepObstacle): void {
    const id = this.entries.push(value) - 1;
    this.eachBucket(bounds, (index, col, row) => {
      if (segment) {
        const center: Point = [this.bounds.x + (col + 0.5) * this.size, this.bounds.z + (row + 0.5) * this.size];
        if (segmentDistance(center, center, segment.a, segment.b) > segment.clearance + this.size / Math.SQRT2) return;
      }
      this.buckets[index]!.push(id);
    });
  }

  query(a: Point, b: Point): readonly T[] {
    this.found.length = 0;
    this.queryId++;
    const x = Math.min(a[0], b[0]), z = Math.min(a[1], b[1]);
    const c0 = Math.max(0, Math.floor((x - this.bounds.x) / this.size));
    const c1 = Math.min(this.cols - 1, Math.floor((x + Math.abs(a[0] - b[0]) - this.bounds.x) / this.size));
    const r0 = Math.max(0, Math.floor((z - this.bounds.z) / this.size));
    const r1 = Math.min(this.rows - 1, Math.floor((z + Math.abs(a[1] - b[1]) - this.bounds.z) / this.size));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      for (const id of this.buckets[row * this.cols + col]!) {
        if (this.seen[id] !== this.queryId) {
          this.seen[id] = this.queryId;
          this.found.push(this.entries[id]!);
        }
      }
    }
    return this.found;
  }

  private eachBucket(bounds: Rect, visit: (index: number, col: number, row: number) => void): void {
    const c0 = Math.max(0, Math.floor((bounds.x - this.bounds.x) / this.size));
    const c1 = Math.min(this.cols - 1, Math.floor((bounds.x + bounds.w - this.bounds.x) / this.size));
    const r0 = Math.max(0, Math.floor((bounds.z - this.bounds.z) / this.size));
    const r1 = Math.min(this.rows - 1, Math.floor((bounds.z + bounds.d - this.bounds.z) / this.size));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) visit(row * this.cols + col, col, row);
  }
}

export function segmentBounds({ a, b, clearance }: SweepObstacle): Rect {
  return { x: Math.min(a[0], b[0]) - clearance, z: Math.min(a[1], b[1]) - clearance,
    w: Math.abs(a[0] - b[0]) + 2 * clearance, d: Math.abs(a[1] - b[1]) + 2 * clearance };
}

/** Four undirected local edges per row-major cell cover every eight-neighbor transition. */
export function edgeSlot(from: number, to: number, cols: number): number {
  const low = Math.min(from, to), delta = Math.abs(to - from);
  return low * 4 + (delta === 1 ? 0 : delta === cols ? 1 : delta === cols + 1 ? 2 : 3);
}
