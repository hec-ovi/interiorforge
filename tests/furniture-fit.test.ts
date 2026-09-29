import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generate, makePlacementFixture } from '../src/index.js';
import type { FloorPlacement, InteriorRequest, Tier } from '../src/index.js';
import { fitAssetBounds, loadAssetCatalog } from '../src/assets/catalog.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { STYLES } from '../src/styles/reference/registry.js';

const catalog = loadAssetCatalog();
const asset = (id: string) => catalog.assets.find(entry => entry.id === id)!;
const plan = (id: string) => JSON.parse(readFileSync(new URL(`./kit-plans/${id}.blueprint.json`, import.meta.url), 'utf8'));
const modules = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
/** Where a layout's furniture piece stands, by its id. */
const standing = (layout: FloorPlacement, id: string) => layout.placements.find(p => p.id === id);

it('fits a catalog model by the way it faces and how much of its record it fills', () => {
    // The mattress runs along x as authored: turned to face +z it lies along the bed.
    const mattress = fitAssetBounds(asset('sketchfab-mattress'), [1.6, 2.1, 0.55])!;
    expect(mattress.dimensions[1]).toBeCloseTo(2.1, 3);
    expect(mattress.dimensions[0]).toBeGreaterThan(1.3);
    // A narrow cabinet is no wardrobe, a side table no meeting table: another piece stands there.
    expect(fitAssetBounds(asset('sketchfab-ikea-cabinet'), [1.6, 0.65, 2])).toBeNull();
    expect(fitAssetBounds(asset('sketchfab-table'), [2.8, 1.2, 0.75])).toBeNull();
    // A smaller piece of the same kind still stands in: a shallower sofa, a shorter desk.
    expect(fitAssetBounds(asset('polyhaven-sofa-01'), [1.8, 0.85, 0.8])).not.toBeNull();
    expect(fitAssetBounds(asset('polyhaven-metal-office-desk'), [2.6, 0.9, 1.1])).not.toBeNull();
    // Models authored facing away say so, and every declared turn is a quarter turn.
    expect(asset('sketchfab-old-leather-office-chair').frontYawDeg).toBe(180);
    for (const entry of catalog.assets) if (entry.frontYawDeg !== undefined) expect([90, 180, 270]).toContain(entry.frontYawDeg);
});

it('stands every bed along its frame, a family wardrobe where no model fills one, and lights only lit modules', { timeout: 120000 }, async () => {
    // The worn and capsule styles stand their own wardrobes, the H10 capsule profile its
    // own on an unlabelled shell; rich homes the Corpo Plaza reference wardrobe.
    const homes: [Tier, string][] = [['poor', 'fit-damaged-wardrobe'], ['mid', 'fit-capsule-h10-wardrobe'], ['rich', 'fit-wardrobe-corpo']];
    for (const [tier, wardrobe] of homes) {
        const request: InteriorRequest = { seed: `fit:${tier}`, building: { id: `home-${tier}`, type: 'residential', tier }, blueprint: plan('plain-residential-poor-4x3x4f'), materialTheme: 'cyberpunk' };
        const built = await generate(request);
        const layouts = Object.values(built.layouts);
        const pieces = layouts.flatMap(layout => layout.floor.furniture.map(item => ({ item, placed: standing(layout, item.id)!, layout })));
        expect(pieces.some(({ item }) => item.kind === 'wardrobe'), tier).toBe(true);
        for (const { item, placed, layout } of pieces) {
            if (item.kind === 'wardrobe') {
                // A poor home is reference kind C: a capsule style (c1, c7) stands its own wardrobe where the reservation is that piece's size.
                const room = layout.floor.rooms.find(room => room.id === item.room)!;
                expect(placed.module, `${tier} ${item.id}`).toBe((room.style ? STYLES.get(room.style)?.fit?.(item, room) : null) ?? wardrobe);
                // A retained wardrobe occupies its full storage reservation, with actual
                // closed geometry and a height appropriate for standing clothing storage.
                const recipe = modules.get(placed.module!)!;
                expect(recipe.size[0] * placed.scale[0]).toBeCloseTo(item.size[0], 5);
                expect(recipe.size[2] * placed.scale[2]).toBeLessThanOrEqual(item.size[1] + 1e-5);
                expect(recipe.size[1] * placed.scale[1]).toBeGreaterThanOrEqual(1.8);
            }
            // A catalog model turns by its own front on top of the piece's yaw.
            if (placed.prop) {
                const turn = asset(placed.prop).frontYawDeg ?? 0;
                expect(Math.cos(placed.rotationY - (item.rotationDeg + turn) * Math.PI / 180), `${tier} ${item.id}`).toBeCloseTo(1, 6);
            }
            // A light record stands on a lens: only a lit module carries one.
            const lit = layout.floor.lights.filter(light => light.furniture === item.id);
            const lens = !!placed.module && modules.get(placed.module)!.mesh.materials().some(slot => slot.includes('/light-fixture/'));
            if (!lens) expect(lit, `${tier} ${item.id} ${placed.module ?? placed.prop}`).toEqual([]);
        }
    }
});

it('seats a luxury office at its own desks, and seats no guest in a post\'s chair', { timeout: 120000 }, async () => {
    const request = makePlacementFixture({ width: 24, depth: 40, floors: 3, type: 'offices', tier: 'rich', seed: 5 });
    // Offices prefer a present catalog desk and chair; with none present they stand the
    // family's built-in modules, which this checks.
    const built = await generate(request, { models: new Set() });
    for (const [name, layout] of Object.entries(built.layouts)) {
        for (const item of layout.floor.furniture.filter(f => f.kind === 'desk' || f.kind === 'office_chair'))
            expect(standing(layout, item.id)?.module, `${name} ${item.id}`).toBe(item.kind === 'desk' ? 'fit-desk' : 'fit-office-chair');
        expect(layout.placements.some(p => p.prop === 'polyhaven-school-chair-01'), name).toBe(false);
        // One body per place: a seat's body is on its piece, a post's where it works from.
        const posts = layout.npc.anchors.filter(a => a.kind === 'counter_spot' || a.kind === 'work_spot');
        for (const seat of layout.npc.anchors.filter(a => a.kind === 'seat')) {
            const chair = standing(layout, seat.furniture!)!;
            for (const post of posts) {
                expect(Math.hypot(chair.position[0] - post.position[0], chair.position[2] - post.position[1]), `${name} ${seat.id} ${post.id}`).toBeGreaterThanOrEqual(0.6);
                expect(Math.hypot(seat.position[0] - post.position[0], seat.position[1] - post.position[1]), `${name} ${seat.id} ${post.id}`).toBeGreaterThanOrEqual(0.6);
            }
        }
    }
    expect(built.layouts.ground!.npc.roles.map(role => role.role)).toContain('receptionist');
    expect(Object.values(built.layouts).some(layout => layout.floor.furniture.some(f => f.kind === 'desk'))).toBe(true);
});
