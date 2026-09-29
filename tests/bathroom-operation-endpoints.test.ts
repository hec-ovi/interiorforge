import { expect, it } from 'vitest';
import snapshot from './kit-plans/rotated-mirror-bathroom.json' with { type: 'json' };
import { createRng } from '../src/core/rng.js';
import { BATHROOM_WALL_CLEARANCE, fitBathroomRecipe, overlaps } from '../src/layout/bathroom-recipe.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import { roomCoversRect } from '../src/layout/room-shape.js';

it('fits the full private vanity recipe beside real doorway and circulation reservations', () => {
  // f1-r28 from the 37-degree mirror-frame, enclosed-stairs seed. Keep all
  // 127 reservations: the toilet has only 3.5cm of legal along-wall travel.
  const room = snapshot.room as PlanRoom;
  const sizes = snapshot.sizes as Record<'sink' | 'shower' | 'toilet', [number, number, number]>;
  const inside = { rect: snapshot.usableRect, polygon: snapshot.inner as [number, number][] };
  const result = fitBathroomRecipe(room, sizes, createRng('bath-operation-endpoints'), footprint =>
    roomCoversRect(room, footprint, .05) && roomCoversRect(inside, footprint)
      && snapshot.blocked.every(keepout => !overlaps(footprint, keepout, .15)),
  operation => roomCoversRect(room, operation, BATHROOM_WALL_CLEARANCE) && roomCoversRect(inside, operation));

  expect(result?.map(item => item.kind).sort()).toEqual(['shower', 'sink', 'toilet']);
  for (const item of result!) {
    const canonical = sizes[item.kind], swapped = item.rotationDeg % 180 !== 0;
    expect(item.footprint.lu).toBe(canonical[swapped ? 1 : 0]);
    expect(item.footprint.lv).toBe(canonical[swapped ? 0 : 1]);
    expect(snapshot.blocked.some(keepout => overlaps(item.footprint, keepout, .15))).toBe(false);
    expect(roomCoversRect(room, item.operation, BATHROOM_WALL_CLEARANCE)).toBe(true);
    for (const other of result!) if (other !== item) {
      expect(overlaps(item.footprint, other.footprint, .15)).toBe(false);
      expect(overlaps(item.footprint, other.operation)).toBe(false);
    }
  }
});
