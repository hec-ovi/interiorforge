import { describe, expect, it } from 'vitest';
import { moduleRecipes } from '../src/modules/recipes.js';
import { DAMAGED_FURNITURE, damagedFurnitureFor } from '../src/styles/damaged/furniture.js';
import { architectureFinish } from '../src/architecture/recipes.js';
import { damagedRoomFinish } from '../src/styles/damaged/finish.js';
import { makePlacementFixture } from '../src/blueprint/placement-fixture.js';
import { generate } from '../src/placements/generate.js';

const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));

describe('worn residential architecture', () => {
  it('keeps every authored fitting inside its planner reservation', () => {
    for (const [kind, fit] of Object.entries(DAMAGED_FURNITURE)) {
      const recipe = recipes.get(fit.module);
      expect(recipe, `${kind}: ${fit.module}`).toBeDefined();
      const size = [fit.size[0], fit.size[2], fit.size[1]];
      for (let axis = 0; axis < 3; axis++) {
        const lo = -recipe!.origin[axis]!, hi = recipe!.size[axis]! + lo;
        const allowedLo = axis === 1 ? 0 : -size[axis]! / 2;
        // Bed height reserves the support plane, while the rear head rail rises above it; basin mirrors mount above the sink.
        const allowedHi = axis === 1 ? (kind.startsWith('bed_') ? 1.02 : kind === 'sink' ? 1.95 : size[axis]!) : size[axis]! / 2;
        expect(lo, `${kind} axis ${axis} min`).toBeGreaterThanOrEqual(allowedLo - .004);
        expect(hi, `${kind} axis ${axis} max`).toBeLessThanOrEqual(allowedHi + .004);
      }
    }
  });

  it('selects megablock shared finishes through the real architecture dispatcher', () => {
    const request = makePlacementFixture({ type: 'residential', tier: 'poor' });
    request.blueprint.assembly = { architecture: 'residential-megablock' };
    const shared = damagedRoomFinish('reception', 'lobby');
    expect(architectureFinish(request, 'damaged', 'reception', shared).field).toBe('wall-field-damaged-megablock');
    const privateRoom = damagedRoomFinish('bedroom', 'apartment');
    expect(architectureFinish(request, 'damaged', 'bedroom', privateRoom).field).toBe('wall-field-damaged-lodging');
    request.blueprint.assembly = { architecture: 'residential-courtyard' };
    expect(architectureFinish(request, 'damaged', 'reception', shared)).toBe(shared);
    expect(architectureFinish(request, 'damaged', 'bedroom', privateRoom)).toBe(privateRoom);
  });

  it('authors dado against its own mounting face instead of the partition origin', () => {
    const dado = recipes.get('wall-field-damaged-dado')!;
    expect(dado.origin[2]).toBeCloseTo(0, 6);
    expect(dado.size[2]).toBeCloseTo(.005, 6);
  });

  it('keeps shared mailboxes out of private apartments', () => {
    expect(damagedFurnitureFor('ornament_wall', 'reception')?.module).toBe('fit-damaged-mail-bank');
    expect(damagedFurnitureFor('ornament_wall', 'living')?.module).toBe('fit-damaged-storage-wall');
  });

  it('uses solid tiled wet-room wall fields and leaves private ceilings quiet', () => {
    expect(damagedRoomFinish('bathroom', 'apartment').field).toBe('wall-field-damaged-wet');
    expect(damagedRoomFinish('reception', 'lobby').field).toBe('wall-field-damaged-public');
    expect(damagedRoomFinish('bedroom', 'apartment').services).toBeUndefined();
    expect(recipes.get('wall-field-damaged-wet')!.mesh.materials()).toContain('cyberpunk/subway-tile/mid#running-bond');
  });

  it.each([40, 60])('generates inhabited %sm dynamic plans without downloaded furniture', async size => {
    const request = makePlacementFixture({ seed: 'worn-proof', width: size, depth: size, floors: 4, tier: 'poor', type: 'residential' });
    const result = await generate(request, { models: new Set() });
    const ground = result.layouts.ground!;
    expect(ground.placements.some(p => p.module === 'fit-damaged-caretaker-desk')).toBe(true);
    expect(ground.placements.some(p => p.module === 'fit-damaged-sofa')).toBe(true);
    expect(result.layouts.middle!.placements.some(p => p.module === 'fit-damaged-kitchen')).toBe(true);
    // A poor home is reference kind C: its capsule homes sleep in the capsule bed and its public rooms run the c2 exposed trunk instead of the family's services.
    expect(result.layouts.middle!.placements.some(p => p.module === 'fit-capsule-bed')).toBe(true);
    expect(ground.placements.some(p => p.module === 'trim-c2-trunk-bay')).toBe(true);
    expect(result.building.floors).toHaveLength(4);
    expect(result.building.connectors.some(c => c.kind === 'stair')).toBe(true);
  }, 180_000);
});
