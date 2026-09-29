import { describe, expect, it } from 'vitest';
import { loadTheme } from '../src/materials/load.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import type { FloorKind, RoomKind } from '../src/core/types.js';
import { roomFinish } from '../src/placements/finish.js';
import { KIND_POLICY } from '../src/styles/reference/kinds.js';
import { CEILINGS, FLOORS, GLAZING, KINDS, PANELS, PORTALS, STYLES } from '../src/styles/reference/registry.js';
import { portalRecipes } from '../src/styles/systems/portal.js';

/** Every module the reference kinds draw wears published materials, and every id a style
 *  finish or system names is a module the catalog holds, markers included: leftovers,
 *  sealed voids, thresholds and stair walls place a marker id as a plain module. */
const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const ROOMS: RoomKind[] = ['corridor', 'elevator_lobby', 'reception', 'lounge', 'living', 'bedroom', 'kitchen', 'bathroom', 'toilets',
    'storage', 'mechanical_room', 'office_open', 'office_private', 'meeting', 'executive_office', 'studio_main', 'terrace_open'];
const FLOOR_KINDS: FloorKind[] = ['lobby', 'apartment', 'hotel_rooms', 'office', 'corpo_office'];

describe('reference materials and module ids', () => {
    it('resolves every material slot of every reference module in the cyberpunk theme', () => {
        const theme = loadTheme('cyberpunk')!.library;
        for (const kind of KINDS) {
            const ids: string[] = [];
            for (const set of kind.recipes) set(id => { ids.push(id); });
            for (const portal of kind.portals) portalRecipes(portal)(id => { ids.push(id); });
            for (const id of ids) for (const slot of recipes.get(id)!.mesh.materials()) {
                const [key, variant] = slot.split('#');
                const entry = theme.entry(key!);
                expect(entry, `${id} ${slot}`).toBeDefined();
                if (variant) expect(entry!.variants.some(v => v.id === variant), `${id} ${slot}`).toBe(true);
            }
        }
    });

    it('draws every system marker as a plain module', () => {
        for (const id of [...PANELS.keys(), ...CEILINGS.keys(), ...FLOORS.keys()]) expect(recipes.has(id), id).toBe(true);
        for (const spec of PANELS.values()) {
            expect(spec.id, spec.id).toMatch(/^wall-(field|panel)-[a-z][0-9]/);
            for (const id of [spec.backing, spec.fill, spec.edge, spec.head?.module, spec.foot?.module]) if (id) expect(recipes.has(id), id).toBe(true);
            // no backing, line, light, glass or mirror in a skin a numberplate may stand on
            for (const width of new Set(spec.pitch)) for (const piece of [spec.column, spec.top]) {
                // a column is named by its pitch width or by its panel width (pitch less the seam)
                const id = [piece(width), piece(width - spec.seam)].find(candidate => recipes.has(candidate));
                expect(id, `${spec.id} ${width}`).toBeDefined();
                expect(id).not.toMatch(/backing|line|light|glass|mirror/);
            }
        }
        for (const spec of CEILINGS.values()) expect(spec.id).toMatch(/^ceiling-field-[a-z][0-9]/);
        for (const spec of FLOORS.values()) {
            expect(spec.id).toMatch(/^floor-slab-[a-z][0-9]/);
            expect(recipes.has(spec.support), spec.support).toBe(true);
        }
        for (const spec of GLAZING.values()) expect(recipes.has(spec.mullion.module), spec.mullion.module).toBe(true);
        for (const spec of PORTALS.values()) {
            expect(recipes.has(`door-header-${spec.id}`), `door-header-${spec.id}`).toBe(true);
            for (const layer of spec.layers ?? []) expect(PORTALS.has(layer), layer).toBe(true);
        }
    });

    it('finishes every room of every style in modules the catalog holds', () => {
        for (const style of STYLES.values()) {
            const family = KIND_POLICY[style.kind].family;
            if (style.lift) for (const id of [style.lift.jamb, style.lift.header]) expect(recipes.has(id), id).toBe(true);
            if (style.frontage) expect(PANELS.has(style.frontage), style.frontage).toBe(true);
            for (const floorKind of FLOOR_KINDS) for (const room of ROOMS) {
                const finish = style.finish(room, floorKind, roomFinish(family, room, floorKind));
                const ids = [finish.field, finish.floor, finish.ceiling, finish.cove, finish.spot, finish.band, finish.services,
                    ...(finish.frame ? [finish.frame.corner, finish.frame.rail, finish.frame.stile, finish.frame.field, finish.frame.line] : []),
                    ...(finish.casing ? [`door-jamb-${finish.casing}`, `door-header-${finish.casing}`] : [])];
                for (const id of ids) if (id) expect(recipes.has(id), `${style.id} ${room} ${id}`).toBe(true);
                if (finish.portal) expect(PORTALS.has(finish.portal), finish.portal).toBe(true);
                if (finish.glazing) expect(GLAZING.has(finish.glazing), finish.glazing).toBe(true);
            }
        }
    });
});
