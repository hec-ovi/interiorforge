import { expect, it } from 'vitest';
import { PlacementBuilder } from '../src/placements/builder.js';
import { dressDamagedRooms } from '../src/styles/damaged/dressing.js';
import type { FloorInterior } from '../src/core/types.js';
import type { CorePlan } from '../src/layout/core-plan.js';
import { makeFrame } from '../src/layout/uv.js';

it.each([0, .67, Math.PI / 2, 2.41])('connects public equipment to an overhead supply at rotation %s', angle => {
  const b = new PlacementBuilder(), c = Math.cos(angle), s = Math.sin(angle);
  const point = (x: number, y: number, z: number): [number, number, number] => [4 + x * c + z * s, y, -3 + z * c - x * s];
  b.module('wall-field-damaged-public', 'hall', point(0, 0, -1.5), [12, 6, 1], angle);
  b.module('ceiling-field-damaged', 'hall', point(0, 3, 0), [12, 1, 6], angle);
  const floor = { rooms: [{ id: 'hall', kind: 'corridor' }], furniture: [] } as unknown as FloorInterior;
  dressDamagedRooms(b, floor);
  const branch = b.placements.find(p => p.module === 'ceiling-services-damaged-branch')!;
  const elbow = b.placements.find(p => p.module === 'ceiling-services-damaged-elbow')!;
  const feed = b.placements.find(p => p.module === 'wall-shelf-damaged-feed')!;
  expect(branch).toBeDefined(); expect(elbow).toBeDefined(); expect(feed).toBeDefined();
  const length = branch.scale[0] * .5, dx = Math.cos(branch.rotationY), dz = -Math.sin(branch.rotationY);
  // The branch ends exactly on the constant-radius elbow; the riser meets its
  // vertical outlet and the meter bank's modeled upper manifold.
  expect(Math.hypot(branch.position[0] + dx * length / 2 - elbow.position[0] + dx * .12,
    branch.position[2] + dz * length / 2 - elbow.position[2] + dz * .12)).toBeLessThan(1e-7);
  expect(feed.position[0]).toBeCloseTo(elbow.position[0], 7);
  expect(feed.position[2]).toBeCloseTo(elbow.position[2], 7);
  expect(feed.position[1]).toBeCloseTo(1.96, 7);
  expect(feed.position[1] + feed.scale[1] * .5).toBeCloseTo(elbow.position[1] - .30, 7);
  const rungs = b.placements.filter(p => p.module === 'ceiling-services-damaged-rung');
  expect(rungs.length).toBeGreaterThan(15);
  expect(rungs.every(p => p.scale.every(n => n === 1))).toBe(true);
  expect(b.placements.filter(p => p.module === 'ceiling-services-damaged-hanger').every(p => p.position[1] - .37 >= 2.3)).toBe(true);
});

it('never routes an equipment branch through a missing ceiling/core strip', () => {
  const b = new PlacementBuilder();
  b.module('wall-field-damaged-public', 'hall', [0, 0, -3], [12, 6, 1]);
  b.module('ceiling-field-damaged', 'hall', [0, 3, 1], [12, 1, 2]);
  dressDamagedRooms(b, { rooms: [{ id: 'hall', kind: 'corridor' }], furniture: [] } as unknown as FloorInterior);
  expect(b.placements.some(p => p.module === 'ceiling-services-damaged-branch')).toBe(false);
});

it.each([0, 37, 90])('keeps suspended services out of the full stair clearance at %s degrees', degrees => {
  const b = new PlacementBuilder(), angle = -degrees * Math.PI / 180;
  b.module('ceiling-field-damaged', 'hall', [0, 4.6, 0], [12, 1, 6], angle);
  const core = { frame: makeFrame(degrees), stairA: { u: -1, v: -.5, lu: 2, lv: 1 } } as unknown as CorePlan;
  dressDamagedRooms(b, { rooms: [{ id: 'hall', kind: 'corridor' }], furniture: [] } as unknown as FloorInterior,
    undefined, core);
  expect(b.placements.some(p => p.module?.startsWith('ceiling-services-damaged'))).toBe(false);
});

it('never treats an unlisted core wall as a private bedroom service wall', () => {
  const b = new PlacementBuilder();
  b.module('wall-field-damaged-lodging', 'stair-a', [0, 0, 0], [8, 9, 1]);
  dressDamagedRooms(b, { rooms: [], furniture: [] } as unknown as FloorInterior);
  expect(b.placements.some(p => p.module === 'wall-shelf-damaged-lodging-header')).toBe(false);
});
