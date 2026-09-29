import { describe, expect, it } from 'vitest';
import type { Point } from '../src/core/geom.js';
import { ROOM_FOOTPRINT_EPS, type RoomFootprint } from '../src/core/room-footprint.js';
import { segmentCoveredByFootprints } from '../src/core/segment-coverage.js';

const rectangle = (low: number, high: number): RoomFootprint => ({ polygon: [[low, 29], [high, 29], [high, 38], [low, 38]] });

describe('shared room-boundary coverage precision', () => {
  it('crosses the published H10-60 clipped boundary in both directions and footprint orders', () => {
    const a: Point = [55.125, 33.375], b: Point = [55.375, 33.375];
    const footprints = [rectangle(46.7, 55.199999999999996), rectangle(55.2, 56.5)];
    for (const rooms of [footprints, [...footprints].reverse()]) {
      expect(segmentCoveredByFootprints(a, b, rooms)).toBe(true);
      expect(segmentCoveredByFootprints(b, a, rooms)).toBe(true);
    }
  });

  it('continues to reject a real gap beyond the existing footprint tolerance', () => {
    for (const gap of [4 * ROOM_FOOTPRINT_EPS, 1e-5, .001, .1]) {
      const footprints = [rectangle(46.7, 55.2 - gap / 2), rectangle(55.2 + gap / 2, 56.5)];
      expect(segmentCoveredByFootprints([55.125, 33.375], [55.375, 33.375], footprints), `gap ${gap}`).toBe(false);
      expect(segmentCoveredByFootprints([55.375, 33.375], [55.125, 33.375], footprints), `reverse gap ${gap}`).toBe(false);
    }
  });

  it('does not erase a narrow unoccupied hole while coalescing equivalent boundary events', () => {
    const room: RoomFootprint = { ...rectangle(46.7, 56.5), holes: [
      [[55.2, 32], [55.2, 35], [55.20001, 35], [55.20001, 32]],
    ] };
    expect(segmentCoveredByFootprints([55.125, 33.375], [55.375, 33.375], [room])).toBe(false);
  });
});
