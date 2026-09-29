import { expect, it } from 'vitest';
import type { FloorInterior } from '../src/core/types.js';
import type { BuildingPlan } from '../src/layout/index.js';
import { fitLevelZones } from '../src/layout/level-fit.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import { makeFrame, uvRectCorners } from '../src/layout/uv.js';

/** A lounge room pulled back off the core after its template laid a pit against it. */
function planWith(zone: { u: number; v: number; lu: number; lv: number }): { plan: BuildingPlan; room: PlanRoom; floor: FloorInterior } {
  const rect = { u: 0, v: 0.6, lu: 8, lv: 6 };
  const room: PlanRoom = { id: 'lounge', kind: 'living', unit: 'home', rect, polygon: uvRectCorners(rect), doors: [],
    levels: [{ polygon: uvRectCorners(zone), delta: -.3, edge: 'step' }] };
  const floor = { floor: 1, rooms: [{ id: 'lounge', kind: 'living', unit: 'home', polygon: uvRectCorners(rect), doors: [],
    levels: [{ polygon: uvRectCorners(zone), delta: -.3, edge: 'step' }] }] } as unknown as FloorInterior;
  const plan = { floors: [floor], core: { frame: makeFrame(0) }, uvFloors: new Map([[1, { rooms: [room] }]]) } as unknown as BuildingPlan;
  return { plan, room, floor };
}

it('cuts a pit that runs out through its room wall back to the room, and publishes it cut', () => {
  const { plan, room, floor } = planWith({ u: 2, v: 0, lu: 4.5, lv: 4 });
  fitLevelZones(plan);
  expect(room.levels).toHaveLength(1);
  expect(room.levels![0]!.polygon).toEqual(uvRectCorners({ u: 2, v: .6, lu: 4.5, lv: 3.4 }));
  const published = floor.rooms[0]!.levels![0]!;
  expect(Math.min(...published.polygon.map(point => point[1]))).toBeCloseTo(.6, 6);
});

it('keeps a zone inside its room as it is, and drops one its room no longer holds', () => {
  const inside = planWith({ u: 2, v: 1, lu: 4, lv: 3 });
  const zone = inside.room.levels![0];
  fitLevelZones(inside.plan);
  expect(inside.room.levels![0]).toBe(zone);
  const outside = planWith({ u: 2, v: -3, lu: 4, lv: 4 });
  fitLevelZones(outside.plan);
  expect(outside.room.levels).toEqual([]);
  expect(outside.floor.rooms[0]!.levels).toBeUndefined();
});
