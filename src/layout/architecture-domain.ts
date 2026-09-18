import type { GridTransition, WalkGrid } from "../core/grid.js";
import { polygonBounds, type Point } from "../core/geom.js";
import type { RigidFrame2D } from "../core/rigid-frame.js";
import { ROOM_FOOTPRINT_EPS, type RoomFootprint } from "../core/room-footprint.js";
import { segmentCoveredByFootprints } from "../core/segment-coverage.js";
import { segmentSweepClear, type SweepObstacle } from "../core/segment-sweep.js";
import { ArchitectureIndex, edgeSlot, segmentBounds } from "./architecture-index.js";

/** Physical edges additionally stay inside the complete union of permitted room footprints. */
export class ArchitectureDomain {
  readonly transition: GridTransition;
  readonly covers: (a: Point, b: Point) => boolean;

  constructor(grid: WalkGrid, footprints: readonly RoomFootprint[], physical: GridTransition, frame: RigidFrame2D) {
    const [x, z] = grid.origin, highX = x + grid.cols * grid.cellSize, highZ = z + grid.rows * grid.cellSize;
    const worldCorners: Point[] = [[x, z], [highX, z], [highX, highZ], [x, highZ]];
    const boundaries = new ArchitectureIndex<SweepObstacle>(polygonBounds(worldCorners.map(point => frame.toLocal(point))));
    for (const footprint of footprints) for (const ring of [footprint.polygon, ...(footprint.holes ?? [])]) {
      for (let index = 0; index < ring.length; index++) {
        const edge = { a: ring[index]!, b: ring[(index + 1) % ring.length]!, clearance: ROOM_FOOTPRINT_EPS };
        boundaries.add(edge, segmentBounds(edge), edge);
      }
    }
    this.covers = (worldA, worldB) => {
      const a = frame.toLocal(worldA), b = frame.toLocal(worldB);
      return segmentSweepClear(a, b, boundaries.query(a, b)) || segmentCoveredByFootprints(a, b, footprints);
    };
    const cache = new Uint8Array(grid.cols * grid.rows * 4);
    this.transition = (from, to) => {
      if (!physical(from, to)) return false;
      const slot = edgeSlot(from, to, grid.cols), saved = cache[slot];
      if (saved) return saved === 1;
      const a = grid.center(from % grid.cols, Math.floor(from / grid.cols));
      const b = grid.center(to % grid.cols, Math.floor(to / grid.cols));
      const covered = this.covers(a, b);
      cache[slot] = covered ? 1 : 2;
      return covered;
    };
  }
}
