import { describe, expect, it } from 'vitest';
import type { SpaceTemplate } from '../src/layout/templates/schema.js';
import { TEMPLATE_DATA } from '../src/layout/templates/data/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { ASSEMBLIES, CEILINGS, FLOORS, PANELS, STYLES } from '../src/styles/reference/registry.js';
import { levelIds, levelPlan, RISE_MAX } from '../src/styles/systems/levels.js';
import { uvRectCorners } from '../src/layout/uv.js';

const b3 = (TEMPLATE_DATA as SpaceTemplate[]).find(t => t.id === 'b3-apartment')!;
const ids = new Set(moduleRecipes().map(recipe => recipe.id));

describe('b3 apartment', () => {
    it('sinks the lounge three risers behind a guard, raises the bar one riser and opens the bedroom onto the main room', () => {
        const living = b3.rooms.find(room => room.id === 'living')!;
        const levels = living.levels ?? [];
        expect(levels.map(level => [level.delta, level.edge])).toEqual([[-0.54, 'guard'], [0.15, 'step']]);
        const ref = (id: string) => b3.lines.find(line => line.id === id)!.ref;
        const outline = [uvRectCorners({ u: 0, v: 0, lu: b3.envelope.width, lv: b3.envelope.depth })];
        const [pit, bar] = levels.map(level => {
            const rect = { u: ref(level.u[0]), v: ref(level.v[0]), lu: ref(level.u[1]) - ref(level.u[0]), lv: ref(level.v[1]) - ref(level.v[0]) };
            return { level, plan: levelPlan({ polygon: uvRectCorners(rect), delta: level.delta, edge: level.edge,
                ...(level.stair ? { stair: { at: [rect.u, rect.v + level.stair.at] as [number, number], axis: level.stair.along, width: level.stair.width } } : {}) }, outline) };
        });
        // three risers down into the pit, each under the body step, one flight and a glass guard
        expect(pit!.plan.nosings.length).toBe(3);
        expect(.54 / 3).toBeLessThanOrEqual(RISE_MAX + 1e-9);
        expect(pit!.plan.guards.length).toBeGreaterThan(0);
        // one riser up to the bar, which carries the island and the window run
        expect(bar!.plan.slabs.map(slab => +slab.top.toFixed(2))).toEqual([.15]);
        for (const id of ['bar-island', 'bar-window-run'])
            expect(b3.fixtures.find(f => f.id === id)!.required, id).toBe(true);
        // the pit holds its sofas and table, the bedroom opens onto the main room, the closet
        // through its portal
        expect(b3.fixtures.filter(f => f.room === 'living' && f.id.startsWith('pit-')).length).toBeGreaterThanOrEqual(3);
        expect(b3.doors.find(d => d.id === 'bed-open')).toMatchObject({ between: ['bed', 'living'], kind: 'open' });
        expect(b3.doors.find(d => d.id === 'closet-portal')).toMatchObject({ kind: 'portal', width: 2.5 });
        expect(b3.source?.revision).toBe('hand-3');
    });

    it('registers the b1, b2 and b3 styles with every system and level piece in the catalog', () => {
        for (const sid of ['b1', 'b2', 'b3']) {
            const style = STYLES.get(sid)!;
            expect(style.kind).toBe('B');
            for (const room of ['living', 'bedroom', 'bathroom', 'corridor', 'reception'] as const) {
                const finish = style.finish(room, 'apartment', { family: 'luxury', field: 'wall-field-meridian-ivory', floor: 'floor-slab-meridian-stone', ceiling: 'ceiling-luxury-panel', cove: 'ceiling-cove', spot: 'ceiling-spot' });
                for (const id of [finish.field, finish.floor, finish.ceiling]) expect(ids.has(id), `${sid} ${room} ${id}`).toBe(true);
                if (PANELS.has(finish.field)) expect(ids.has(PANELS.get(finish.field)!.backing)).toBe(true);
                if (FLOORS.has(finish.floor)) expect(ids.has(FLOORS.get(finish.floor)!.support)).toBe(true);
                if (CEILINGS.has(finish.ceiling)) expect(ids.has(CEILINGS.get(finish.ceiling)!.backing)).toBe(true);
            }
        }
        for (const sid of ['b3', 'ref']) for (const id of Object.values(levelIds(sid))) expect(ids.has(id), id).toBe(true);
        for (const fit of ['asm-b3-bar', 'asm-b3-counter', 'asm-b3-media']) expect(ASSEMBLIES.has(fit)).toBe(true);
        expect(PANELS.get('wall-field-b3')!.pitch).toEqual([1.2]);
    });
});
