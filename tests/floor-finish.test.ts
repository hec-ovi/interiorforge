import { describe, expect, it } from 'vitest';
import type { InteriorRequest, RoomKind } from '../src/core/types.js';
import { architectureFinish, INTERIOR_RECIPES } from '../src/architecture/recipes.js';
import { makePlacementFixture } from '../src/blueprint/placement-fixture.js';
import { roomFinish } from '../src/placements/finish.js';
import { luxuryRugForRoom } from '../src/styles/luxury/rugs.js';

function requestFor(architecture: string): InteriorRequest {
    const request = makePlacementFixture({ width: 24, depth: 40, floors: 3, type: 'residential', tier: 'rich', seed: 11 });
    return { ...request, blueprint: { ...request.blueprint, assembly: { architecture } } };
}

describe('room floor selection', () => {
    it('selects the existing ivory rug for E1 private rooms without changing other styles', () => {
        for (const room of ['living', 'bedroom', 'studio_main'] as const) {
            expect(luxuryRugForRoom(room, 'e1')).toBe('floor-rug-biotechnica');
            expect(luxuryRugForRoom(room, 'b3')).toBe('floor-rug-corpo');
            expect(luxuryRugForRoom(room)).toBe('floor-rug-corpo');
        }
        expect(luxuryRugForRoom('reception', 'e2')).toBe('floor-rug-biotechnica');
    });

    it('keeps domestic, wet, work and service floor roles through every exterior palette', () => {
        const rooms: RoomKind[] = ['living', 'bedroom', 'kitchen', 'bathroom', 'meeting', 'storage'];
        const expected = ['floor-slab-luxury-polished', 'floor-slab-plank', 'floor-slab-stone',
            'floor-slab-marble', 'floor-slab-corporate-carpet', 'floor-slab-industrial'];
        for (const { id: architecture } of INTERIOR_RECIPES) {
            const request = requestFor(architecture);
            const floors = rooms.map(room => architectureFinish(request, 'luxury', room,
                roomFinish('luxury', room, 'apartment', request.building.type)).floor);
            expect(floors, architecture).toEqual(expected);
        }
    });

    it('keeps clinical work rooms washable and separates cafe seating from its kitchen and storage', () => {
        for (const buildingType of ['clinic', 'hospital'] as const) {
            for (const room of ['reception', 'corridor', 'office_private', 'office_open', 'meeting'] as const)
                expect(roomFinish('luxury', room, 'office', buildingType).floor).toBe('floor-slab-clinic-resilient');
            expect(roomFinish('luxury', 'storage', 'office', buildingType).floor).toBe('floor-slab-industrial');
            expect(roomFinish('luxury', 'toilets', 'office', buildingType).floor).toBe('floor-slab-marble');
        }
        expect(['dining_area', 'kitchen', 'storage', 'toilets'].map(room =>
            roomFinish('luxury', room as RoomKind, 'coffee_shop', 'coffee_shop').floor)).toEqual([
            'floor-slab-plank', 'floor-slab-stone', 'floor-slab-industrial', 'floor-slab-marble',
        ]);
    });

    it('leaves a registered reference finish intact, including an authored floor module', () => {
        const base = { ...roomFinish('luxury', 'living', 'apartment'), floor: 'floor-slab-e1-lounge' };
        const request = requestFor('mirror-frame');
        expect(architectureFinish(request, 'luxury', 'living', base, true)).toBe(base);
    });
});
