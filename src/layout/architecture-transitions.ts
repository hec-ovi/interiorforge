import type { Point } from "../core/geom.js";
import type { GridTransition, WalkGrid } from "../core/grid.js";
import { segmentRectInterval } from "../core/segment-coverage.js";
import { segmentSweepClear, type SweepObstacle } from "../core/segment-sweep.js";
import { ArchitectureIndex, edgeSlot, segmentBounds } from "./architecture-index.js";
import { uvRectWorldBounds, uvToWorld, worldToUv, type Frame, type UvRect } from "./uv.js";

interface Channel { center: Point; axis: Point; width: number; depth: number }

/** Continuous free-space model of the same blockers and channel carves sampled by navgrid. */
export class ArchitectureTransitions {
  readonly transition: GridTransition;
  private readonly walls: ArchitectureIndex<SweepObstacle>;
  private readonly boxes: ArchitectureIndex<UvRect>;
  private readonly furniture: ArchitectureIndex<UvRect>;
  private readonly channels: ArchitectureIndex<Channel>;
  private readonly cache: Uint8Array;
  private cached = false;
  private hasFurniture = false;

  constructor(grid: WalkGrid, private readonly frame: Frame) {
    const bounds = { x: grid.origin[0], z: grid.origin[1], w: grid.cols * grid.cellSize, d: grid.rows * grid.cellSize };
    this.walls = new ArchitectureIndex(bounds);
    this.boxes = new ArchitectureIndex(bounds);
    this.furniture = new ArchitectureIndex(bounds);
    this.channels = new ArchitectureIndex(bounds);
    this.cache = new Uint8Array(grid.cols * grid.rows * 4);
    this.transition = (from, to) => {
      const slot = edgeSlot(from, to, grid.cols), saved = this.cache[slot];
      if (saved) return saved === 1;
      const allowed = this.clear(grid.center(from % grid.cols, Math.floor(from / grid.cols)),
        grid.center(to % grid.cols, Math.floor(to / grid.cols)));
      this.cache[slot] = allowed ? 1 : 2;
      this.cached = true;
      return allowed;
    };
  }

  blockSegment(a: Point, b: Point, clearance: number): void {
    const wall = { a, b, clearance };
    this.walls.add(wall, segmentBounds(wall), wall);
    this.invalidate();
  }

  blockRect(rect: UvRect, margin: number, final = false): void {
    const grown = { u: rect.u - margin, v: rect.v - margin, lu: rect.lu + 2 * margin, lv: rect.lv + 2 * margin };
    (final ? this.furniture : this.boxes).add(grown, uvRectWorldBounds(grown, this.frame));
    if (final) this.hasFurniture = true;
    this.invalidate();
  }

  openRect(rect: UvRect): void {
    this.openChannel(uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], this.frame),
      [this.frame.cos, this.frame.sin], rect.lu, rect.lv);
  }

  openChannel(center: Point, axis: Point, width: number, depth: number): void {
    const du = (Math.abs(axis[0]) * width + Math.abs(axis[1]) * depth) / 2;
    const dv = (Math.abs(axis[1]) * width + Math.abs(axis[0]) * depth) / 2;
    this.channels.add({ center, axis, width, depth }, { x: center[0] - du, z: center[1] - dv, w: du * 2, d: dv * 2 });
    this.invalidate();
  }

  clear(a: Point, b: Point): boolean {
    if (this.hasFurniture && !this.clearBoxes(a, b, this.furniture)) return false;
    const intervals: [number, number][] = [];
    for (const channel of this.channels.query(a, b)) {
      const interval = segmentRectInterval(channelPoint(a, channel), channelPoint(b, channel), {
        x: -channel.width / 2, z: -channel.depth / 2, w: channel.width, d: channel.depth,
      });
      if (interval) intervals.push(interval);
    }
    if (intervals.length === 0) return this.clearArchitecture(a, b);
    intervals.sort((left, right) => left[0] - right[0]);
    const at = (t: number): Point => t === 0 ? a : t === 1 ? b
      : [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let cursor = 0;
    for (const [low, high] of intervals) {
      if (low > cursor && !this.clearArchitecture(at(cursor), at(low))) return false;
      cursor = Math.max(cursor, high);
      if (cursor >= 1) return true;
    }
    return this.clearArchitecture(at(cursor), b);
  }

  private clearArchitecture(a: Point, b: Point): boolean {
    if (!segmentSweepClear(a, b, this.walls.query(a, b))) return false;
    return this.clearBoxes(a, b, this.boxes);
  }

  private clearBoxes(a: Point, b: Point, index: ArchitectureIndex<UvRect>): boolean {
    const candidates = index.query(a, b);
    if (candidates.length === 0) return true;
    const uvA = worldToUv(a, this.frame), uvB = worldToUv(b, this.frame);
    for (const rect of candidates) {
      if (segmentRectInterval(uvA, uvB, { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv }) !== null) return false;
    }
    return true;
  }

  private invalidate(): void {
    if (this.cached) { this.cache.fill(0); this.cached = false; }
  }
}

function channelPoint(point: Point, channel: Channel): Point {
  const x = point[0] - channel.center[0], z = point[1] - channel.center[1];
  return [x * channel.axis[0] + z * channel.axis[1], -x * channel.axis[1] + z * channel.axis[0]];
}
