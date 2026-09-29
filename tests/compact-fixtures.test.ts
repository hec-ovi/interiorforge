import { expect, it } from 'vitest';
import cases from './fixture-data/compact-failures.json' with { type: 'json' };
import { furnish } from '../src/layout/furnish.js';
import { createRng } from '../src/core/rng.js';
import { idGen } from '../src/layout/rooms.js';
import { fixtureAccessPaths, type CompactFixture } from '../src/layout/compact-fixtures.js';
import { overlaps } from '../src/layout/bathroom-recipe.js';
import type { PlanFurniture, PlanRoom } from '../src/layout/plan-types.js';
import type { FloorBounds } from '../src/layout/shell.js';
import type { Point } from '../src/core/geom.js';
import { roomCoversRect } from '../src/layout/room-shape.js';

function fixture(item: PlanFurniture): CompactFixture {
  const [lu, lv] = item.rotationDeg % 180 ? [item.size[1], item.size[0]] : item.size;
  const fp = { u: item.at[0] - lu! / 2, v: item.at[1] - lv! / 2, lu: lu!, lv: lv! };
  return { kind: item.kind as CompactFixture['kind'], footprint: fp, operation: fp, rotationDeg: item.rotationDeg };
}
it.each(cases.map((item, index) => [index, item] as const))('fits the complete recorded compact room %s without dropping any saved keepout', (index, entry) => {
  const room = entry.room as PlanRoom, bounds = entry.bounds as FloorBounds;
  const keepouts = [...entry.doorZones, ...entry.openingZones, ...entry.circulationZones];
  for (const seed of [0, 1, 7, 19]) {
    const all = furnish([room], 'apartment', createRng(seed), idGen(1), bounds,
      [...entry.openingZones, ...entry.circulationZones], 'poor', [], 'damaged');
    const needed = room.kind === 'bathroom' ? ['shower', 'toilet', 'sink'] : ['kitchen_block', 'fridge'];
    for (const kind of needed) expect(all.filter(item => item.kind === kind), `${index}/${seed}/${kind}`).toHaveLength(1);
    const fixtures = all.filter(item => needed.includes(item.kind)).map(fixture);
    for (const item of fixtures) for (const reserved of keepouts) expect(overlaps(item.footprint, reserved), `${index}/${seed} fixture hits keepout`).toBe(false);
    const paths = fixtureAccessPaths(room, fixtures)!;
    expect(paths, `${index}/${seed} body approach`).not.toBeNull();
    expect(paths.length).toBeGreaterThanOrEqual(needed.length + 1);
    for (const path of paths) for (const at of path) {
      const body = { u: at[0] - .34, v: at[1] - .34, lu: .68, lv: .68 };
      expect(roomCoversRect(room, body, .09)).toBe(true);
      expect(fixtures.every(item => !overlaps(body, item.footprint))).toBe(true);
    }
  }
});

it.each(['u0', 'u1', 'v0', 'v1'] as const)('fits capsule sanitary fixtures at full size in a 3m bath entered through %s', edge => {
  const rect = { u: 0, v: 0, lu: 3, lv: 3 };
  const position: Point = edge === 'u0' ? [0, 1.5] : edge === 'u1' ? [3, 1.5] : edge === 'v0' ? [1.5, 0] : [1.5, 3];
  const room: PlanRoom = { id: 'capsule-bath', kind: 'bathroom', rect, doors: [{ id: 'door', to: 'main', leaves: 1, width: .9, edge, at: 1.5, position }] };
  const inner: Point[] = [[0, 0], [3, 0], [3, 3], [0, 3]];
  const all = furnish([room], 'apartment', createRng(3), idGen(1), { inner, outline: [[-1, -1], [4, -1], [4, 4], [-1, 4]], facadeDepth: .6 }, [], 'mid', [], 'capsule');
  expect(all.map(item => item.kind).sort()).toEqual(['shower', 'sink', 'toilet']);
  expect(all.find(item => item.kind === 'shower')!.size).toEqual([1.3, 1.1, 2.2]);
  expect(fixtureAccessPaths(room, all.map(fixture))).not.toBeNull();
});
