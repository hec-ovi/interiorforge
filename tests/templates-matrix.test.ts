import { describe, expect, it } from 'vitest';
import { generate, type Blueprint, type InteriorRequest } from '../src/index.js';

/** Kinds × lots × rotations × floors: templates may scale, drop or refuse, never fail a
 *  building. The default run is a smoke subset; URBE_TEMPLATE_MATRIX=full runs every lot
 *  (16–56 m), rotation (0/37/90) and floor count (3/6/12), several minutes per kind. */
type P = [number, number];
const rotate = (deg: number) => {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  return ([x, z]: P): P => [x * c - z * s, x * s + z * c];
};

/** Rigid rotation of every world coordinate a blueprint carries (openings and facade grids
 *  are edge-relative and need nothing). */
export function rotateBlueprint(blueprint: Blueprint, deg: number): Blueprint {
  if (!deg) return blueprint;
  const f = rotate(deg), copy = structuredClone(blueprint) as Blueprint & Record<string, any>;
  for (const floor of copy.floors) {
    floor.outline = floor.outline.map(f);
    if (floor.roomEnvelope?.corners) floor.roomEnvelope.corners = floor.roomEnvelope.corners.map(f);
  }
  if (copy.bounds?.footprint) copy.bounds.footprint = copy.bounds.footprint.map(f);
  if (copy.coreFrame?.anglesDeg) copy.coreFrame.anglesDeg = copy.coreFrame.anglesDeg.map(angle => angle + deg);
  if (copy.roof) {
    if (copy.roof.outline) copy.roof.outline = copy.roof.outline.map(f);
    const bulkhead = copy.roof.bulkhead;
    if (bulkhead) {
      bulkhead.center = f(bulkhead.center);
      bulkhead.axis = f(bulkhead.axis);
      if (bulkhead.doorNormal) bulkhead.doorNormal = f(bulkhead.doorNormal);
    }
    for (const artifact of copy.roof.artifacts ?? []) {
      artifact.center = f(artifact.center);
      artifact.rotationDeg = (artifact.rotationDeg ?? 0) - deg;
    }
  }
  return copy;
}

const KINDS = [
  { kind: 'A', family: 'mirror-frame', type: 'residential', tier: 'high_rich' },
  { kind: 'B', family: 'balcony-grid', type: 'residential', tier: 'rich' },
  { kind: 'C', family: 'white-grid', type: 'residential', tier: 'poor' },
  { kind: 'R', family: 'corporate-sectors', type: 'offices', tier: 'rich' },
] as const;
const full = process.env.URBE_TEMPLATE_MATRIX === 'full';
const lots: P[] = full ? [[16, 32], [24, 40], [40, 40], [56, 56]] : [[24, 40]];
const rotations = full ? [0, 37, 90] : [0, 37];
const floorCounts = full ? [3, 6, 12] : [3];

describe('template generation matrix', () => {
  for (const item of KINDS) it(`never fails a kind ${item.kind} building`, async () => {
    const { planAssembly } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    let built = 0;
    for (const [width, depth] of lots) for (const deg of rotations) for (const floors of floorCounts) {
      if (width < 24 && item.kind !== 'C') continue;
      let blueprint: Blueprint;
      try {
        blueprint = planAssembly({ buildingId: `matrix-${item.kind}`, family: item.family, seed: 'interior-proof',
          lot: { width, depth }, floors }).blueprint;
      } catch {
        continue; // Exterior has no shell for this lot; nothing for Interior to prove
      }
      const request: InteriorRequest = { seed: 'interior-proof', building: { id: `matrix-${item.kind}`, type: item.type, tier: item.tier },
        blueprint: rotateBlueprint(blueprint, deg), materialTheme: 'cyberpunk' };
      const result = await generate(request, { models: new Set() });
      built++;
      for (const layout of Object.values(result.layouts)) {
        const units = new Set(layout.floor.rooms.filter(room => room.unit).map(room => room.unit!));
        for (const unit of units) {
          const own = layout.floor.rooms.filter(room => room.unit === unit);
          const common = new Set(layout.floor.rooms.filter(room => !room.unit).map(room => room.id));
          expect(own.flatMap(room => room.doors.filter(door => common.has(door.to))).length, `${width}x${depth} r${deg} ${unit}`)
            .toBeLessThanOrEqual(1);
        }
      }
    }
    expect(built).toBeGreaterThan(0);
  }, full ? 3_600_000 : 300_000);
});
