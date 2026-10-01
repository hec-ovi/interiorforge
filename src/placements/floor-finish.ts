import type { BuildingType, FloorKind, RoomKind } from '../core/types.js';

const WET = new Set<RoomKind>(['bathroom', 'toilets', 'locker_room']);
const SERVICE = new Set<RoomKind>(['storage', 'mechanical_room', 'parking_area']);
const OFFICE = new Set<RoomKind>(['office_open', 'office_private', 'executive_office', 'meeting']);
const FOOD = new Set<RoomKind>(['kitchen', 'counter_area']);
const DINING = new Set<RoomKind>(['dining_area', 'bar', 'lounge']);

/** Floor roles survive the exterior palette. These are published module choices;
 *  a reference style can still replace them with its own complete floor system. */
export function luxuryFloor(room: RoomKind, floorKind: FloorKind, buildingType?: BuildingType): string {
    if (WET.has(room)) return 'floor-slab-marble';
    if (SERVICE.has(room)) return 'floor-slab-industrial';
    // The clinical work floor is independent from the facade palette, including
    // rooms the generic office program calls a meeting room or private office.
    if (buildingType === 'clinic' || buildingType === 'hospital') return 'floor-slab-clinic-resilient';
    if (OFFICE.has(room)) return 'floor-slab-corporate-carpet';
    if (FOOD.has(room) || room === 'terrace_open' || room === 'sales_floor') return 'floor-slab-stone';
    if (DINING.has(room) && (floorKind === 'coffee_shop' || floorKind === 'restaurant')) return 'floor-slab-plank';
    if (room === 'bedroom') return 'floor-slab-plank';
    if (room === 'living' || room === 'studio_main') return 'floor-slab-luxury-polished';
    if (room === 'gym_floor') return 'floor-slab-capsule';
    return 'floor-slab-meridian-stone';
}
