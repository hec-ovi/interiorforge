import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { Blueprint, BlueprintFloor } from '../src/core/types.js';
import type { Point } from '../src/core/geom.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import { privacyReturns } from '../src/layout/privacy-returns.js';
import { constructionPlate, facadeDepth } from '../src/layout/shell.js';
import { makeFrame, uvRectCorners } from '../src/layout/uv.js';

const blueprint: Blueprint = JSON.parse(readFileSync(new URL('./kit-plans/balcony-grid-review-05.blueprint.json', import.meta.url), 'utf8'));
const room = (id: string, unit: string | undefined, u: number, v: number, lu: number, lv: number): PlanRoom => ({
  id, kind: unit ? 'living' : 'corridor', ...(unit ? { unit } : {}), rect: { u, v, lu, lv },
  polygon: uvRectCorners({ u, v, lu, lv }), doors: [],
});
const rooms = [room('common', undefined, 85.5, 52, 32, 2.5),
  room('101', 'home-101', 85.5, 38, 15, 14), room('102', 'home-102', 100.5, 38, 17, 14),
  room('103', 'home-103', 85.5, 54.5, 17, 15.5), room('104', 'home-104', 102.5, 54.5, 15, 15.5)];

it('closes the confirmed public/private glass-facing tips through opaque pier-aligned elbows', () => {
  const floor = blueprint.floors[1]!, frame = makeFrame(0);
  const result = privacyReturns(rooms, constructionPlate(floor, frame, facadeDepth(blueprint.facade)), floor, blueprint.facade, frame);
  expect(result).toHaveLength(4);
  const caps = result.filter(part => part.axis === 'V');
  expect(caps.map(part => [part.c, part.a, part.b])).toEqual([[85.5, 52, 55], [117.5, 52, 55]]);
  const returns = result.filter(part => part.axis === 'H');
  expect(returns.every(part => part.c === 55)).toBe(true);
  // No opaque panel crosses the long glass span at z52. The return reaches the
  // actual one-metre opaque pier at z55, keeping the published shell depth clear.
  expect(returns.some(part => part.c === 52)).toBe(false);
  expect(returns[0]!.a - .02).toBeGreaterThanOrEqual(83 + blueprint.facade!.wallDepth!);
  expect(returns[1]!.b + .02).toBeLessThanOrEqual(120 - blueprint.facade!.wallDepth!);
});

it('keeps the same authoritative facade anchors for a rotated building frame', () => {
  const source = blueprint.floors[1]!, angle = 37 * Math.PI / 180;
  const rotate = ([x, z]: Point): Point => [x * Math.cos(angle) - z * Math.sin(angle), x * Math.sin(angle) + z * Math.cos(angle)];
  const floor: BlueprintFloor = { ...source, outline: source.outline.map(rotate),
    roomEnvelope: { ...source.roomEnvelope!, corners: source.roomEnvelope!.corners.map(rotate) } };
  const frame = makeFrame(37), plain = makeFrame(0);
  const original = privacyReturns(rooms, constructionPlate(source, plain, facadeDepth(blueprint.facade)), source, blueprint.facade, plain);
  const turned = privacyReturns(rooms, constructionPlate(floor, frame, facadeDepth(blueprint.facade)), floor, blueprint.facade, frame);
  expect(turned).toHaveLength(original.length);
  turned.forEach((part, index) => {
    expect(part.axis).toBe(original[index]!.axis);
    for (const key of ['a', 'b', 'c'] as const) expect(part[key]).toBeCloseTo(original[index]![key], 6);
  });
});
