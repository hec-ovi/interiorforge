import { describe, expect, it } from 'vitest';
import { generate, makePlacementFixture } from '../src/index.js';
import { validateRequest } from '../src/blueprint/validate.js';
import { capsuleProfile } from '../src/styles/capsule/profile.js';
import type { InteriorRequest } from '../src/core/types.js';

describe('explicit residential reference identity', () => {
  const source = (): InteriorRequest => {
    const request = makePlacementFixture({ seed: 'capsule-identity-same-shell', width: 40, depth: 40, floors: 3, type: 'residential', tier: 'mid' });
    request.assignments = request.blueprint.floors.map(floor => ({ floor: floor.index, kind: floor.index === 0 ? 'lobby' : 'apartment' }));
    return request;
  };

  it('retains selected identity across seeds and permits pairing it independently of the facade', () => {
    const request = source();
    request.building.interiorStyle = 'japantown';
    expect(validateRequest(request).building.interiorStyle).toBe('japantown');
    expect(capsuleProfile(request)).toBe('japantown');
    request.seed = 'another-building';
    expect(capsuleProfile(request)).toBe('japantown');
  });

  it('rejects an unknown style and a residential identity paired with an incompatible tier', () => {
    const request = source();
    expect(() => validateRequest({ ...request, building: { ...request.building, interiorStyle: 'invented-reference' } })).toThrow();
    expect(() => validateRequest({ ...request, building: { ...request.building, tier: 'rich', interiorStyle: 'japantown' } })).toThrow();
  });

  it('publishes physically different cabinetry, niche composition and lit kitchen with correct heights in the same shell', async () => {
    const request = source();
    const results = [];
    for (const interiorStyle of ['h10', 'japantown'] as const) {
      const result = await generate({ ...request, building: { ...request.building, interiorStyle } }, { models: new Set() });
      expect(result.building.interiorStyle).toBe(interiorStyle);
      const layouts = Object.values(result.layouts).filter(layout => layout.sourceFloor > 0 && layout.floor.kind !== 'roof');
      const placements = layouts.flatMap(layout => layout.placements);
      expect(placements.some(p => p.module === `fit-capsule-${interiorStyle}-niche`)).toBe(true);
      expect(placements.some(p => p.module === (interiorStyle === 'h10' ? 'fit-capsule-h10-wardrobe' : 'fit-capsule-wardrobe'))).toBe(true);
      if (interiorStyle === 'japantown') {
        const kitchens = placements.filter(p => p.module === 'fit-capsule-japantown-kitchen');
        expect(kitchens.length).toBeGreaterThan(0);
        expect(kitchens.every(p => p.scale.every(scale => Math.abs(scale - 1) < 1e-6))).toBe(true);
        for (const layout of layouts) {
          const ids = new Set(layout.placements.filter(p => p.module === 'fit-capsule-japantown-kitchen').map(p => p.id));
          const lights = layout.floor.lights.filter(light => light.furniture && ids.has(light.furniture));
          expect(lights.length).toBe(ids.size);
          expect(lights.every(light => Math.abs(light.position[1] - 2.076) < 1e-5)).toBe(true);
        }
      }
      results.push(result);
    }
    expect(results[0]!.layouts.middle!.floor.rooms).toEqual(results[1]!.layouts.middle!.floor.rooms);
  }, 180_000);
});
