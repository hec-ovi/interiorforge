import type { RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { glazingPreset } from '../systems/glazing.js';
import type { StyleSpec } from '../systems/types.js';
import { B_WARM } from './looks.js';

/** B2, the glass building's guest suite. It wears the b3 apartment's surfaces (smoked
 *  walnut fields with gold joints, walnut planks, the glossy ceiling ring, charcoal and
 *  marble in the bath), which keeps kind B's kit inside its budget, and adds its own bath
 *  screen: a bronze-framed glass partition with a frosted band between bath and bedroom. */

const bathScreen = glazingPreset('B-bath', 'b2', ['bathroom'], ['bedroom', 'living']);

const WET: ReadonlySet<RoomKind> = new Set(['bathroom', 'toilets']);
const BED: ReadonlySet<RoomKind> = new Set(['bedroom', 'storage']);

export const b2Style: StyleSpec = {
    id: 'b2', kind: 'B', tier: 'rich',
    finish(room: RoomKind, _floorKind, base: RoomFinish): RoomFinish {
        const wet = WET.has(room), bed = BED.has(room);
        return { ...base, family: 'luxury', frame: undefined, band: undefined, services: undefined,
            field: wet || bed ? 'wall-field-b3-bed' : 'wall-field-b3',
            floor: wet ? 'floor-slab-b3-marble' : bed ? 'floor-slab-b3-plank' : 'floor-slab-b3',
            ceiling: 'ceiling-field-b3', ...(wet ? { glazing: bathScreen.system.id } : {}) };
    },
    lights: { plannedCoves: false, kelvin: B_WARM },
    entrance: 'luxury',
};

export const b2 = {
    styles: [b2Style],
    panels: [],
    floors: [],
    ceilings: [],
    glazing: [bathScreen.system],
    portals: [],
    recipes: [bathScreen.recipes],
};
