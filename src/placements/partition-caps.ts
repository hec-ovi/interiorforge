import type { Point } from '../core/geom.js';
import type { BlueprintFloor, FloorInterior, InteriorRequest } from '../core/types.js';
import { edgeFrame, edgePoint, openingHole, openingReturnDepth } from '../geometry/shell-fit.js';
import { facadeDepth, shellWallDepth } from '../layout/shell.js';
import type { PlacementBuilder } from './builder.js';
import { familyOf } from './finish.js';

/** A cap is as thick as the partition it closes: both faces and their casing. */
const CAP_WIDTH = 0.2;
/** The narrowest cap still worth standing, where a partition meets glass beside a jamb. */
const MIN_CAP = 0.1;
/** How far a cap reaches back into the partition it closes. */
const OVERLAP = 0.02;
/** The cap stops this short of the glazing's back plane. */
const GLASS_CLEAR = 0.005;

const JAMBS: Record<string, string> = {
  luxury: 'door-jamb-luxury', capsule: 'door-jamb-capsule', damaged: 'door-jamb-damaged',
  corporate: 'door-jamb-corporate', industrial: 'door-jamb-industrial',
};

/**
 * Where a partition reaches the facade across a window, the window's reveal runs on behind
 * the partition's end, from its face out to the glass, and joins the two rooms the partition
 * divides. A cap closes that reveal: a jamb standing on the partition's line from the glass
 * back to the partition's end, over the window's glazed height, like the mullion a partition
 * meets glass at. Windows differ between floors that share a layout, so the caps ride with
 * each floor's own openings, beside its window returns.
 */
export function partitionCaps(builder: PlacementBuilder, bp: BlueprintFloor, floor: FloorInterior, request: InteriorRequest): void {
  const wall = shellWallDepth(request.blueprint.facade), reach = facadeDepth(request.blueprint.facade) + .06;
  const height = floor.ceilingElevation - floor.elevation;
  const module = JAMBS[familyOf(request.building.type, request.building.tier)] ?? 'door-jamb';
  const frames = bp.outline.map((_, index) => edgeFrame(bp.outline, index));
  const windows = bp.openings.filter(opening => opening.kind === 'window')
    .map(opening => ({ opening, hole: openingHole(bp, opening, wall), back: openingReturnDepth(opening) }));
  const placed = new Set<string>();
  for (const room of floor.rooms) for (const ring of [room.polygon, ...room.holes ?? []]) ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    for (const [end, other] of [[a, b], [b, a]] as const) frames.forEach((frame, edge) => {
      const t = along(frame, end), depth = across(frame, end);
      if (depth < wall - 1e-3 || depth > reach || t < 0 || t > frame.len) return;
      // Square to the facade, running inward from its end.
      const run: Point = [other[0] - end[0], other[1] - end[1]], length = Math.hypot(run[0], run[1]);
      if (length < 1e-6 || (run[0] * frame.inward[0] + run[1] * frame.inward[1]) / length < .999) return;
      for (const { opening, hole, back } of windows) {
        if (opening.edge !== edge) continue;
        const lo = Math.max(hole.t0 + 1e-3, t - CAP_WIDTH / 2), hi = Math.min(hole.t1 - 1e-3, t + CAP_WIDTH / 2);
        if (hi - lo < MIN_CAP - 1e-9 || t < hole.t0 || t > hole.t1) continue;
        const key = `${edge}:${t.toFixed(3)}`;
        if (placed.has(key)) continue;
        placed.add(key);
        const from = back + GLASS_CLEAR, to = depth + OVERLAP, top = Math.min(hole.y1, height);
        if (to - from < .01 || top - hole.y0 < .05) continue;
        const [x, z] = edgePoint(frame, (lo + hi) / 2, (from + to) / 2);
        builder.module(module, room.id, [x, hole.y0, z], [(to - from) / .08, (top - hole.y0) / .5, (hi - lo) / .2],
          -Math.atan2(frame.inward[1], frame.inward[0]), { id: `partition-cap:${bp.index}:${edge}:${t.toFixed(3)}` });
      }
    });
  });
}

function along(frame: ReturnType<typeof edgeFrame>, p: Point): number {
  return (p[0] - frame.a[0]) * frame.dir[0] + (p[1] - frame.a[1]) * frame.dir[1];
}

function across(frame: ReturnType<typeof edgeFrame>, p: Point): number {
  return (p[0] - frame.a[0]) * frame.inward[0] + (p[1] - frame.a[1]) * frame.inward[1];
}
