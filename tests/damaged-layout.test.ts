import { expect, it } from 'vitest';
import { absorbDamagedSlivers, damagedStandardProgram, fitDamagedEntrances } from '../src/styles/damaged/layout.js';
import { makeFrame, uvRectCorners } from '../src/layout/uv.js';
import { idGen } from '../src/layout/rooms.js';
import { roomArea, sharedRoomEdges } from '../src/layout/room-shape.js';
import { RoomRegion } from '../src/layout/room-region.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import { polygonBounds } from '../src/core/geom.js';

it('fills only the actual narrow gap beside a shaft, preserving the setback facade pier', () => {
  const home = { u: 17.725, v: 28.5, lu: 7.055, lv: 10 };
  const stair = { u: 24.9, v: 21.5, lu: 4.5, lv: 8 };
  const rects = absorbDamagedSlivers([home, stair]);
  expect(rects[0]).toEqual(home);
  expect(rects[1]).toEqual(stair);
  expect(rects).toHaveLength(3);
  expect(rects[2]!.u).toBeCloseTo(24.78, 8);
  expect(rects[2]!.lu).toBeCloseTo(.12, 8);
  expect(rects[2]!.v).toBe(28.5);
  expect(rects[2]!.lv).toBe(1);
  expect(rects[0]!.u + rects[0]!.lu).toBeCloseTo(24.78, 8);
});

it('rejects an entrance whose long boundary has no complete public cassette approach', () => {
  const envelope = { u: 29.5, v: 17.256, lu: 9.244, lv: 9.244 };
  const shared = new RoomRegion(uvRectCorners({ u: 20, v: 17, lu: 20, lv: 15 }))
    .subtract([envelope, { u: 24.9, v: 23, lu: 4.5, lv: 8 }])[0]!;
  const common: PlanRoom = { ...shared, id: 'hall', kind: 'corridor', doors: [] };
  const living: PlanRoom = { id: 'living', kind: 'living', unit: 'home',
    rect: { u: 29.5, v: 17.256, lu: 4.5, lv: 9.244 },
    polygon: [[31,26.5],[29.5,26.5],[29.5,20.256],[32.5,20.256],[32.5,17.256],[34,17.256],[34,23],[31,23]],
    doors: [{ id: 'entry', to: 'hall', edge: 'u0', at: 23.5, position: [29.5, 23.5], width: 1.2, leaves: 1 }] };
  expect(fitDamagedEntrances([common, living])).toBe(false);
  // The caller chooses another complete envelope; it never shrinks the opening.
  expect(living.doors[0]!.width).toBe(1.2);
});

it.each([0, 1, 2, 3])('preserves private door ownership and clear room areas on facade quarter %s', quarter => {
  const rooms = damagedStandardProgram({ u: 5.89, v: 1.5, lu: 7.285, lv: 10 }, [],
    makeFrame(17 + quarter * 90), makeFrame(17), idGen(3))!;
  expect(rooms.map(room => room.kind).sort()).toEqual(['bathroom', 'bedroom', 'kitchen', 'living']);
  expect(rooms.reduce((sum, room) => sum + roomArea(room), 0)).toBeCloseTo(72.85, 5);
  expect(roomArea(rooms.find(room => room.kind === 'bedroom')!)).toBeGreaterThan(20);
  for (const room of rooms) for (const door of room.doors) {
    const target = rooms.find(other => other.id === door.to)!;
    const edges = sharedRoomEdges(room, target);
    expect(edges.some(edge => edge.edge === door.edge
      && Math.abs(edge.c - door.position![edge.edge.startsWith('v') ? 1 : 0]) < 1e-6
      && door.at - door.width / 2 >= edge.lo && door.at + door.width / 2 <= edge.hi)).toBe(true);
  }
});

it('shares the exact canonical envelope with the public packing footprint', () => {
  const rect = { u: 5.3333334, v: 1.5, lu: 7.6666664, lv: 10 };
  const rooms = damagedStandardProgram(rect, [], makeFrame(0), makeFrame(0), idGen(4))!;
  const bounds = polygonBounds(rooms.flatMap(room => room.polygon!));
  const expectedEnd = Math.round(rect.u * 1e6) / 1e6 + Math.round(rect.lu * 1e6) / 1e6;
  expect(bounds.x + bounds.w).toBeCloseTo(expectedEnd, 10);
});
