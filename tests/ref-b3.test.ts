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
    it('raises the bar on a stepped platform and sinks the lounge into a stepped pit, clear of the entry', () => {
        const living = b3.rooms.find(room => room.id === 'living')!;
        const levels = living.levels ?? [];
        expect(levels.map(level => [level.delta, level.edge])).toEqual([[-0.3, 'step'], [0.3, 'step']]);
        const ref = (id: string) => b3.lines.find(line => line.id === id)!.ref;
        for (const level of levels) {
            // Never over the entry's approach: every zone starts beyond the foyer.
            expect(ref(level.v[0])).toBeGreaterThanOrEqual(2);
            const rect = { u: ref(level.u[0]), v: ref(level.v[0]), lu: ref(level.u[1]) - ref(level.u[0]), lv: ref(level.v[1]) - ref(level.v[0]) };
            const plan = levelPlan({ polygon: uvRectCorners(rect), delta: level.delta, edge: level.edge }, [uvRectCorners({ u: 0, v: 0, lu: 14, lv: 11 })]);
            const rises = [...new Set(plan.slabs.map(s => +Math.abs(s.top).toFixed(3)))].sort();
            expect(rises.length).toBeGreaterThan(1);
            expect(Math.abs(level.delta) / (rises.length - (level.delta < 0 ? 1 : 0) || 1)).toBeLessThanOrEqual(RISE_MAX + 1e-9);
        }
        // The back bar and counter stand on the platform, the pit keeps its floor clear.
        const bar = b3.fixtures.find(f => f.fit === 'asm-b3-bar')!;
        expect(bar.required).toBe(true);
        expect(ref((bar.along as { line: string }).line)).toBeGreaterThanOrEqual(ref(levels[1]!.v[0]));
        expect(living.keepouts).toEqual([{ u: levels[0]!.u, v: levels[0]!.v }]);
        expect(b3.source?.revision).toBe('hand-2');
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
