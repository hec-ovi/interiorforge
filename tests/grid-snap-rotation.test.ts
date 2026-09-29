import { expect, it } from 'vitest';
import type { Blueprint, InteriorRequest } from '../src/core/types.js';
import { planCore } from '../src/layout/core-plan.js';
import { makeFrame, snap, uvToWorld, worldToUv } from '../src/layout/uv.js';

it('keeps half-grid ties stable through machine round-off, including negative coordinates', () => {
  for (const value of [21.25, -.25, -21.25, 500.25]) {
    const expected = Math.round(value / .5) * .5;
    for (const error of [-1e-12, 0, 1e-12]) expect(snap(value + error)).toBe(expected);
    expect(snap(value - 1e-4)).toBe(Math.round((value - 1e-4) / .5) * .5);
    expect(snap(value + 1e-4)).toBe(Math.round((value + 1e-4) / .5) * .5);
  }
});

it('keeps actual exterior roof, interior core and floor plates equivalent at 0/37 degrees and negative grid coordinates', async () => {
  const { generate: exterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  let baseline: { face: number; roof: number[]; stair: number[]; plates: unknown } | undefined;
  for (const [angle, offsetU, offsetV] of [[0, 0, 0], [37, 0, 0], [0, -20, -10], [37, -20, -10]]) {
    const frame = makeFrame(angle!);
    const world = ([u, v]: number[]) => uvToWorld([u! + offsetU!, v! + offsetV!], frame);
    const { blueprint }: { blueprint: Blueprint } = await exterior({ seed: 'enclosed-stairs', buildingId: 'enclosed-stairs', theme: 'cyberpunk',
      parcel: { footprint: [[0, 0], [40, 0], [40, 40], [0, 40]].map(world), accessPoint: world([20, 0]), maxHeight: 29 },
      building: { type: 'residential', tier: 'high_rich', floors: 6 }, options: { architecture: 'mirror-frame' } }, { textures: { mode: 'keys' } });
    const request: InteriorRequest = { seed: 'enclosed-stairs', building: { id: blueprint.buildingId, type: 'residential', tier: 'high_rich' }, blueprint, materialTheme: 'cyberpunk' };
    const core = planCore(request, []), roof = worldToUv(blueprint.roof!.bulkhead!.center, core.frame);
    const canonical = ([x, z]: [number, number]) => {
      const [u, v] = worldToUv([x, z], core.frame);
      return [Number((u - offsetU!).toFixed(7)), Number((v - offsetV!).toFixed(7))];
    };
    const ring = (points: [number, number][]) => {
      const vertices = points.map(canonical);
      const first = vertices.reduce((best, point, index) => point[0]! < vertices[best]![0]!
        || point[0] === vertices[best]![0] && point[1]! < vertices[best]![1]! ? index : best, 0);
      return [...vertices.slice(first), ...vertices.slice(0, first)];
    };
    const value = { face: core.vFace - offsetV!, roof: [roof[0] - offsetU!, roof[1] - offsetV!],
      stair: [core.stairA.u - offsetU!, core.stairA.v - offsetV!, core.stairA.lu, core.stairA.lv],
      plates: blueprint.floors.map(floor => ({ index: floor.index, height: floor.height,
        outline: ring(floor.outline), envelope: floor.roomEnvelope && ring(floor.roomEnvelope.corners) })) };
    if (!baseline) baseline = value;
    expect(value.face).toBeCloseTo(baseline.face, 8);
    value.roof.forEach((n, i) => expect(n).toBeCloseTo(baseline!.roof[i]!, 8));
    value.stair.forEach((n, i) => expect(n).toBeCloseTo(baseline!.stair[i]!, 8));
    expect(value.plates).toEqual(baseline.plates);
  }
}, 180_000);
