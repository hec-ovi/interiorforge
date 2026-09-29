import { beforeAll, describe, expect, it } from 'vitest';
import { generate, type Blueprint, type InteriorRequest } from '../src/index.js';
import type { GeneratedInterior } from '../src/placements/types.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { STYLES } from '../src/styles/reference/registry.js';
import { TEMPLATES } from '../src/layout/templates/registry.js';
import { capsuleFurnitureFor } from '../src/styles/capsule/furniture.js';

/** Kind C, the poor building of capsule homes: every room wears a registered C style, the
 *  H10 and Japantown homes take their templates on a 40 m lot and on a 24 x 40 lot turned
 *  37 degrees, their capsule pieces stand as the capsule modules at scale 1, their walls
 *  are panel systems the damaged dresser leaves alone, and the public floors carry their
 *  trunk bays, lamps and ducts. */

const turn = (deg: number) => {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return ([x, z]: [number, number]): [number, number] => [x * c - z * s, x * s + z * c];
};
function rotateBlueprint(blueprint: Blueprint, deg: number): Blueprint {
    if (!deg) return blueprint;
    const f = turn(deg), copy = structuredClone(blueprint) as Blueprint & Record<string, any>;
    for (const floor of copy.floors) {
        floor.outline = floor.outline.map(f);
        if (floor.roomEnvelope?.corners) floor.roomEnvelope.corners = floor.roomEnvelope.corners.map(f);
    }
    if (copy.bounds?.footprint) copy.bounds.footprint = copy.bounds.footprint.map(f);
    if (copy.coreFrame?.anglesDeg) copy.coreFrame.anglesDeg = copy.coreFrame.anglesDeg.map((a: number) => a + deg);
    if (copy.roof) {
        if (copy.roof.outline) copy.roof.outline = copy.roof.outline.map(f);
        const b = copy.roof.bulkhead;
        if (b) { b.center = f(b.center); b.axis = f(b.axis); if (b.doorNormal) b.doorNormal = f(b.doorNormal); }
        for (const a of copy.roof.artifacts ?? []) { a.center = f(a.center); a.rotationDeg = (a.rotationDeg ?? 0) - deg; }
    }
    return copy;
}

const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const buildings = new Map<string, GeneratedInterior>();

beforeAll(async () => {
    const { planAssembly } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    for (const [name, width, depth, deg] of [['40', 40, 40, 0], ['24r37', 24, 40, 37]] as const) {
        const { blueprint } = planAssembly({ buildingId: `ref-c-${name}`, family: 'white-grid', seed: 'interior-proof', lot: { width, depth }, floors: 3 });
        const request: InteriorRequest = { seed: 'interior-proof', building: { id: `ref-c-${name}`, type: 'residential', tier: 'poor', kind: 'C' },
            blueprint: rotateBlueprint(blueprint, deg), materialTheme: 'cyberpunk' };
        buildings.set(name, await generate(request, { models: new Set() }));
    }
}, 240_000);

describe('kind C styles', () => {
    it('registers the seven C styles with systems whose modules the catalog holds', () => {
        for (const sid of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']) expect(STYLES.get(sid)?.kind, sid).toBe('C');
        for (const id of ['wall-field-c1', 'wall-field-c7', 'wall-field-c2', 'wall-panel-c4-paint', 'ceiling-field-c1', 'ceiling-field-c2',
            'floor-slab-c1', 'floor-slab-c7', 'floor-slab-c4', 'door-header-c1-bath',
            'housing-c1-beam-body', 'housing-c7-duct-grille', 'trim-c2-trunk-bay', 'trim-c2-wall-lamp', 'fit-c4-urinal', 'fit-c1-vending'])
            expect(catalog.has(id), id).toBe(true);
    });

    it('keeps the capsule homes templates exact in their rigid spans', () => {
        const c1 = TEMPLATES.get('c1-capsule')!, c7 = TEMPLATES.get('c7-room')!;
        const rigid = (t: typeof c1, from: string) => t.spans.find(span => span.from === from)!;
        expect(rigid(c1, 'u0').weight).toBe(0);
        expect(rigid(c7, 'u0').weight).toBe(0);
        // the hooded Japantown kitchen is authored at its module's own size, never scaled
        const kitchen = c7.fixtures.find(f => f.id === 'kitchen')!;
        expect(kitchen.size).toEqual(capsuleFurnitureFor('kitchen_block', 'japantown')!.size);
        for (const t of [c1, c7]) for (const fixture of t.fixtures.filter(f => f.fit?.startsWith('fit-'))) {
            const recipe = catalog.get(fixture.fit!);
            expect(recipe, fixture.fit).toBeDefined();
        }
    });

    for (const name of ['40', '24r37']) it(`furnishes the ${name} building as kind C`, () => {
        const result = buildings.get(name)!;
        expect(result.building.kind).toBe('C');
        let homes = 0;
        for (const layout of Object.values(result.layouts)) {
            const rooms = layout.floor.rooms.filter(room => !/^(stair|elev)-/.test(room.id));
            for (const room of rooms) expect(room.style, `${layout.id} ${room.id}`).toMatch(/^c[1-7]$/);
            for (const room of layout.floor.rooms.filter(r => r.template?.startsWith('c1-capsule/') || r.template?.startsWith('c7-room/'))) {
                homes++;
                const own = layout.placements.filter(p => p.room === room.id && p.module);
                // the capsule homes wear their own panel walls, never the damaged dresser's pieces
                expect(own.some(p => /^wall-(panel|field)-c[17]|^wall-field-capsule-japantown-wet$/.test(p.module!)), room.id).toBe(true);
                expect(own.some(p => /^wall-(damaged|shelf-damaged)/.test(p.module!)), room.id).toBe(false);
                // every capsule piece the plan fitted stands at its canonical size
                for (const item of layout.floor.furniture.filter(f => f.room === room.id && f.fit?.startsWith('fit-capsule'))) {
                    const placed = layout.placements.find(p => p.id === item.id)!;
                    expect(placed.module, item.id).toBe(item.fit);
                    expect(placed.scale, item.id).toEqual([1, 1, 1]);
                }
            }
            const sleeping = layout.floor.furniture.filter(f => f.kind === 'sleeping_pod' && /c[17]/.test(layout.floor.rooms.find(r => r.id === f.room)?.style ?? ''));
            for (const pod of sleeping) expect(layout.placements.find(p => p.id === pod.id)?.module).toMatch(/^fit-capsule-(h10|japantown|sleeping)-?niche|^fit-capsule-(h10|japantown)-niche$/);
        }
        expect(homes).toBeGreaterThan(0);
        const middle = result.layouts.middle ?? Object.values(result.layouts)[0]!;
        const modules = new Set(middle.placements.map(p => p.module));
        expect(modules.has('trim-c2-trunk-bay') || modules.has('trim-c2-trunk-run')).toBe(true);
        expect([...modules].some(m => m?.startsWith('housing-c1-beam') || m?.startsWith('housing-c7-duct'))).toBe(true);
        // every lamp the dress pass placed has its light record
        for (const layout of Object.values(result.layouts)) {
            const ids = new Set(layout.floor.lights.map(light => light.id));
            for (const lamp of layout.placements.filter(p => p.module === 'trim-c2-wall-lamp')) expect(ids.has(lamp.id), lamp.id).toBe(true);
        }
    });
});
