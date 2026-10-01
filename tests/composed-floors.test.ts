import { describe, expect, it } from 'vitest';
import { generate } from '../src/index.js';
import type { FloorPlacement as FloorLayout, InteriorRequest } from '../src/index.js';
import { composedCore } from '../src/layout/composed/core.js';
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
