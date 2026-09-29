import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Furniture, InteriorRequest, LightFixture, Room } from '../src/core/types.js';
import type { FloorPlacement, PlacementResult } from '../src/placements/types.js';
import type { KindExports, PanelSystem, StyleSpec } from '../src/styles/systems/types.js';

/** Every call a reference system receives, recorded by the mocked placers below. */
const calls = vi.hoisted(() => ({
    panel: [] as { room: string; id: string; a: number; b: number; y0: number; y1: number; height: number; ceilingY: number; along: number }[],
    glazing: [] as { room: string; id: string }[],
    ceiling: [] as { room: string; id: string; y: number; planned: number }[],
    floor: [] as { room: string; id: string }[],
    portal: [] as { room: string; id: string; width: number }[],
    assembly: [] as { item: string; type: string }[],
    housing: [] as { id: string; rooms: string[] }[],
    dress: [] as { style: string; rooms: string[] }[],
}));

vi.mock('../src/styles/systems/panel.js', async original => {
    const actual = await original<typeof import('../src/styles/systems/panel.js')>();
    return { ...actual, placePanelSystem: (...args: Parameters<typeof actual.placePanelSystem>) => {
        const [face, spec, a, b, y0, y1] = args;
        calls.panel.push({ room: face.room, id: spec.id, a, b, y0, y1, height: face.height, ceilingY: face.ceilingY, along: face.along });
        actual.placePanelSystem(...args);
    } };
});
vi.mock('../src/styles/systems/glazing.js', async original => {
    const actual = await original<typeof import('../src/styles/systems/glazing.js')>();
    return { ...actual, placeGlazing: (...args: Parameters<typeof actual.placeGlazing>) => {
        calls.glazing.push({ room: args[0].room, id: args[1].id });
        actual.placeGlazing(...args);
    } };
});
vi.mock('../src/styles/systems/ceiling.js', async original => {
    const actual = await original<typeof import('../src/styles/systems/ceiling.js')>();
    const { uvToWorld } = await import('../src/layout/uv.js');
    return { ...actual, placeCeilingSystem: (...args: Parameters<typeof actual.placeCeilingSystem>): LightFixture[] => {
        const [builder, spec, room, rect, y, frame, planned] = args;
        calls.ceiling.push({ room: room.id, id: spec.id, y, planned: planned.length });
        actual.placeCeilingSystem(...args);
        const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
        const lens = builder.module(`ceiling-cove-${room.style ?? 'e1'}-grid`, room.id, [x, y, z], [1, 1, 1], 0);
        return [{ id: lens.id, kind: 'strip', room: room.id, position: [x, y + room.elevation, z], length: .5, angleDeg: 0,
            intensity: 1, colorTemperatureK: 3000, range: 2, beamDeg: 120, diffuse: .5, facing: 'down' }];
    } };
});
vi.mock('../src/styles/systems/floor.js', async original => {
    const actual = await original<typeof import('../src/styles/systems/floor.js')>();
    return { ...actual, placeFloorSystem: (...args: Parameters<typeof actual.placeFloorSystem>) => {
        calls.floor.push({ room: args[2].id, id: args[1].id });
        return actual.placeFloorSystem(...args);
    } };
});
vi.mock('../src/styles/systems/portal.js', async original => {
    const actual = await original<typeof import('../src/styles/systems/portal.js')>();
    const { uvToWorld } = await import('../src/layout/uv.js');
    const { FINISH } = await import('../src/modules/finishes.js');
    return { ...actual,
        // the stand-in portal draws its passage header alone, whatever the real portal system draws
        portalRecipes: (spec: { id: string }) => (add: (id: string, draw: (k: import('../src/modules/kit.js').Kit) => void) => void) =>
            add(`door-header-${spec.id}`, k => k.box(FINISH.ivory, [-.25, 0, -.1], [.5, .3, .2])),
        portalEligible: (spec: { id: string }, _peers: unknown, hole: { width: number }) => spec.id === 'e1-arch' && hole.width >= .7,
        placePortal: (...args: Parameters<typeof actual.placePortal>) => {
            const [builder, spec, room, axis, c, at, width, height, frame] = args;
            calls.portal.push({ room, id: spec.id, width });
            const [x, z] = uvToWorld(axis === 'H' ? [at, c] : [c, at], frame);
            builder.module(`door-header-${spec.id}`, room, [x, height + spec.radius, z], [(width - 2 * spec.radius) / .5, 1, 1],
                -frame.angleDeg * Math.PI / 180 + (axis === 'V' ? -Math.PI / 2 : 0));
            return [];
        } };
});
vi.mock('../src/styles/systems/assembly.js', () => ({
    placeAssembly: (_builder: unknown, _floor: unknown, item: Furniture, spec: { type: string }): LightFixture[] => {
        calls.assembly.push({ item: item.id, type: spec.type });
        return [{ id: `${item.id}/lens`, kind: 'strip', room: item.room, position: [item.position[0], 1, item.position[1]], length: 1,
            angleDeg: 0, intensity: 120, colorTemperatureK: 3000, range: 2, beamDeg: 120, diffuse: .5, facing: 'down' }];
    },
}));
vi.mock('../src/styles/systems/housing.js', () => ({
    placeHousings: (ctx: { rooms: Room[] }, spec: { id: string }): LightFixture[] => {
        calls.housing.push({ id: spec.id, rooms: ctx.rooms.map(room => room.id) });
        return [];
    },
}));

/** A stand-in kind A: four styles whose markers, casings, lift surround, frontage, portal,
 *  fit and dress go through every registry the placements consult. */
vi.mock('../src/styles/ref-a/index.js', async () => {
    const { FINISH } = await import('../src/modules/finishes.js');
    const ids = ['e1', 'e2', 'e5', 'e6'] as const;
    const panel = (id: string): PanelSystem => ({ id, backing: id, pitch: [1], phase: 'grid', rows: 2, column: () => id, top: () => id,
        fill: id, seam: 0, minColumn: .2 });
    const style = (id: typeof ids[number], extra: Partial<StyleSpec> = {}): StyleSpec => ({
        id, kind: 'A', tier: 'high_rich',
        finish: (room, _floor, base) => ({ ...base, frame: undefined, field: `wall-field-${id}`, floor: `floor-slab-${id}`, ceiling: `ceiling-field-${id}`,
            casing: id, ...(id === 'e1' && room !== 'corridor' ? { portal: 'e1-arch' } : {}) }),
        ...extra,
    });
    const styles: StyleSpec[] = [
        style('e1', {
            entrance: 'damaged', lights: { plannedCoves: false, kelvin: 3100 }, housings: ['housing-e1-test'],
            fit: item => item.kind === 'sofa' ? 'fit-e1-sofa' : null,
            dress: ctx => {
                const room = ctx.rooms[0]!, [x, z] = room.polygon[0]!;
                const lens = ctx.builder.module('ceiling-cove-e1-dress', room.id, [x + .5, ctx.ceilingY - .1, z + .5], [1, 1, 1], 0);
                calls.dress.push({ style: 'e1', rooms: ctx.rooms.map(r => r.id) });
                return [{ id: lens.id, kind: 'strip', room: room.id, position: [x + .5, ctx.ceilingY - .1 + ctx.floor.elevation, z + .5], length: .5,
                    angleDeg: 0, intensity: 1, colorTemperatureK: 3000, range: 2, beamDeg: 120, diffuse: .5, facing: 'down' }];
            },
        }),
        style('e2', { lift: { jamb: 'lift-landing-jamb-e2', header: 'lift-landing-header-e2' }, frontage: 'wall-field-e2-frontage' }),
        style('e5'), style('e6'),
    ];
    const kind: KindExports = {
        kind: 'A', styles,
        panels: [...ids.map(id => panel(`wall-field-${id}`)), panel('wall-field-e2-frontage')],
        glazing: [],
        ceilings: ids.map(id => ({ id: `ceiling-field-${id}`, backing: `ceiling-field-${id}`, snapSpots: false,
            grid: { pitch: [.5, .5] as [number, number], block: `ceiling-field-${id}`, blockCells: [1, 1] as [number, number], joint: 0, phase: 'grid' as const } })),
        floors: ids.map(id => ({ id: `floor-slab-${id}`, support: `floor-slab-${id}`,
            tile: { size: [.5, .5] as [number, number], joint: 0, block: `floor-slab-${id}`, blockTiles: [1, 1] as [number, number], phase: 'grid' as const } })),
        portals: [{ id: 'e1-arch', radius: .25, band: .3, depth: [.2, .3], rooms: ['living', 'bedroom'], minWidth: .8, minHeight: 2,
            skin: { face: FINISH.ivory, reveal: FINISH.ivory, ret: FINISH.ivory } }],
        assemblies: { 'asm-e1-test': { type: 'custom', place: () => [] } },
        housings: [{ id: 'housing-e1-test', body: 'wall-field-e1', cap: 'wall-field-e1', over: 'doors', depth: .3, height: .3, minBottom: 2.1 }],
        recipes: [add => {
            for (const id of ids) {
                add(`wall-field-${id}`, k => k.cbox(FINISH.ivory, [0, 0, .0475], [.5, .5, .095]));
                add(`floor-slab-${id}`, k => k.cbox(FINISH.stone, [0, -.15, 0], [.5, .15, .5]));
                add(`ceiling-field-${id}`, k => k.cbox(FINISH.ivory, [0, 0, 0], [.5, .02, .5]));
                add(`door-jamb-${id}`, k => k.box(FINISH.dark, [-.04, 0, -.1], [.08, .5, .2]));
                add(`door-header-${id}`, k => k.box(FINISH.dark, [-.25, 0, -.1], [.5, .08, .2]));
                add(`ceiling-cove-${id}-grid`, k => k.cbox(FINISH.lensWarm, [0, -.01, 0], [.1, .01, .1]));
            }
            add('wall-field-e2-frontage', k => k.cbox(FINISH.dark, [0, 0, .0475], [.5, .5, .095]));
            add('lift-landing-jamb-e2', k => k.box(FINISH.dark, [-.05, 0, -.115], [.1, 2.2, .16]));
            add('lift-landing-header-e2', k => k.box(FINISH.dark, [-.65, 0, -.115], [1.3, .13, .16]));
            add('fit-e1-sofa', k => k.cbox(FINISH.dark, [0, 0, 0], [1.8, .8, .85]));
            add('ceiling-cove-e1-dress', k => k.cbox(FINISH.lensWarm, [0, 0, 0], [.4, .01, .1]));
        }],
    };
    return { kind };
});

/** A stand-in kind R: the office style glazes its private offices and meeting rooms. */
vi.mock('../src/styles/ref-r/index.js', async () => {
    const { FINISH } = await import('../src/modules/finishes.js');
    const kind: KindExports = {
        kind: 'R', panels: [], ceilings: [], floors: [], portals: [], assemblies: {}, housings: [],
        styles: [{ id: 'r1', kind: 'R', tier: 'rich', finish: (_room, _floor, base) => ({ ...base, glazing: 'r1-test-glass' }) }],
        glazing: [{ id: 'r1-test-glass', pitch: 1.2, mullion: { module: 'wall-meridian-glass-stile', width: .025 }, transoms: [],
            rooms: ['office_private', 'meeting', 'executive_office'], onto: ['corridor', 'office_open', 'elevator_lobby', 'reception'] }],
        recipes: [add => add('fit-r1-unused', k => k.cbox(FINISH.dark, [0, 0, 0], [.5, .5, .5]))],
    };
    return { kind };
});

const { generate } = await import('../src/placements/generate.js');
const { props } = await import('../src/placements/props.js');
const { PlacementBuilder } = await import('../src/placements/builder.js');
const { STYLES, PANELS, PORTALS, ASSEMBLIES, styleOf } = await import('../src/styles/reference/registry.js');
const { assembly } = await import('./fixtures.js');

const kindRequest = async (type: InteriorRequest['building']['type'], tier: InteriorRequest['building']['tier']): Promise<InteriorRequest> => {
    const base = await assembly('mirror-frame', { width: 24, depth: 32, floors: 3 });
    return { ...base, building: { ...base.building, id: `${type}-${tier}`, type, tier } };
};
const all = (result: PlacementResult): FloorPlacement[] => Object.values(result.layouts);
const styleOfId = (layout: FloorPlacement, room: string) => layout.floor.rooms.find(r => r.id === room)?.style;

describe('reference style dispatch', () => {
    let a: PlacementResult, r: PlacementResult;
    beforeAll(async () => {
        a = await generate(await kindRequest('residential', 'high_rich'));
        r = await generate(await kindRequest('offices', 'rich'));
    }, 180000);

    it('registers the stand-in kinds by their marker ids', () => {
        expect([...STYLES.keys()]).toEqual(expect.arrayContaining(['e1', 'e2', 'e5', 'e6', 'r1']));
        expect(PANELS.has('wall-field-e1')).toBe(true);
        expect(PORTALS.get('e1-arch')?.radius).toBe(.25);
        expect(ASSEMBLIES.get('asm-e1-test')?.type).toBe('custom');
        expect(styleOf({ style: 'e2' })?.frontage).toBe('wall-field-e2-frontage');
        expect(styleOf({})).toBeUndefined();
    });

    it('stamps every room of a kind building and publishes the kind', () => {
        expect(a.building.kind).toBe('A');
        expect(r.building.kind).toBe('R');
        for (const layout of all(a)) for (const room of layout.floor.rooms) expect(['e1', 'e2', 'e5']).toContain(room.style);
        for (const layout of all(r)) for (const room of layout.floor.rooms) expect(room.style).toBe('r1');
    });

    it('builds every face, floor and ceiling of a styled room through its systems, never a nine-slice frame', () => {
        const e1Rooms = new Set(all(a).flatMap(layout => layout.floor.rooms.filter(room => room.style === 'e1').map(room => room.id)));
        expect(e1Rooms.size).toBeGreaterThan(0);
        expect(calls.panel.some(call => call.id === 'wall-field-e1' && e1Rooms.has(call.room))).toBe(true);
        expect(calls.panel.every(call => call.ceilingY > 2 && call.height >= call.ceilingY - 1e-6)).toBe(true);
        expect(calls.floor.some(call => call.id === 'floor-slab-e1' && e1Rooms.has(call.room))).toBe(true);
        expect(calls.ceiling.some(call => call.id === 'ceiling-field-e1' && e1Rooms.has(call.room))).toBe(true);
        for (const layout of all(a)) {
            const styled = new Set(layout.floor.rooms.map(room => room.id));
            expect(layout.placements.filter(p => styled.has(p.room) && /^wall-panel-(corner|rail|stile)-/.test(p.module ?? ''))).toEqual([]);
            expect(layout.placements.some(p => p.module?.startsWith('wall-field-e'))).toBe(true);
        }
        // a common room lines the runs it shares with a dwelling in its frontage panels
        const corridors = new Set(all(a).flatMap(layout => layout.floor.rooms.filter(room => room.style === 'e2').map(room => room.id)));
        expect(calls.panel.some(call => call.id === 'wall-field-e2-frontage' && corridors.has(call.room))).toBe(true);
    });

    it('glazes an office through its glazing system', () => {
        expect(calls.glazing.length).toBeGreaterThan(0);
        expect(calls.glazing.every(call => call.id === 'r1-test-glass')).toBe(true);
    });

    it('puts every style lens record in before the rooms are balanced, and follows the style lights', () => {
        for (const layout of all(a)) {
            const lenses = layout.placements.filter(p => /^ceiling-cove-e1-(grid|dress)$/.test(p.module ?? ''));
            for (const lens of lenses) {
                const record = layout.floor.lights.find(light => light.id === lens.id);
                expect(record, lens.id).toBeDefined();
                // balanced: a ceiling record the style published at 1 lm now carries the room's share
                expect(record!.intensity).toBeGreaterThan(1);
            }
            for (const light of layout.floor.lights) {
                if (styleOfId(layout, light.room) !== 'e1' || light.furniture) continue;
                expect(light.kind === 'cove', `${light.id} planned cove`).toBe(false);
                if (light.kind === 'spot') expect(light.colorTemperatureK).toBe(3100);
            }
        }
        expect(calls.dress.length).toBeGreaterThan(0);
        expect(calls.housing.some(call => call.id === 'housing-e1-test' && call.rooms.length > 0)).toBe(true);
        expect(all(a).some(layout => layout.placements.some(p => p.module === 'ceiling-cove-e1-dress'))).toBe(true);
    });

    it('frames openings in the style casing and portal, the lifts in its surround, and fits its furniture', () => {
        expect(all(a).some(layout => layout.placements.some(p => p.module === 'door-jamb-e1'))).toBe(true);
        expect(calls.portal.some(call => call.id === 'e1-arch')).toBe(true);
        const upper = all(a).filter(layout => layout.floor.kind === 'apartment');
        expect(upper.length).toBeGreaterThan(0);
        for (const layout of upper) {
            expect(layout.placements.some(p => p.module === 'lift-landing-jamb-e2')).toBe(true);
            expect(layout.placements.some(p => p.module === 'lift-landing-header-e2')).toBe(true);
            expect(layout.placements.some(p => p.module === 'lift-landing-jamb')).toBe(false);
        }
        const sofas = all(a).flatMap(layout => layout.floor.furniture.filter(item => item.kind === 'sofa' && styleOfId(layout, item.room) === 'e1')
            .map(item => ({ item, placement: layout.placements.find(p => p.id === item.id) })));
        for (const { placement } of sofas) {
            expect(placement?.module).toBe('fit-e1-sofa');
            expect(placement?.scale).toEqual([1, 1, 1]);
        }
    });

    it('gives a dwelling the entrance kit its style names', () => {
        const entrances = a.building.floors.flatMap(floor => floor.apartmentEntrances ?? []);
        expect(entrances.length).toBeGreaterThan(0);
        for (const entrance of entrances) expect(entrance.leaves.every(part => !part.module.endsWith('-luxury'))).toBe(true);
    });
});

describe('assembly dispatch', () => {
    it('builds a piece naming an assembly as that assembly and keeps only its records', async () => {
        const request = await kindRequest('residential', 'high_rich');
        const room: Room = { id: 'r', kind: 'living', polygon: [[0, 0], [6, 0], [6, 5], [0, 5]], doors: [], style: 'e1' };
        const item: Furniture = { id: 'kitchen-1', kind: 'kitchen_block', room: 'r', position: [3, .4], rotationDeg: 0, size: [3.6, .65, 3], fit: 'asm-e1-test' };
        const floor = { floor: 1, kind: 'apartment', elevation: 3.6, height: 3.6, ceilingElevation: 6.7, coreAngleDeg: 0,
            core: { elevators: [], stairs: [], shafts: [] }, openingReservations: [], rooms: [room], furniture: [item],
            lights: [{ id: 'planned-under-cabinet', furniture: 'kitchen-1', kind: 'strip', room: 'r', position: [3, 5, .4], length: 2, angleDeg: 0,
                intensity: 300, colorTemperatureK: 3000, range: 2, beamDeg: 120, diffuse: .5, facing: 'down' }] } as const;
        const copy = structuredClone(floor) as unknown as Parameters<typeof props>[1];
        const uv = { outline: [], rooms: [{ id: 'r', kind: 'living' as const, rect: { u: 0, v: 0, lu: 6, lv: 5 }, doors: [] }], furniture: [], sealed: [], carpets: [] };
        props(new PlacementBuilder(), copy, uv as unknown as Parameters<typeof props>[2], 'luxury', { present: new Set(), missing: new Set() } as never, request);
        expect(calls.assembly).toContainEqual({ item: 'kitchen-1', type: 'custom' });
        expect(copy.furniture.map(f => f.id)).toEqual(['kitchen-1']);
        expect(copy.lights.map(light => [light.id, light.furniture])).toEqual([['kitchen-1/lens', 'kitchen-1']]);
    });
});
