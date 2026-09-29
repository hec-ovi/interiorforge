import { distanceToSegment, type Point } from '../core/geom.js';
import type { BlueprintFloor, Facade as FacadeDefinition, RoomKind } from '../core/types.js';
import { commonTransit } from './architecture-access.js';
import { Facade } from './openings.js';
import type { PlanRoom } from './plan-types.js';
import { sharedRoomEdges } from './room-shape.js';
import { shellWallDepth } from './shell.js';
import { uvToWorld, worldToUv, type Frame } from './uv.js';

export interface PrivacyReturn {
  axis: 'H' | 'V';
  c: number;
  a: number;
  b: number;
  room: string;
  kind: RoomKind;
}

/** The construction envelope can stand metres behind Exterior's facade. Where a
 * public/private partition ends facing glass, close its outside bypass with an
 * elbow along the envelope, then out to a real opaque facade partition anchor.
 * Never extend an opaque wall straight into an arbitrary point of a glass pane. */
export function privacyReturns(rooms: readonly PlanRoom[], plate: readonly Point[], floor: BlueprintFloor,
  definition: FacadeDefinition | undefined, frame: Frame): PrivacyReturn[] {
  if (!definition?.grids?.length) return [];
  const facade = new Facade(floor, definition);
  const outline = floor.outline.map(point => worldToUv(point, frame));
  const segments: PrivacyReturn[] = [];
  const tips = new Set<string>();
  const privateRooms = rooms.filter(room => !!room.unit);
  for (const shared of rooms.filter(commonTransit)) for (const home of privateRooms) {
    for (const edge of sharedRoomEdges(home, shared)) for (const along of [edge.lo, edge.hi]) {
      const tip: Point = edge.edge.startsWith('v') ? [along, edge.c] : [edge.c, along];
      const key = tip.map(value => value.toFixed(6)).join(':');
      if (tips.has(key)) continue;
      const boundary = plate.findIndex((a, index) => distanceToSegment(tip, a, plate[(index + 1) % plate.length]!) < .015);
      if (boundary < 0) continue;
      const a = plate[boundary]!, b = plate[(boundary + 1) % plate.length]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const outward: Point = [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
      // Current fitted room envelopes are axial in their own rotated plan frame.
      if (Math.min(Math.abs(outward[0]), Math.abs(outward[1])) > 1e-5) continue;
      const hit = rayFacade(tip, outward, outline);
      if (!hit || hit.distance < .15 || !facade.crossedBy(uvToWorld(hit.point, frame), .11)) continue;
      const candidates: { point: Point; score: number }[] = [];
      for (const grid of definition.grids.filter(grid => grid.floor === floor.index)) {
        const start = outline[grid.edge]!, end = outline[(grid.edge + 1) % outline.length]!;
        const span = Math.hypot(end[0] - start[0], end[1] - start[1]);
        const normal: Point = [(end[1] - start[1]) / span, -(end[0] - start[0]) / span];
        if (normal[0] * outward[0] + normal[1] * outward[1] < .999) continue;
        for (const anchor of grid.partitionAnchors) {
          if (anchor.width < .24) continue;
          // A declared structural seat must also be actual opaque wall, not a
          // convenient pane subdivision or an exterior passage.
          if (floor.openings.some(opening => opening.edge === grid.edge
            && anchor.offset + .11 > opening.offset && anchor.offset - .11 < opening.offset + opening.width)) continue;
          const point: Point = [start[0] + (end[0] - start[0]) * anchor.offset / span,
            start[1] + (end[1] - start[1]) * anchor.offset / span];
          const delta: Point = [point[0] - tip[0], point[1] - tip[1]];
          const depth = delta[0] * outward[0] + delta[1] * outward[1];
          const shift = Math.abs(delta[0] * outward[1] - delta[1] * outward[0]);
          if (depth < .1 || depth > hit.distance + 1 || shift > 6) continue;
          candidates.push({ point, score: shift + Math.abs(depth - hit.distance) });
        }
      }
      candidates.sort((a, b) => a.score - b.score);
      const anchor = candidates[0]?.point;
      if (!anchor) continue;
      const bend: Point = Math.abs(outward[0]) > .5 ? [tip[0], anchor[1]] : [anchor[0], tip[1]];
      // The facade owns its complete published depth. Wall emission extends a
      // segment 2cm at the joint, so retain a further 5mm fit seam at that face.
      const inset = shellWallDepth(definition) + .025;
      const landing: Point = [anchor[0] - outward[0] * inset, anchor[1] - outward[1] * inset];
      add(tip, bend, shared);
      add(bend, landing, shared);
      tips.add(key);
    }
  }
  // Both ends of a corridor may select the same pier. Build overlapping returns
  // once, rather than introducing coincident black/ivory panel side faces.
  const merged: PrivacyReturn[] = [];
  for (const segment of segments.sort((a, b) => a.axis.localeCompare(b.axis) || a.c - b.c || a.a - b.a)) {
    const previous = merged.at(-1);
    if (previous && previous.axis === segment.axis && Math.abs(previous.c - segment.c) < 1e-6
      && previous.room === segment.room && segment.a <= previous.b + 1e-6) previous.b = Math.max(previous.b, segment.b);
    else merged.push({ ...segment });
  }
  return merged;

  function add(a: Point, b: Point, owner: PlanRoom): void {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < .01) return;
    const horizontal = Math.abs(b[1] - a[1]) < 1e-5;
    segments.push({ axis: horizontal ? 'H' : 'V', c: horizontal ? a[1] : a[0],
      a: Math.min(a[horizontal ? 0 : 1], b[horizontal ? 0 : 1]),
      b: Math.max(a[horizontal ? 0 : 1], b[horizontal ? 0 : 1]), room: owner.id, kind: owner.kind });
  }
}

function rayFacade(origin: Point, direction: Point, outline: Point[]): { point: Point; distance: number } | null {
  const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
  let best: { point: Point; distance: number } | null = null;
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index]!, b = outline[(index + 1) % outline.length]!;
    const edge: Point = [b[0] - a[0], b[1] - a[1]], delta: Point = [a[0] - origin[0], a[1] - origin[1]];
    const determinant = cross(direction, edge);
    if (Math.abs(determinant) < 1e-9) continue;
    const distance = cross(delta, edge) / determinant, t = cross(delta, direction) / determinant;
    if (distance <= 0 || t < -1e-6 || t > 1 + 1e-6 || best && distance >= best.distance) continue;
    best = { point: [origin[0] + direction[0] * distance, origin[1] + direction[1] * distance], distance };
  }
  return best;
}
