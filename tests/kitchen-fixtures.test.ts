import { expect, it } from 'vitest';
import recorded from './fixture-data/duplex-kitchen-40.json' with { type: 'json' };
import { createRng } from '../src/core/rng.js';
import { pointInPolygon } from '../src/core/geom.js';
import { fitKitchenFixtures, kitchenOperation } from '../src/layout/kitchen-fixtures.js';
import { fixtureAccessPaths, type CompactFixture } from '../src/layout/compact-fixtures.js';
import { roomCoversRect } from '../src/layout/room-shape.js';
import { overlaps } from '../src/layout/bathroom-recipe.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import type { UvRect } from '../src/layout/uv.js';

const room = recorded.room as PlanRoom;
const sizes = { kitchen_block: [2.4, .75, 1.17], fridge: [.7, .7, 1.8] } as const;
const covers = (fp: UvRect) => roomCoversRect(room, fp, .05)
  && [[fp.u, fp.v], [fp.u + fp.lu, fp.v], [fp.u + fp.lu, fp.v + fp.lv], [fp.u, fp.v + fp.lv]]
    .every(p => pointInPolygon(p as [number, number], recorded.bounds.inner as [number, number][]));

it('records the actual translated duplex failure: separately fitting appliances trap the fridge approach', () => {
  const fixtures = recorded.appliances.map(piece => {
    const kind = piece.kind as 'kitchen_block' | 'fridge', rotationDeg = piece.rotationDeg as CompactFixture['rotationDeg'];
    const [lu, lv] = rotationDeg % 180 ? [piece.size[1]!, piece.size[0]!] : [piece.size[0]!, piece.size[1]!];
    const footprint = { u: piece.at[0]! - lu / 2, v: piece.at[1]! - lv / 2, lu, lv };
    return { kind, rotationDeg, footprint, operation: kitchenOperation(footprint, kind, rotationDeg) };
  });
  expect(fixtures.every(f => covers(f.footprint) && covers(f.operation))).toBe(true);
  expect(fixtureAccessPaths(room, fixtures)).toBeNull();
});

it.each([0, 7, 19])('atomically fits both full-size appliances and all recorded reservations for seed %s', seed => {
  const before = JSON.stringify(recorded);
  const group = fitKitchenFixtures(room, sizes, createRng(seed),
    fp => covers(fp) && recorded.blocked.every(reservation => !overlaps(fp, reservation, .15)), covers)!;
  expect(group).not.toBeNull();
  expect(group.fixtures.map(f => f.kind).sort()).toEqual(['fridge', 'kitchen_block']);
  expect(group.paths.length).toBeGreaterThanOrEqual(4);
  for (const fixture of group.fixtures) {
    const [width, depth] = sizes[fixture.kind as keyof typeof sizes];
    expect([fixture.footprint.lu, fixture.footprint.lv]).toEqual(fixture.rotationDeg % 180 ? [depth, width] : [width, depth]);
    const front = fixture.kind === 'kitchen_block' ? .9 : .8;
    expect(fixture.rotationDeg % 180 ? fixture.operation.lu - fixture.footprint.lu
      : fixture.operation.lv - fixture.footprint.lv).toBeCloseTo(front, 10);
    expect(covers(fixture.operation)).toBe(true);
    for (const reservation of recorded.blocked) expect(overlaps(fixture.footprint, reservation, .15)).toBe(false);
    for (const other of group.fixtures.filter(f => f !== fixture)) expect(overlaps(fixture.operation, other.footprint)).toBe(false);
  }
  for (const path of group.paths) for (const [u, v] of path) {
    const body = { u: u - .34, v: v - .34, lu: .68, lv: .68 };
    expect(roomCoversRect(room, body, .09)).toBe(true);
    expect(group.fixtures.every(f => !overlaps(body, f.footprint))).toBe(true);
  }
  expect(JSON.stringify(recorded)).toBe(before);
});

it('rejects an impossible complete pair instead of dropping or shrinking an appliance', () => {
  expect(fitKitchenFixtures(room, sizes, createRng(1), () => false, covers)).toBeNull();
});
