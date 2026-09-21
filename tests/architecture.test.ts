import { expect, it } from 'vitest';
import { generate, makePlacementFixture, INTERIOR_RECIPES } from '../src/index.js';

it('pairs the exterior architecture with its interior recipe, preserves explicit programs and produces different finishes', async () => {
    const request = makePlacementFixture({ width: 24, depth: 40, floors: 3, type: 'offices', tier: 'high_rich', seed: 11 });
    const before = JSON.stringify(request);
    const outputs = [];
    for (const architecture of ['balcony-grid', 'mirror-frame']) {
        const result = await generate({ ...request, blueprint: { ...request.blueprint, assembly: { architecture } } });
        expect(result.building.architecture).toBe(architecture);
        expect(result.building.floors).toHaveLength(3);
        expect(result.layouts.middle!.floor.kind).toBe(request.assignments!.find(a => a.floor === 1)!.kind);
        outputs.push(new Set(result.layouts.middle!.placements.map(p => p.module)));
    }
    expect(outputs[0]).toContain('floor-slab-stone');
    expect(outputs[0]).toContain('wall-panel-field-mineral');
    expect(outputs[0]).not.toContain('wall-panel-rail-timber');
    expect(outputs[1]).toContain('floor-slab-marble');
    expect(JSON.stringify(request)).toBe(before);
    expect(new Set(INTERIOR_RECIPES.map(recipe => recipe.id)).size).toBe(INTERIOR_RECIPES.length);
});
