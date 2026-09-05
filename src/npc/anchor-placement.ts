import type { Point } from "../core/geom.js";
import type { WalkGrid } from "../core/grid.js";
import { roomFootprintAnchor, roomFootprintContains } from "../core/room-footprint.js";
import type { Room } from "../core/types.js";
import type { DoorKeepOut } from "./keep-out.js";

/** Locate the flood seed on the room's usable footprint, including a spine around a core. */
export function roomFloodStart(grid: WalkGrid, room: Room): Point | null {
  const preferred = roomFootprintAnchor(room);
  if (grid.isWalkableAt(preferred)) return preferred;
  let best: Point | null = null;
  let distance = Infinity;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (!grid.isWalkable(col, row)) continue;
      const point = grid.center(col, row);
      if (!roomFootprintContains(room, point)) continue;
      const d = Math.hypot(point[0] - preferred[0], point[1] - preferred[1]);
      if (d < distance) {
        best = point;
        distance = d;
      }
    }
  }
  return best;
}

/** Resolve a standing target within its room, preserving reachability and door clearance. */
export class AnchorPlacement {
  constructor(
    private readonly grid: WalkGrid,
    private readonly visited: Uint8Array,
    private readonly keepOut: DoorKeepOut,
  ) {}

  resolve(room: Room, position: Point): Point | null {
    const p = rounded(position);
    const [c0, r0] = this.grid.cellAt(p);
    if (this.usable(room, c0, r0, p)) return p;
    const radius = Math.ceil(2.2 / this.grid.cellSize) + 1;
    for (let ring = 1; ring <= radius; ring++) {
      let best: Point | null = null;
      let bestDist = Infinity;
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
          const at = rounded(this.grid.center(c0 + dc, r0 + dr));
          if (!this.usable(room, c0 + dc, r0 + dr, at)) continue;
          const dist = Math.hypot(at[0] - p[0], at[1] - p[1]);
          if (dist < bestDist) {
            bestDist = dist;
            best = at;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private usable(room: Room, col: number, row: number, point: Point): boolean {
    return this.grid.isWalkable(col, row) && this.visited[row * this.grid.cols + col] === 1
      && roomFootprintContains(room, point) && this.keepOut.clear(point);
  }
}

function rounded([x, z]: Point): Point {
  return [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
}
