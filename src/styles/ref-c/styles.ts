import type { FloorKind, Furniture, Room, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { capsuleFurnitureFor } from '../capsule/furniture.js';
import type { CapsuleProfile } from '../capsule/profile.js';
import type { StyleSpec } from '../systems/types.js';
import { dressCapsuleHome, dressPublic, dressStudio } from './dress.js';

/** The seven styles of kind C, the poor building of capsule homes:
 *  - c1 the H10 capsule home: ivory capsule plates, dark cassettes, dark hex floor, a
 *    rounded bathroom portal, the H10 niche, wardrobe, curved sofa and kitchen;
 *  - c7 the Japantown compact home: warm cream plates, tiled wet recesses and kitchen floor,
 *    the Japantown niche, sliding wardrobe and hooded kitchen, AC units over doors;
 *  - c2 corridors, stairs and landings: worn paint over a petrol dado, worn cassettes,
 *    worn tiles, ducts along the partitions, trunk bays, wall lamps and landing banks;
 *  - c3 the ground's atrium and recreation rooms in the public finish with a cornice;
 *  - c4 the public restroom and c5 the machine rooms: dark teal service paint;
 *  - c6 the small studio: the molded lodging shell of the worn homes.
 *  Poor rooms keep planned coves off; furniture lenses stay on the capsule niches only. */

const DRY: ReadonlySet<RoomKind> = new Set(['living', 'studio_main', 'bedroom', 'kitchen', 'storage', 'office_private', 'dining_area']);
const WET: ReadonlySet<RoomKind> = new Set(['bathroom', 'toilets', 'locker_room']);
const SERVICE: ReadonlySet<RoomKind> = new Set(['mechanical_room', 'storage', 'parking_area']);

/** A capsule identity's module for a piece, when the piece's reservation is that module's
 *  own size (a fitted module always stands at scale 1); otherwise the family chain. */
function capsuleFit(profile: CapsuleProfile) {
    return (item: Furniture): string | null => {
        const fit = capsuleFurnitureFor(item.kind, profile);
        if (!fit) return null;
        const same = fit.size.every((v, i) => Math.abs(v - item.size[i]!) < .06);
        return same ? fit.module : null;
    };
}

const home = (base: RoomFinish, field: string, floor: string, ceiling: string): RoomFinish =>
    ({ ...base, field, floor, ceiling, frame: undefined, band: undefined, services: undefined });

const c1: StyleSpec = {
    id: 'c1', kind: 'C', tier: 'poor',
    finish(room, _floorKind: FloorKind, base) {
        if (WET.has(room)) return { ...home(base, 'wall-field-c1', 'floor-slab-capsule-japantown-wet', 'ceiling-field-c1'), portal: 'c1-bath' };
        const finish = home(base, 'wall-field-c1', 'floor-slab-c1', 'ceiling-field-c1');
        return DRY.has(room) ? { ...finish, portal: 'c1-bath' } : finish;
    },
    fit: capsuleFit('h10'),
    lights: { plannedCoves: false, kelvin: 3600 },
    entrance: 'capsule',
    housings: ['housing-c1-beam'],
    dress: ctx => dressCapsuleHome(ctx, 'h10'),
};

const c7: StyleSpec = {
    id: 'c7', kind: 'C', tier: 'poor',
    finish(room, _floorKind: FloorKind, base) {
        if (WET.has(room)) return home(base, 'wall-field-capsule-japantown-wet', 'floor-slab-capsule-japantown-wet', 'ceiling-field-c1');
        if (room === 'kitchen') return home(base, 'wall-field-c7', 'floor-slab-capsule-japantown-wet', 'ceiling-field-c1');
        return home(base, 'wall-field-c7', 'floor-slab-c7', 'ceiling-field-c1');
    },
    fit: capsuleFit('japantown'),
    lights: { plannedCoves: false, kelvin: 4200 },
    entrance: 'capsule',
    housings: ['housing-c7-duct', 'housing-c7-ac'],
    dress: ctx => dressCapsuleHome(ctx, 'japantown'),
};

const publicFinish = (base: RoomFinish, field: string, floor = 'floor-slab-damaged', ceiling = 'ceiling-field-c2'): RoomFinish =>
    ({ ...base, field, floor, ceiling, frame: undefined, band: undefined, services: undefined });

const c2: StyleSpec = {
    id: 'c2', kind: 'C', tier: 'poor',
    finish(room, _floorKind: FloorKind, base) {
        if (WET.has(room)) return publicFinish(base, 'wall-panel-c4-paint', 'floor-slab-c4');
        if (SERVICE.has(room)) return publicFinish(base, 'wall-panel-c4-paint');
        return publicFinish(base, 'wall-field-c2');
    },
    lights: { plannedCoves: false, kelvin: 3100 },
    housings: ['housing-c2-duct'],
    dress: ctx => dressPublic(ctx, 'c2'),
};

const c3: StyleSpec = {
    id: 'c3', kind: 'C', tier: 'poor',
    finish(room, _floorKind: FloorKind, base) {
        if (WET.has(room)) return publicFinish(base, 'wall-panel-c4-paint', 'floor-slab-c4');
        return publicFinish(base, 'wall-field-c2');
    },
    lights: { plannedCoves: false, kelvin: 3300 },
    dress: ctx => dressPublic(ctx, 'c3'),
};

const c4: StyleSpec = {
    id: 'c4', kind: 'C', tier: 'poor',
    finish: (_room, _floorKind, base) => publicFinish(base, 'wall-panel-c4-paint', 'floor-slab-c4'),
    fit: item => item.kind === 'urinal' ? 'fit-c4-urinal' : null,
    lights: { plannedCoves: false, kelvin: 5200 },
};

const c5: StyleSpec = {
    id: 'c5', kind: 'C', tier: 'poor',
    finish: (_room, _floorKind, base) => publicFinish(base, 'wall-panel-c4-paint'),
    lights: { plannedCoves: false, kelvin: 5600 },
    housings: ['housing-c2-duct'],
};

/** The worn studio keeps the damaged family's molded lodging shell (its dresser adds the
 *  skirting, sparse joints and vented header), under the public cassettes. */
const c6: StyleSpec = {
    id: 'c6', kind: 'C', tier: 'poor',
    finish(room, _floorKind: FloorKind, base) {
        if (WET.has(room)) return { ...base, field: 'wall-field-damaged-wet', floor: 'floor-slab-c4', ceiling: 'ceiling-field-c2', frame: undefined, band: undefined };
        return { ...base, field: 'wall-field-damaged-lodging', floor: 'floor-slab-c7', ceiling: 'ceiling-field-c2', frame: undefined, band: undefined };
    },
    lights: { plannedCoves: false, kelvin: 2700, color: [1, .42, .78] },
    entrance: 'damaged',
    dress: dressStudio,
};

export const STYLES_C: StyleSpec[] = [c1, c7, c2, c3, c4, c5, c6];

/** Styles whose look comes whole from their own finish, fits and dress, which the damaged
 *  family's room dresser leaves alone. */
export const CAPSULE_STYLES: ReadonlySet<string> = new Set(['c1', 'c7']);

export type { Room };
