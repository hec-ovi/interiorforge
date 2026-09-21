import { expect, it } from 'vitest';
import { generate, makePlacementFixture, INTERIOR_RECIPES } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';

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

it('uses real neutral panel materials across the dark architectural wall fields', async () => {
    const modules = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
    const request = makePlacementFixture({ width: 24, depth: 40, floors: 3, type: 'offices', tier: 'high_rich', seed: 11 });
    const expected = {
        'corporate-sectors': 'cyberpunk/corporate-panel/mid#native',
        'mirror-frame': 'cyberpunk/wall/high_rich#panel-graphite',
        'mirror-shutters': 'cyberpunk/corporate-panel/mid#native',
    };
    for (const [architecture, slot] of Object.entries(expected)) {
        const result = await generate({ ...request, blueprint: { ...request.blueprint, assembly: { architecture } } });
        const fields = result.layouts.middle!.placements.filter(placement => /^wall-(panel-)?field-/.test(placement.module ?? ''));
        const slots = fields.flatMap(placement => modules.get(placement.module!)!.mesh.materials());
        expect(slots).toContain(slot);
        expect(slots.some(material => /\/(wood|interior-luxury-timber)\//.test(material))).toBe(false);
        expect(result.layouts.middle!.placements.some(placement => placement.module === 'ceiling-field-dark')).toBe(true);
    }
});
