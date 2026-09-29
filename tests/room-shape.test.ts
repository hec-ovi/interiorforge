import { expect, it } from 'vitest';
import { clipPolygonToRect, pointInRect, polygonArea, rectCorners } from '../src/core/geom.js';
import { roomContains, roomCoversRect, roomPolygon, type RoomShape } from '../src/layout/room-shape.js';
import { uvRectCorners, type UvRect } from '../src/layout/uv.js';

function clippedCoverage(room: RoomShape, rect: UvRect, margin: number): boolean {
  const grown = { x: rect.u - margin, z: rect.v - margin, w: rect.lu + 2 * margin, d: rect.lv + 2 * margin };
  const clipped = clipPolygonToRect(roomPolygon(room), grown), wanted = grown.w * grown.d;
  return clipped.length >= 3 && Math.abs(polygonArea(clipped)) >= wanted - Math.max(1e-8, wanted * 1e-8)
    && rectCorners(grown).every(point => roomContains(room, point))
    && (room.holes ?? []).every(hole => !hole.some(point => pointInRect(point, grown, 1e-8))
      && Math.abs(polygonArea(clipPolygonToRect(hole, grown))) < 1e-8);
}

it('keeps exact rectangle coverage and boundary tolerance while accelerating strictly contained fixtures', () => {
  for (const phase of [0, 85.5, -19.054109]) {
    const rect = { u: phase, v: phase + 2, lu: 3.5, lv: 4 }, polygon = uvRectCorners(rect);
    for (const ring of [polygon, [...polygon.slice(2), ...polygon.slice(0, 2)]]) {
      const room = { rect, polygon: ring };
      for (const margin of [0, .05, .08]) for (const offset of [-2e-8, -5e-9, 0, 1e-12, .2, 2.5]) {
        const fixture = { u: rect.u + offset + margin, v: rect.v + .2, lu: 1, lv: 1.5 };
        expect(roomCoversRect(room, fixture, margin)).toBe(clippedCoverage(room, fixture, margin));
      }
    }
  }
});

it('still rejects concave notches and enclosed holes even when rectangle corners fit', () => {
  const notch: RoomShape = { rect: { u: 0, v: 0, lu: 6, lv: 6 },
    polygon: [[0, 0], [6, 0], [6, 6], [4, 6], [4, 2], [2, 2], [2, 6], [0, 6]] };
  expect(roomCoversRect(notch, { u: 1, v: 1, lu: 4, lv: 4 })).toBe(false);
  const hole: RoomShape = { rect: notch.rect, polygon: uvRectCorners(notch.rect),
    holes: [[[2, 2], [2, 4], [4, 4], [4, 2]]] };
  expect(roomCoversRect(hole, { u: 1, v: 1, lu: 4, lv: 4 })).toBe(false);
});
