import { describe, expect, it } from 'vitest';
import { expandBuilding, generate } from '../src/index.js';
import type { FloorPlacement as FloorLayout, InteriorRequest } from '../src/index.js';
import { composedCore } from '../src/layout/composed/core.js';
import { GALLERY_RUN, ISLAND_HALF, galleryIslands } from '../src/layout/composed/kind-a.js';
import { officePlan } from '../src/layout/composed/compose.js';
import { resolveAssignments, validateRequest } from '../src/blueprint/validate.js';
import { duplexAssignments } from '../src/layout/duplex/assignments.js';
import { planBuilding } from '../src/layout/index.js';
import { assembly } from './fixtures.js';

/** Composed floors: a kind building on a plain rectangular plate is planned floor by floor
 *  from its kind's plans around one stair against a side wall and a lift core of two through
 *  cars, open floors closing only toilets, stores and plant rooms. */

const area = (ring: readonly (readonly number[])[]) => Math.abs(ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    return sum + p[0]! * q[1]! - q[0]! * p[1]!;
}, 0)) / 2;
const roomArea = (room: { polygon: number[][]; holes?: number[][][] }) =>
    area(room.polygon) - (room.holes ?? []).reduce((sum, hole) => sum + area(hole), 0);

/** The kit's assembly sets its ground floor back under an arcade; a composed building stands
 *  on one plate, so the fixture's ground takes the plate of the floors above it. */
const onePlate = (blueprint: InteriorRequest['blueprint'], architecture: string): InteriorRequest['blueprint'] => {
    const upper = blueprint.floors.find(f => f.index === 1)!;
    return { ...blueprint, assembly: { ...(blueprint.assembly as object), architecture },
        floors: blueprint.floors.map(f => f.index === 0 ? { ...f, outline: upper.outline,
            roomEnvelope: { ...upper.roomEnvelope!, vertical: f.roomEnvelope!.vertical } } : f) };
};
const base = await assembly('mirror-frame', { width: 40, depth: 40, floors: 8 });
const kindA: InteriorRequest = { ...base, seed: 'kind-a', building: { ...base.building, type: 'residential', tier: 'high_rich' },
    blueprint: onePlate(base.blueprint, 'mirror-frame') };
const result = await generate(kindA);
const layouts = result.layouts as Record<string, FloorLayout>;
const floorOf = (index: number) => layouts[result.building.floors.find(f => f.index === index)!.layout]!;

describe('composed kind A tower', () => {
    it('stands the stair against the left wall and the lift core of two through cars on the user\'s ground plan', () => {
        const core = composedCore(kindA.blueprint, kindA.building)!;
        expect(core.openPlan).toBe(true);
        expect(core.stairA.lu).toBeCloseTo(4.5);
        expect(core.stairA.lv).toBeCloseTo(10);
        expect(core.elevators.map(e => e.rect.lu).sort()).toEqual([3.5, 3.9]);
        const ground = floorOf(0);
        expect(ground.placements.filter(p => p.module === 'lift-car-through')).toHaveLength(2);
        // the ground's back hall is public, so both cars open there to the back as well
        expect(ground.placements.filter(p => p.module === 'lift-rear-doors')).toHaveLength(2);
        // a home floor keeps the back of the core closed: the cars open forward only
        expect(floorOf(1).placements.filter(p => p.module === 'lift-rear-doors')).toHaveLength(0);
    });

    it('plans the ground floor as the user drew it', () => {
        const rooms = floorOf(0).floor.rooms;
        const byRole = (id: string) => rooms.find(r => r.id === `f0-${id}`)!;
        expect(byRole('lobby').kind).toBe('elevator_lobby');
        for (const [id, kind] of [['mechanical', 'mechanical_room'], ['stores', 'storage'], ['meeting', 'meeting'], ['toilets', 'toilets'],
            ['small-lounge', 'lounge'], ['large-lounge', 'lounge']] as const) expect(byRole(id).kind).toBe(kind);
        // the lounges are 6 and 14 m wide and 12 m deep inside the plate (they reach the shell's face beyond it)
        expect(roomArea(byRole('small-lounge'))).toBeGreaterThan(6 * 12 - 1);
        expect(roomArea(byRole('large-lounge'))).toBeGreaterThan(14 * 12 - 1);
        const furniture = floorOf(0).floor.furniture;
        expect(furniture.filter(f => f.kind === 'stool' && f.room === 'f0-lobby').length).toBeGreaterThanOrEqual(8);
        expect(furniture.some(f => f.kind === 'reception_desk' && f.room === 'f0-lobby')).toBe(true);
    });

    it('tiles every floor with rooms and the core, with no leftover strip', () => {
        for (const layout of Object.values(layouts)) {
            if (layout.floor.kind === 'roof' as never) continue;
            const rooms = layout.floor.rooms;
            const shafts = layout.floor.core.shafts.reduce((sum, s) => sum + s.w * s.d, 0);
            const total = rooms.reduce((sum, room) => sum + roomArea(room as never), 0) + shafts;
            // the rooms reach the shell's inner face; the stair, published as its shaft, stands
            // against the facade with its own wall reaching the face beside its 10 m run
            const xs = rooms.flatMap(r => r.polygon.map(p => p[0]!)), zs = rooms.flatMap(r => r.polygon.map(p => p[1]!));
            const plate = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
            const stair = rooms.find(r => r.id === 'stair-a')!.polygon.map(p => p[0]!);
            const reach = Math.min(Math.max(...xs) - Math.max(...stair), Math.min(...stair) - Math.min(...xs)) * 10;
            expect(Math.abs(total + reach - plate)).toBeLessThan(1);
        }
    });

    it('turns the home floors through three arrangements of loft homes and crowns the tower with two penthouses', () => {
        const homes = [1, 2, 3].map(i => floorOf(i));
        expect(new Set(homes.map(h => JSON.stringify(h.floor.rooms.map(r => r.polygon)))).size).toBe(3);
        for (const home of homes) {
            const lofts = home.floor.rooms.filter(r => r.kind === 'studio_main');
            expect(lofts.length).toBeGreaterThanOrEqual(3);
            // every home is one open loft with closed bathrooms only
            for (const loft of lofts) expect(home.floor.rooms.filter(r => r.unit === loft.unit && r.kind !== 'bathroom' && r !== loft)).toHaveLength(0);
            expect(home.floor.furniture.filter(f => f.fit === 'asm-e1-kitchen').length).toBeGreaterThanOrEqual(lofts.length);
        }
        const crown = floorOf(7).floor.rooms.filter(r => r.kind === 'studio_main');
        expect(crown).toHaveLength(2);
        expect(result.building.floors.find(f => f.index === 1)!.apartmentEntrances?.length).toBeGreaterThanOrEqual(3);
    });
});

const exteriorKit = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
const whiteGrid = exteriorKit.planAssembly({ buildingId: 'white-grid', family: 'white-grid', seed: 'interior-proof', lot: { width: 40, depth: 40 }, floors: 8 }).blueprint;
const offices: InteriorRequest = {
    seed: 'kind-r', materialTheme: 'cyberpunk', building: { id: 'white-grid', type: 'offices', tier: 'rich' },
    blueprint: (() => {
        const one = onePlate(whiteGrid, 'white-grid');
        return { ...one, floors: one.floors.map(f => ({ ...f, kind: f.index === 0 ? 'lobby' : 'offices' })) };
    })(),
};
const officeResult = await generate(offices);
const officeLayouts = officeResult.building.floors.filter(f => f.index > 0).map(f => (officeResult.layouts as Record<string, FloorLayout>)[f.layout]!)
    .filter(l => l.floor.kind === 'office');

describe('composed offices', () => {
    it('turns the office floors through four plan types', () => {
        expect(composedCore(offices.blueprint, offices.building)).not.toBeNull();
        const plans = new Set(officeLayouts.map(l => l.floor.rooms.filter(r => r.kind !== 'corridor').map(r => r.id.replace(/^f\d+-/, '')).sort().join(',')));
        expect(plans.size).toBeGreaterThanOrEqual(3);
        for (const layout of officeLayouts) {
            const rooms = layout.floor.rooms;
            // only the toilets and the service room close; meeting rooms are glass islands
            expect(rooms.filter(r => ['toilets', 'storage'].includes(r.kind))).toHaveLength(2);
            expect(rooms.filter(r => r.kind === 'office_private')).toHaveLength(0);
        }
        expect(officeLayouts.some(l => l.floor.rooms.filter(r => r.kind === 'meeting').length >= 3)).toBe(true);
        expect(officeLayouts.some(l => l.floor.rooms.some(r => r.kind === 'executive_office'))).toBe(true);
        expect(officeLayouts.some(l => l.floor.furniture.filter(f => f.kind === 'stool').length >= 8)).toBe(true);
    });
});

describe('composed kind C block', () => {
    it('packs a home floor as a poor block: back homes, studios between the gallery and a corridor, homes on the facade', () => {
        const request = validateRequest({ ...base, seed: 'kind-c', building: { ...base.building, type: 'residential', tier: 'poor' },
            blueprint: onePlate(base.blueprint, 'mirror-frame') });
        expect(composedCore(request.blueprint, request.building)).not.toBeNull();
        const { assignments } = duplexAssignments(request, resolveAssignments(request));
        const floor = planBuilding(request, assignments, new Set([1])).floors.find(f => f.floor === 1)!;
        const homes = floor.rooms.filter(r => r.kind === 'studio_main');
        expect(homes.length).toBeGreaterThanOrEqual(14);
        for (const home of homes) {
            // small homes, each round its own wet cell
            expect(roomArea(home as never)).toBeLessThan(110);
            expect(floor.rooms.some(r => r.kind === 'bathroom' && r.unit === home.unit)).toBe(true);
        }
        // one common gallery reaches them all; nothing else on the floor is public
        expect(floor.rooms.filter(r => r.kind === 'elevator_lobby')).toHaveLength(1);
    }, 240000);
});

describe('composed galleries', () => {
    it('breaks a gallery longer than 20 m with islands, so no straight run is over 20 m and none stands before the lifts', () => {
        for (const [end, keepFrom, keepTo] of [[42, 16.95, 25.25], [46, 18.95, 26.95], [56, 23.95, 31.95], [30, 9.95, 18.25], [22.45, 12.95, 20.95]] as const) {
            const islands = galleryIslands(end, keepFrom, keepTo);
            const stops = [0, ...islands.flatMap(u => [u - ISLAND_HALF, u + ISLAND_HALF]), end];
            for (let i = 0; i + 1 < stops.length; i += 2) expect(stops[i + 1]! - stops[i]!).toBeLessThanOrEqual(GALLERY_RUN + .5);
            for (const u of islands) expect(u + ISLAND_HALF <= keepFrom || u - ISLAND_HALF >= keepTo).toBe(true);
        }
    });

    it('stands the islands on a wide plate\'s home floor gallery', async () => {
        const wide = await assembly('mirror-frame', { width: 48, depth: 48, floors: 4 });
        const request = validateRequest({ ...wide, seed: 'kind-a-wide', building: { ...wide.building, type: 'residential', tier: 'high_rich' },
            blueprint: onePlate(wide.blueprint, 'mirror-frame') });
        const { assignments } = duplexAssignments(request, resolveAssignments(request));
        const floor = planBuilding(request, assignments, new Set([1])).floors.find(f => f.floor === 1)!;
        const gallery = floor.rooms.find(r => r.id === 'f1-gallery')!;
        const islands = floor.furniture.filter(f => f.room === gallery.id && f.fit === 'asm-e1-bamboo');
        expect(islands.length).toBeGreaterThanOrEqual(2);
    }, 240000);
});

describe('composed office plans across buildings', () => {
    it('turns each building through all four office types in an order and variant of its own', () => {
        const plans = new Map<string, string>();
        for (let n = 0; n < 64; n++) {
            const seed = `city:p${n}`;
            const floors = [1, 2, 3, 4].map(i => officePlan(seed, i));
            expect(new Set(floors.map(f => f.type)).size).toBe(4);
            plans.set(seed, floors.map(f => `${f.type}${f.pods}${f.rooms}`).join(' '));
        }
        // many orders and every variant appear across a street of buildings
        expect(new Set(plans.values()).size).toBeGreaterThan(30);
        // and neighbours rarely show the same plan at a level: well under one level in four
        let same = 0, levels = 0;
        for (let n = 0; n + 1 < 64; n++) for (let i = 1; i <= 4; i++) {
            const a = officePlan(`city:p${n}`, i), b = officePlan(`city:p${n + 1}`, i);
            levels++; if (a.type === b.type && a.pods === b.pods && a.rooms === b.rooms) same++;
        }
        expect(same / levels).toBeLessThan(.15);
    });
});

describe('composed kind B two-storey loft', () => {
    it('stands Apartment 1702 on its first two home floors, the stair against its party wall up to a mezzanine over a double-height lounge', async () => {
        const glass = await assembly('mirror-shutters', { width: 40, depth: 40, floors: 8 });
        const request: InteriorRequest = { ...glass, seed: 'kind-b', building: { ...glass.building, type: 'residential', tier: 'rich' },
            blueprint: onePlate(glass.blueprint, 'mirror-shutters') };
        expect(composedCore(request.blueprint, request.building)).not.toBeNull();
        const built = await generate(request);
        const layoutOf = (index: number) => (built.layouts as Record<string, FloorLayout>)[built.building.floors.find(f => f.index === index)!.layout]!;
        const [lower] = layoutOf(1).floor.duplexes ?? [], [upper] = layoutOf(2).floor.duplexes ?? [];
        expect(lower?.level).toBe('lower');
        expect(upper?.level).toBe('upper');
        expect(lower!.id).toBe(upper!.id);
        // the stair stands against a side wall of the loft, the lounge open through both storeys
        expect(['low', 'high']).toContain(lower!.stairWall);
        const side = (ring: number[][]) => Math.min(...ring.map(p => Math.min(...lower!.footprint.map(q => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!)))));
        expect(side(lower!.stairOpening)).toBeLessThan(lower!.depth);
        expect(lower!.area.loungeVoid).toBeGreaterThanOrEqual(30);
        // the upper storey is the loft's own: bedroom, bathroom, dressing and study off its gallery
        const kinds = layoutOf(2).floor.rooms.filter(r => r.unit === upper!.unit).map(r => r.kind);
        for (const kind of ['bedroom', 'bathroom', 'corridor', 'office_private']) expect(kinds).toContain(kind);
        // its living is furnished as one plan: the lounge on the windows, dining, a screen, books under the mezzanine
        const living = layoutOf(1).floor.furniture.filter(f => f.room.endsWith('-lower-living'));
        for (const kind of ['sofa', 'low_table', 'dining_table', 'display_screen', 'shelf']) expect(living.some(f => f.kind === kind), kind).toBe(true);
        // people climb it: the loft's stair joins its two floors in the building's navigation
        const nav = expandBuilding(built).npc.nav;
        expect(nav.connectors.some(c => c.id === lower!.id && c.floors.includes(1) && c.floors.includes(2))).toBe(true);
    }, 300000);
});
