import { polygonBounds, type Point } from '../core/geom.js';
import { RigidFrame2D } from '../core/rigid-frame.js';
import type { FloorDuplex } from '../core/duplex.js';
import type { FloorInterior } from '../core/types.js';
import type { RoomSegment } from '../geometry/walls.js';
import type { PlanRoom } from '../layout/plan-types.js';
import { makeFrame, worldToUv, type Frame, type UvRect } from '../layout/uv.js';
import { planDuplexSection } from '../layout/duplex/section.js';
import { subtractRect } from './thresholds.js';
import type { PlacementBuilder } from './builder.js';
import { LOFT1702_FINISH } from '../styles/luxury/loft-finish.js';

/** Exact openings in the building's construction axes; upper floors must never
 * repair these intentional voids as uncovered residual slabs. */
export function duplexVoids(floor: FloorInterior, frame: Frame, level: 'lower' | 'upper'): UvRect[] {
  return (floor.duplexes ?? []).filter(slice => slice.level === level).flatMap(slice =>
    [...slice.loungeVoids, slice.stairOpening].map(ring => {
      const b = polygonBounds(ring.map(point => worldToUv(point, frame)));
      return { u: b.x, v: b.z, lu: b.w, lv: b.d };
    }));
}

export function duplexCeilingRects(floor: FloorInterior, frame: Frame, rect: UvRect): UvRect[] {
  let parts = [rect];
  for (const hole of duplexVoids(floor, frame, 'lower')) parts = parts.flatMap(part => subtractRect(part, hole));
  return parts;
}

/** Only a private void boundary becomes an open guarded edge. Closed partitions
 * on the rest of the same line retain their full depth and height. */
export function duplexWallSegments(floor: FloorInterior, frame: Frame, segment: RoomSegment, unit?: string): RoomSegment[] {
  let parts = [segment];
  const owned = { ...floor, duplexes: (floor.duplexes ?? []).filter(slice => slice.unit === unit) };
  for (const hole of duplexVoids(owned, frame, 'upper')) {
    const horizontal = segment.axis === 'H';
    const lowCross = horizontal ? hole.v : hole.u, highCross = lowCross + (horizontal ? hole.lv : hole.lu);
    if (Math.min(Math.abs(segment.c - lowCross), Math.abs(segment.c - highCross)) > 1e-6) continue;
    const low = horizontal ? hole.u : hole.v, high = low + (horizontal ? hole.lu : hole.lv);
    parts = parts.flatMap(part => high <= part.a + 1e-6 || low >= part.b - 1e-6 ? [part]
      : [{ ...part, b: Math.min(part.b, low) }, { ...part, a: Math.max(part.a, high) }].filter(part => part.b - part.a > 1e-6));
  }
  return parts;
}

/** Occupied air owns its private outer enclosure, even where there is no upper
 * floor to create an ordinary room face. Internal edges remain a guarded void. */
export function duplexAirOwners(floor: FloorInterior, frame: Frame): (PlanRoom & { air: number; perimeter: UvRect })[] {
  return (floor.duplexes ?? []).filter(slice => slice.level === 'upper').flatMap(slice => {
    const p = polygonBounds(slice.footprint.map(point => worldToUv(point, frame)));
    const perimeter = { u: p.x, v: p.z, lu: p.w, lv: p.d };
    return [...slice.loungeVoids, slice.stairOpening].map((ring, index) => {
      const polygon = ring.map(point => worldToUv(point, frame)), b = polygonBounds(polygon);
      return { id: `${slice.id}-air-${index}`, kind: 'living' as const, unit: slice.unit, polygon,
        rect: { u: b.x, v: b.z, lu: b.w, lv: b.d }, doors: [], air: slice.lowerCeilingGap ?? .2, perimeter };
    });
  });
}

export function duplexPerimeterSegment(segment: RoomSegment, perimeter: UvRect): boolean {
  const low = segment.axis === 'H' ? perimeter.v : perimeter.u;
  const high = low + (segment.axis === 'H' ? perimeter.lv : perimeter.lu);
  return Math.min(Math.abs(segment.c - low), Math.abs(segment.c - high)) < 1e-6;
}

/** Gallery trim uses the same exposed boundary as the real guard, in the
 * building's UV axes. Stair-opening edges are excluded, preserving headroom. */
export function duplexGalleryEdges(slice: FloorDuplex, frame: Frame): { a: Point; b: Point; inward: Point }[] {
  if (slice.level !== 'upper') return [];
  const section = planDuplexSection({ width: slice.width, depth: slice.depth, pitch: slice.pitch,
    loungeVoidArea: slice.area.loungeVoid, stairOpeningDepth: slice.stairOpeningDepth, ...(slice.stairWall ? { stairWall: slice.stairWall } : {}) });
  const privateFrame = new RigidFrame2D(slice.frame.angleDeg, slice.frame.origin);
  const delta = makeFrame(slice.frame.angleDeg - frame.angleDeg);
  return exposedEdges([...section.loungeVoids, section.stairOpening], section.width, section.depth).filter(edge => {
    const p: Point = [(edge.a[0] + edge.b[0]) / 2, (edge.a[1] + edge.b[1]) / 2];
    return section.loungeVoids.some(rect => p[0] >= rect.u - 1e-6 && p[0] <= rect.u + rect.lu + 1e-6
      && p[1] >= rect.v - 1e-6 && p[1] <= rect.v + rect.lv + 1e-6
      && Math.min(Math.abs(p[0] - rect.u), Math.abs(p[0] - rect.u - rect.lu), Math.abs(p[1] - rect.v), Math.abs(p[1] - rect.v - rect.lv)) < 1e-6);
  }).map(edge => ({ a: worldToUv(privateFrame.toWorld(edge.a), frame), b: worldToUv(privateFrame.toWorld(edge.b), frame),
    inward: [edge.normal[0] * delta.cos - edge.normal[1] * delta.sin, edge.normal[0] * delta.sin + edge.normal[1] * delta.cos] }));
}

/** Private treads, turn landing, stringer/glass sides and upper guards use only
 * existing module contracts. Each actual tread has its own exact cuboid; no
 * whole-stair bounding box seals the passage and no Engine exception is needed. */
export function placeDuplexStructure(builder: PlacementBuilder, slice: FloorDuplex, room: string): void {
  const section = planDuplexSection({ width: slice.width, depth: slice.depth, pitch: slice.pitch,
    loungeVoidArea: slice.area.loungeVoid, stairOpeningDepth: slice.stairOpeningDepth, ...(slice.stairWall ? { stairWall: slice.stairWall } : {}) });
  const frame = new RigidFrame2D(slice.frame.angleDeg, slice.frame.origin);
  const rotation = -slice.frame.angleDeg * Math.PI / 180;
  const module = (id: string, at: [number, number, number], scale: [number, number, number], yaw = rotation) => {
    const point = frame.toWorld([at[0], at[2]]);
    const part = builder.module(id, room, [point[0], at[1], point[1]], scale, yaw,
      { id: `${slice.id}-${slice.level}-part-${builder.placements.length}` });
    part.connector = slice.id;
  };
  if (slice.level === 'lower') {
    const landing = section.stair.turnLanding;
    module(LOFT1702_FINISH.stair, [landing.u + landing.lu / 2, section.pitch / 2, landing.v + landing.lv / 2], [landing.lu / .5, 1, landing.lv / .5]);
    for (const step of section.stair.steps) module(LOFT1702_FINISH.stair,
      [step.u + step.lu / 2, step.top, step.v + step.lv / 2], [step.lu / .5, 1, step.lv / .5]);
    const n = section.stair.risersPerFlight - 1;
    for (const flight of [0, 1] as const) {
      const start: Point = [section.stairOpening.u + (flight ? 2.975 : .025),
        section.stairOpening.v + (flight ? n * section.stair.tread : 0)];
      const yaw = rotation + (flight ? Math.PI : 0);
      for (const side of [0, 1.375]) for (let i = 0; i < n; i++) {
        const at: [number, number, number] = [start[0] + (flight ? -side : side),
          (flight ? section.pitch / 2 : 0) + i * section.stair.rise,
          start[1] + (flight ? -1 : 1) * i * section.stair.tread];
        const scale: [number, number, number] = [1, section.stair.rise / .17, section.stair.tread / .28];
        module(`stair-side-luxury-piece-${i}${i === n - 1 ? '-end' : ''}`, at, scale, yaw);
        module('stair-rail-piece', at, scale, yaw);
      }
    }
    // The intermediate landing has three exposed sides of its own; the flight
    // glass ends at the first edge of this slab and cannot guard its far edge.
    for (const x of [landing.u + .035, landing.u + landing.lu - .035])
      module('stair-landing-guard-luxury', [x, section.pitch / 2, landing.v + landing.lv / 2],
        [landing.lv / 1.4, 1, 1], rotation - Math.PI / 2);
    module('stair-landing-guard-luxury', [landing.u + landing.lu / 2, section.pitch / 2, landing.v + landing.lv - .035],
      [landing.lu / 1.4, 1, 1]);
  } else {
    const holes = [...section.loungeVoids, section.stairOpening];
    for (const edge of exposedEdges(holes, section.width, section.depth)) {
      const stair = section.stairOpening;
      let a = edge.a, b = edge.b;
      if (Math.abs(a[1] - stair.v) < 1e-6 && Math.abs(b[1] - stair.v) < 1e-6
        && Math.min(a[0], b[0]) >= stair.u - 1e-6 && Math.max(a[0], b[0]) <= stair.u + stair.lu + 1e-6) {
        // Keep the descending right-hand lane open at its real upper arrival.
        const low = Math.min(a[0], b[0]), high = Math.min(Math.max(a[0], b[0]), stair.u + 1.5);
        if (high - low < .05) continue;
        a = [low, stair.v]; b = [high, stair.v];
      }
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const point: Point = [(a[0] + b[0]) / 2 + edge.normal[0] * .035, (a[1] + b[1]) / 2 + edge.normal[1] * .035];
      module('stair-landing-guard-luxury', [point[0], 0, point[1]], [length / 1.4, 1, 1],
        -Math.atan2(b[1] - a[1], b[0] - a[0]) + rotation);
    }
  }
}

/** Edges between the union of voids and genuinely occupied upper floor. Touching
 * holes have no floating guard between them; an outer facade has no guard over air. */
function exposedEdges(rects: UvRect[], width: number, depth: number): { a: Point; b: Point; normal: Point }[] {
  const inside = (point: Point, rect: UvRect) => point[0] > rect.u && point[0] < rect.u + rect.lu && point[1] > rect.v && point[1] < rect.v + rect.lv;
  const result: { a: Point; b: Point; normal: Point }[] = [];
  for (const rect of rects) for (const edge of [
    { axis: 0, cross: rect.v, low: rect.u, high: rect.u + rect.lu, normal: [0, -1] },
    { axis: 0, cross: rect.v + rect.lv, low: rect.u, high: rect.u + rect.lu, normal: [0, 1] },
    { axis: 1, cross: rect.u, low: rect.v, high: rect.v + rect.lv, normal: [-1, 0] },
    { axis: 1, cross: rect.u + rect.lu, low: rect.v, high: rect.v + rect.lv, normal: [1, 0] },
  ]) {
    const stations = [...new Set([edge.low, edge.high, ...rects.flatMap(other => edge.axis === 0 ? [other.u, other.u + other.lu] : [other.v, other.v + other.lv])
      .filter(value => value > edge.low && value < edge.high)])].sort((a, b) => a - b);
    const at = (along: number): Point => edge.axis === 0 ? [along, edge.cross] : [edge.cross, along];
    for (let i = 0; i + 1 < stations.length; i++) {
      const a = at(stations[i]!), b = at(stations[i + 1]!), mid = at((stations[i]! + stations[i + 1]!) / 2);
      const outside: Point = [mid[0] + edge.normal[0]! * 1e-4, mid[1] + edge.normal[1]! * 1e-4];
      if (outside[0] <= 0 || outside[0] >= width || outside[1] <= 0 || outside[1] >= depth || rects.some(other => inside(outside, other))) continue;
      result.push({ a, b, normal: edge.normal as Point });
    }
  }
  return result;
}
