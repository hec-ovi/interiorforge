import { distanceToSegment, type Point } from "./geom.js";
import type { WalkGrid } from "./grid.js";

/** Enumerates a conservative edge band; only the exact shared distance changes cells. */
export class GridBoundary {
  constructor(private readonly grid: WalkGrid, private readonly epsilon: number) {}

  fill(ring: readonly Point[], walkable: boolean): void {
    for (let i = 0; i < ring.length; i++) this.fillEdge(ring[i]!, ring[(i + 1) % ring.length]!, walkable);
  }

  private fillEdge(a: Point, b: Point, walkable: boolean): void {
    const [ax, az] = a, [bx, bz] = b;
    const dx = bx - ax, dz = bz - az;
    // A full cell and floating-point enclosure broaden candidates, never membership.
    const roundoff = 64 * Number.EPSILON * Math.max(1, Math.abs(ax), Math.abs(az), Math.abs(bx), Math.abs(bz));
    const halo = this.epsilon + this.grid.cellSize + roundoff;
    const r0 = gridCenterBound(this.grid, Math.min(az, bz) - halo, 1);
    const r1 = gridCenterBound(this.grid, Math.max(az, bz) + halo, 1, true);
    for (let r = r0; r < r1; r++) {
      const z = this.grid.origin[1] + (r + 0.5) * this.grid.cellSize;
      let t0 = 0, t1 = 1;
      if (dz !== 0) {
        const low = (z - halo - az) / dz, high = (z + halo - az) / dz;
        t0 = Math.max(0, Math.min(low, high));
        t1 = Math.min(1, Math.max(low, high));
        if (t0 > t1) continue;
      }
      const x0 = ax + dx * t0, x1 = ax + dx * t1;
      const c0 = gridCenterBound(this.grid, Math.min(x0, x1) - halo, 0);
      const c1 = gridCenterBound(this.grid, Math.max(x0, x1) + halo, 0, true);
      for (let c = c0; c < c1; c++) {
        if (distanceToSegment(this.grid.center(c, r), a, b) <= this.epsilon) this.grid.set(c, r, walkable);
      }
    }
  }
}

/** Compare actual centers: dividing a coordinate into a cell index can cross an edge. */
export function gridCenterBound(grid: WalkGrid, value: number, axis: 0 | 1, strict = false): number {
  let lo = 0, hi = axis === 0 ? grid.cols : grid.rows;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const center = grid.origin[axis] + (mid + 0.5) * grid.cellSize;
    if (strict ? center <= value : center < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
