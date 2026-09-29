import { beforeAll, describe, expect, it } from 'vitest';
import { generate, type Blueprint, type InteriorRequest } from '../src/index.js';
import type { FloorPlacement, GeneratedInterior } from '../src/placements/types.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { loadTheme } from '../src/materials/load.js';
import { TEMPLATES } from '../src/layout/templates/registry.js';
import { CEILINGS, FLOORS, GLAZING, PANELS, PORTALS, STYLES } from '../src/styles/reference/registry.js';
import { CHEST, PLANT, TOWER } from '../src/styles/ref-r/furniture.js';
import { kind } from '../src/styles/ref-r/index.js';
import { R1_PANEL_PITCH } from '../src/styles/ref-r/systems.js';
import { portalRecipes } from '../src/styles/systems/portal.js';

/** The rich office (r1): the executive suite template in real office halls, the r1 style on
 *  every room of a kind R building, and the reference office's measured pieces. */

type P = [number, number];
const turn = (deg: number) => {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return ([x, z]: P): P => [x * c - z * s, x * s + z * c];
};
/** Rigid rotation of every world coordinate a kit blueprint carries. */
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
        const bulkhead = copy.roof.bulkhead;
        if (bulkhead) {
            bulkhead.center = f(bulkhead.center);
            bulkhead.axis = f(bulkhead.axis);
            if (bulkhead.doorNormal) bulkhead.doorNormal = f(bulkhead.doorNormal);
        }
        for (const artifact of copy.roof.artifacts ?? []) {
            artifact.center = f(artifact.center);
            artifact.rotationDeg = (artifact.rotationDeg ?? 0) - deg;
        }
    }
    return copy;
}

const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
/** Shortest distance from a point to a closed outline. */
function outlineDistance([x, z]: number[], outline: number[][]): number {
    let best = Infinity;
    for (let i = 0; i < outline.length; i++) {
        const [ax, az] = outline[i]!, [bx, bz] = outline[(i + 1) % outline.length]!;
        const dx = bx! - ax!, dz = bz! - az!, t = Math.max(0, Math.min(1, ((x! - ax!) * dx + (z! - az!) * dz) / (dx * dx + dz * dz || 1)));
        best = Math.min(best, Math.hypot(x! - ax! - t * dx, z! - az! - t * dz));
    }
    return best;
}

describe('the r1 style and its systems', () => {
    it('registers the r1 style, panel walls, timber ceiling, walnut floor, glazing and layered doorway', () => {
        expect(STYLES.get('r1')?.kind).toBe('R');
        expect(PANELS.get('wall-field-r1')?.pitch).toEqual([R1_PANEL_PITCH]);
        expect(R1_PANEL_PITCH).toBeLessThanOrEqual(1.65);
        expect(CEILINGS.has('ceiling-field-r1')).toBe(true);
        expect(FLOORS.has('floor-slab-r1')).toBe(true);
        expect(GLAZING.get('r1-glass')?.rooms).not.toContain('executive_office');
        const portal = PORTALS.get('r1-layered')!;
        expect(portal.layers).toEqual(['r1-layered-outer']);
        expect(PORTALS.has('r1-layered-outer')).toBe(true);
    });

    it('finishes the executive office in r1 panels, walnut, timber and the layered doorway, and keeps it unglazed', () => {
        const style = STYLES.get('r1')!;
        const base = { family: 'corporate' as const, field: 'wall-field-corporate-graphite', floor: 'floor-slab-corporate-wood',
            ceiling: 'ceiling-field-corporate-timber', cove: 'ceiling-led-strip', spot: 'ceiling-spot-cool' };
        const executive = style.finish('executive_office', 'office', base);
        expect(executive).toMatchObject({ field: 'wall-field-r1', floor: 'floor-slab-r1', ceiling: 'ceiling-field-r1',
            portal: 'r1-layered', glazing: 'r1-glass', casing: 'r1', spot: 'ceiling-spot-r1-pendant' });
        const open = style.finish('office_open', 'office', { ...base, field: 'wall-field-corporate-mineral' });
        expect(open.field).toBe('wall-field-corporate-mineral');
        expect(open.portal).toBe('r1-layered');
    });

    it('draws its pieces inside their reservations and in published materials', () => {
        for (const [piece, size] of [[CHEST.module, CHEST.size], [TOWER.module, TOWER.size], [PLANT.module, PLANT.size]] as const) {
            const recipe = catalog.get(piece)!;
            expect(recipe, piece).toBeDefined();
            expect(recipe.size[0], `${piece} width`).toBeLessThanOrEqual(size[0] + .03);
            expect(recipe.size[2], `${piece} depth`).toBeLessThanOrEqual(size[1] + .01);
            expect(recipe.size[1], `${piece} height`).toBeLessThanOrEqual(size[2] + .01);
        }
        const theme = loadTheme('cyberpunk')!.library, ids: string[] = [];
        for (const set of kind.recipes) set(id => { ids.push(id); });
        for (const portal of kind.portals) portalRecipes(portal)(id => { ids.push(id); });
        for (const id of ids) for (const slot of catalog.get(id)!.mesh.materials()) {
            const [key, variant] = slot.split('#');
            expect(theme.entry(key!)?.variants.some(v => v.id === variant), `${id} ${slot}`).toBe(true);
        }
    });

    it('keeps the hand template complete: envelope, daylight, entry, one remainder, the suite rooms', () => {
        const t = TEMPLATES.get('r1-office')!;
        expect(t.rooms.filter(room => room.remainder)).toHaveLength(1);
        expect(t.daylight).toEqual(['v1']);
        expect(t.entry).toEqual({ room: 'open', door: 'entry' });
        expect(t.rooms.map(room => room.id).sort()).toEqual(['archive', 'assistant', 'boardroom', 'executive', 'open']);
        expect(t.doors.find(door => door.id === 'executive-door')).toMatchObject({ kind: 'portal', portal: 'r1-layered' });
    });
});

describe('a kind R office building', () => {
    const cases = [
        { lot: [40, 40], deg: 0 }, { lot: [40, 40], deg: 37 }, { lot: [56, 40], deg: 0 },
    ] as const;
    const built = new Map<string, { result: GeneratedInterior; blueprint: Blueprint }>();
    beforeAll(async () => {
        const { planAssembly } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
        for (const { lot, deg } of cases) {
            const plan = planAssembly({ buildingId: 'r1', family: 'mirror-frame', seed: 'interior-proof', lot: { width: lot[0], depth: lot[1] },
                floors: 4, floorHeight: 3.6 });
            const blueprint = rotateBlueprint(plan.blueprint, deg);
            const request: InteriorRequest = { seed: 'interior-proof', building: { id: 'r1', type: 'offices', tier: 'rich' }, blueprint, materialTheme: 'cyberpunk' };
            built.set(`${lot.join('x')}@${deg}`, { result: await generate(request, { models: new Set() }), blueprint });
        }
    }, 240000);

    for (const { lot, deg } of cases) it(`fits the executive suite on the ${lot.join(' x ')} lot at ${deg} degrees`, () => {
        const { result, blueprint } = built.get(`${lot.join('x')}@${deg}`)!;
        expect(result.building.kind).toBe('R');
        const middle: FloorPlacement = result.layouts.middle!;
        const floor = middle.floor, outline = blueprint.floors.find(f => f.index === 1)!.outline;
        expect(floor.rooms.every(room => room.style === 'r1')).toBe(true);
        const executives = floor.rooms.filter(room => room.template === 'r1-office/executive');
        expect(executives.length).toBeGreaterThanOrEqual(1);
        for (const room of executives) {
            // exact reference size, ceiling at the reference 3.0 m, closed on every side
            const sides = room.polygon.map((p, i) => { const q = room.polygon[(i + 1) % room.polygon.length]!; return Math.round(Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!) * 100) / 100; });
            expect(room.polygon).toHaveLength(4);
            expect([...new Set(sides)].sort((a, b) => a - b)).toEqual([5, 8.5]);
            expect(floor.ceilingElevation - floor.elevation - (room.ceilingDrop ?? 0)).toBeCloseTo(3.0, 2);
            for (const point of room.polygon) expect(outlineDistance(point, outline)).toBeGreaterThan(2);
            expect(room.doors).toHaveLength(1);
            const placements = middle.placements.filter(p => p.room === room.id), modules = placements.map(p => p.module ?? '');
            expect(modules.some(m => m.startsWith('wall-panel-r1-col'))).toBe(true);
            expect(modules.some(m => m === 'wall-panel-field-glass' || m === 'wall-field-corporate-graphite')).toBe(false);
            // the doorway's header stands on the line, owned by either room
            const door = room.doors[0]!;
            expect(middle.placements.some(p => p.module === 'door-header-r1-layered'
                && Math.hypot(p.position[0] - door.position[0], p.position[2] - door.position[1]) < .3)).toBe(true);
            expect(modules.some(m => m.startsWith('ceiling-r1-'))).toBe(true);
            expect(modules.some(m => m.startsWith('floor-finish-r1-boards'))).toBe(true);
            expect(modules).toContain('floor-finish-r1-rug');
            expect(modules).toContain('wall-panel-r1-pier');
            const fits = floor.furniture.filter(item => item.room === room.id).map(item => item.fit ?? item.kind);
            for (const fit of ['fit-corporate-executive-desk', 'fit-r1-chest', 'asm-r1-library', 'asm-r1-library-return', 'wall_art', 'display_screen'])
                expect(fits, fit).toContain(fit);
            expect(fits.filter(fit => fit === TOWER.module)).toHaveLength(2);
            // every pendant and red floor line has its light record under the same id
            const records = new Set(floor.lights.map(light => light.id));
            for (const p of placements.filter(p => p.module === 'ceiling-spot-r1-pendant' || p.module === 'wall-light-line-r1'))
                expect(records.has(p.id), p.id).toBe(true);
            expect(placements.some(p => p.module === 'ceiling-spot-r1-pendant')).toBe(true);
        }
        // no graphite field survives on the floor: the r1 panel system lines those rooms
        expect(middle.placements.some(p => p.module === 'wall-field-corporate-graphite')).toBe(false);
        for (const layout of Object.values(result.layouts)) expect(layout.placements.length, layout.id).toBeLessThanOrEqual(3000);
    });

    it('glazes the suite boardroom and assistant office with the r1 mullions', () => {
        const { result } = built.get('40x40@0')!;
        const middle = result.layouts.middle!;
        const glazed = new Set(middle.floor.rooms.filter(room => room.template === 'r1-office/boardroom' || room.template === 'r1-office/assistant').map(room => room.id));
        expect(middle.placements.some(p => glazed.has(p.room) && p.module === 'wall-glazing-r1-office-mullion')).toBe(true);
    });
});
