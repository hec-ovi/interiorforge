import { expect, it } from 'vitest';
import { polygonArea } from '../src/core/geom.js';
import { residentialProgram } from '../src/layout/residential-program.js';
import { idGen } from '../src/layout/rooms.js';
import { uvRectCorners } from '../src/layout/uv.js';
import { generate } from '../src/index.js';

it.each(['v0', 'v1'] as const)('packs a 75m² home from either corridor side (%s) with direct private-room access', side => {
  const rect = { u: 0, v: 0, lu: 7.5, lv: 10 };
  const rooms = residentialProgram(rect, side, uvRectCorners(rect), [0, 3.5, 7.5], 'mid', 'home', idGen(1))!;
  expect(rooms).not.toBeNull();
  expect(rooms.map(room => room.kind).sort()).toEqual(['bathroom', 'bedroom', 'kitchen', 'living', 'storage']);
  const main = rooms[0]!;
  expect(Math.abs(polygonArea(main.polygon!))).toBeGreaterThanOrEqual(22.5);
  expect(rooms.reduce((sum, room) => sum + Math.abs(polygonArea(room.polygon ?? uvRectCorners(room.rect))), 0)).toBeCloseTo(75);
  for (const room of rooms.slice(1)) {
    expect(room.doors).toHaveLength(1);
    expect(room.doors[0]!.to).toBe(main.id);
  }
  const bed = rooms.find(room => room.kind === 'bedroom')!;
  expect(bed.rect.lu * bed.rect.lv).toBeGreaterThanOrEqual(15.75);
  expect(side === 'v0' ? bed.rect.v + bed.rect.lv : bed.rect.v).toBe(side === 'v0' ? 10 : 0);
});

it('gives a 150m² luxury home two bedrooms, two bathrooms, storage and a generous living room', () => {
  const rect = { u: 0, v: 0, lu: 15, lv: 10 };
  const rooms = residentialProgram(rect, 'v0', uvRectCorners(rect), [0, 5.5, 10.5, 15], 'rich', 'home', idGen(1))!;
  expect(rooms.filter(room => room.kind === 'bedroom')).toHaveLength(2);
  expect(rooms.filter(room => room.kind === 'bathroom')).toHaveLength(2);
  expect(rooms.filter(room => room.kind === 'bathroom').map(room => [room.rect.lu, room.rect.lv]))
    .toEqual([[3.5, 3.5], [3, 3.5]]);
  expect(rooms.filter(room => room.kind === 'bedroom').map(room => [room.rect.lu, room.rect.lv]))
    .toEqual([[5.5, 5], [4.5, 4.5]]);
  expect(rooms.some(room => room.kind === 'storage')).toBe(true);
  expect(Math.abs(polygonArea(rooms[0]!.polygon!))).toBeGreaterThanOrEqual(36);
  expect(rooms.reduce((sum, room) => sum + Math.abs(polygonArea(room.polygon ?? uvRectCorners(room.rect))), 0)).toBeCloseTo(150);
});

it('does not place a bedroom partition through an unseated glazing bay', () => {
  const rect = { u: 0, v: 0, lu: 7.5, lv: 10 };
  expect(residentialProgram(rect, 'v0', uvRectCorners(rect), [0, 7.5], 'mid', 'home', idGen(1))).toBeNull();
});

it.each([[40, 'mid'], [60, 'rich']] as const)('generates distinct serviced dwellings on a dynamic %sm ×40m shell (%s)', async (width, tier) => {
  const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = await exterior.generate({ seed: 'residential-program', buildingId: 'home', theme: 'cyberpunk',
    parcel: { footprint: [[0, 0], [width, 0], [width, 40], [0, 40]], accessPoint: [0, 20], maxHeight: 20 },
    building: { type: 'residential', tier, floors: 3 }, options: { architecture: 'faceted-bays', glb: 'merged' } },
    { textures: { mode: 'keys' } });
  const built = await generate({ seed: blueprint.seed, building: { id: 'home', type: 'residential', tier }, blueprint, materialTheme: 'cyberpunk' });
  const floor = built.layouts.middle!.floor;
  const homes = [...new Set(floor.rooms.map(room => room.unit).filter(Boolean))];
  expect(homes.length).toBeGreaterThan(1);
  expect(floor.rooms.some(room => room.kind === 'bedroom')).toBe(true);
  expect(floor.rooms.some(room => room.kind === 'kitchen')).toBe(true);
  for (const unit of homes) {
    const rooms = floor.rooms.filter(room => room.unit === unit);
    expect(rooms.some(room => room.kind === 'bathroom')).toBe(true);
    if (tier === 'mid') for (const room of rooms) {
      const required = room.kind === 'bathroom' ? ['toilet', 'sink', 'shower']
        : room.kind === 'kitchen' || room.kind === 'studio_main' ? ['kitchen_block', 'fridge'] : [];
      for (const kind of required) expect(floor.furniture.filter(item => item.room === room.id && item.kind === kind),
        `${unit}/${room.id} requires ${kind}`).toHaveLength(1);
    }
    for (const room of rooms.filter(room => room.kind !== 'living' && room.kind !== 'studio_main')) {
      expect(room.doors.every(door => rooms.some(other => other.id === door.to)), JSON.stringify({ unit, room, rooms })).toBe(true);
    }
  }
}, 180_000);
