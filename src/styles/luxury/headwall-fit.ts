import { boundaryDistance, type Point } from '../../core/geom.js';
import type { PlanFurniture, PlanRoom, EdgeName } from '../../layout/plan-types.js';
import { doorUvPoint } from '../../layout/plan-floor.js';
import { roomEdges, type RoomStretch } from '../../layout/room-shape.js';
import type { FloorBounds } from '../../layout/shell.js';

export interface BedHeadwall extends RoomStretch {
  /** Exact mounting point on the opaque room wall, in UV. */
  centre: Point;
  /** Bed's actual rear footprint line, not its centre or the group's envelope. */
  head: Point;
  gap: number;
}

/** V Corpo's bed has an opaque architectural headwall. Facade boundaries and
 * shared glass are not headwalls, even when their plan edge is perfectly straight.
 * Door cuts divide each real room face before a continuous 2m backing is accepted. */
export function findOpaqueBedHeadwall(room: PlanRoom,
  bed: Pick<PlanFurniture, 'at' | 'size' | 'rotationDeg'>,
  bounds: FloorBounds, neighbours: readonly PlanRoom[] = [room], glazing: readonly RoomStretch[] = []): BedHeadwall | null {
  const rotation = bed.rotationDeg * Math.PI / 180;
  const head: Point = [bed.at[0] - Math.sin(rotation) * bed.size[1] / 2, bed.at[1] - Math.cos(rotation) * bed.size[1] / 2];
  const edge: EdgeName = bed.rotationDeg === 0 ? 'v0' : bed.rotationDeg === 180 ? 'v1' : bed.rotationDeg === 90 ? 'u0' : 'u1';
  const along = edge.startsWith('v') ? 0 : 1, cross = 1 - along;
  const centre = head[along]!, half = bed.size[0] / 2;
  for (const segment of roomEdges(room)) {
    if (segment.edge !== edge) continue;
    const c = segment.a[cross]!, gap = (head[cross]! - c) * (edge.endsWith('0') ? 1 : -1);
    if (gap < .05 - 1e-6 || gap > .35 + 1e-6) continue;
    let spans = [[Math.min(segment.a[along]!, segment.b[along]!), Math.max(segment.a[along]!, segment.b[along]!)]];
    const subtract = (low: number, high: number): void => {
      spans = spans.flatMap(([lo, hi]) => high <= lo! || low >= hi! ? [[lo!, hi!]]
        : [[lo!, Math.min(hi!, low)], [Math.max(lo!, high), hi!]].filter(([a, b]) => b! - a! > .05));
    };
    for (const glass of glazing) if (glass.edge === edge && Math.abs(glass.c - c) < 1e-5) subtract(glass.lo, glass.hi);
    for (const owner of neighbours) for (const door of owner.doors) {
      const at = doorUvPoint(door, owner);
      if (Math.abs(at[cross]! - c) < 1e-5) subtract(at[along]! - door.width / 2 - .05, at[along]! + door.width / 2 + .05);
    }
    for (const [lo, hi] of spans) {
      if (centre - half < lo! + .05 - 1e-6 || centre + half > hi! - .05 + 1e-6) continue;
      const at = (value: number): Point => along === 0 ? [value, c] : [c, value];
      // Check both ends as well as the middle: a wide headboard can straddle a
      // facade return or glazed corner even when its centre is over a pier.
      if ([centre - half, centre, centre + half].some(value =>
        boundaryDistance(at(value), bounds.inner) < .12
        || boundaryDistance(at(value), bounds.outline) < bounds.facadeDepth + .12)) continue;
      return { edge, c, lo: lo!, hi: hi!, centre: at(centre), head, gap };
    }
  }
  return null;
}
