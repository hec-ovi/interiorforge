import { expect, it } from 'vitest';
import { expandBuilding, generate, INTERIOR_RECIPES } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';

const families = [
    ['balcony-grid', 20.5, 37.5, 7, 'corpo', 'corpo_office'],
    ['corporate-sectors', 51, 39, 12, 'corpo', 'corpo_office'],
    ['faceted-bays', 42, 30, 10, 'residential', 'apartment'],
    ['white-grid', 32.5, 17.5, 7, 'residential', 'apartment'],
    ['mirror-shutters', 54, 34, 10, 'offices', 'office'],
    ['mirror-frame', 35, 27, 8, 'hotel', 'hotel_rooms'],
    ['garden-taper', 52, 42, 4, 'residential', 'apartment'],
] as const;

it.each(families)('furnishes every real %s floor with its matching shell, finishes and roof route', async (architecture, width, depth, floors, type, program) => {
    const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    const { blueprint } = await exterior.generate({ seed: `paired:${architecture}`, buildingId: architecture, theme: 'cyberpunk',
        parcel: { footprint: [[0, 0], [width, 0], [width, depth], [0, depth]], accessPoint: [0, depth / 2], maxHeight: floors * 5.5 },
        building: { type, tier: 'high_rich', floors }, options: { architecture, glb: 'merged' } }, { textures: { mode: 'keys' } });
    const request = { seed: blueprint.seed, building: { id: architecture, type, tier: 'high_rich' }, blueprint, materialTheme: 'cyberpunk' };
    const result = await generate(request), expanded = expandBuilding(result);
    const recipe = INTERIOR_RECIPES.find(item => item.id === architecture)!;
    const modules = new Set(moduleRecipes().map(item => item.id));
    expect(result.building.architecture).toBe(architecture);
    expect(result.building.floors).toHaveLength(floors);
    expect(expanded.floors).toHaveLength(floors);
    expect(expanded.npc.nav.roofAccess?.floor).toBe(floors);
    expect(expanded.npc.nav.floors.map(item => item.floor)).toEqual([...Array(floors + 1).keys()]);
    for (const ref of result.building.floors) {
        const layout = result.layouts[ref.layout]!;
        expect(layout.floor.kind).toBe(ref.index === 0 ? 'lobby' : program);
        expect(layout.floor.rooms.length).toBeGreaterThan(1);
        expect(layout.placements.some(item => item.module === `floor-slab-${recipe.floor}`)).toBe(true);
        expect(ref.treatments ?? []).toEqual([]);
        expect(layout.placements.some(item => item.module === 'window-return')).toBe(false);
        expect(layout.placements.filter(item => item.module).every(item => modules.has(item.module!))).toBe(true);
        for (const connector of result.building.connectors) {
            expect(connector.floors).toContain(ref.index);
            expect(connector.entryByFloor[String(ref.index)]).toHaveLength(2);
        }
    }
    if (architecture === 'garden-taper') {
        // Tapered intermediate plates must never reuse a larger lower-floor room plan.
        expect(Object.keys(result.layouts)).toEqual(['ground', 'middle', 'floor-2', 'crown']);
        for (const ref of result.building.floors) expect(result.layouts[ref.layout]!.sourceFloor).toBe(ref.index);
    } else expect(Object.keys(result.layouts)).toEqual(['ground', 'middle', 'crown']);
}, 30_000);
