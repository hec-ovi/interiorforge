import type { RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { glazingPreset } from '../systems/glazing.js';
import { floorPreset } from '../systems/floor-recipes.js';
import type { StyleSpec } from '../systems/types.js';
import { B_WARM } from './looks.js';

/** B2, the glass building's guest suite. Red fine-veined stone distinguishes its
 *  circulation from B3's timber; the bed dais keeps dark wood. Shared wall/ceiling
 *  pieces keep kind B's kit compact, and the suite adds its own bath
 *  screen: a bronze-framed glass partition with a frosted band between bath and bedroom. */

const bathScreen = glazingPreset('B-bath', 'b2', ['bathroom'], ['bedroom', 'living']);
const floor = floorPreset('A', 'b2', {
    system: { tile: { size: [1.5, 1.5], joint: .0025, block: 'floor-finish-b2-stone', blockTiles: [2, 2], phase: 'room' } },
    profile: { tile: 'cyberpunk/b2-floor/rich#red-stone' },
});

const WET: ReadonlySet<RoomKind> = new Set(['bathroom', 'toilets']);
const BED: ReadonlySet<RoomKind> = new Set(['bedroom', 'storage']);

export const b2Style: StyleSpec = {
    id: 'b2', kind: 'B', tier: 'rich',
    finish(room: RoomKind, _floorKind, base: RoomFinish): RoomFinish {
        const wet = WET.has(room), bed = BED.has(room);
        return { ...base, family: 'luxury', frame: undefined, band: undefined, services: undefined,
            field: wet || bed ? 'wall-field-b3-bed' : 'wall-field-b3',
            floor: wet ? 'floor-slab-b3-marble' : bed ? 'floor-slab-b3-plank' : floor.system.id,
            ceiling: 'ceiling-field-b3', ...(wet ? { glazing: bathScreen.system.id } : {}) };
    },
    lights: { plannedCoves: false, kelvin: B_WARM },
    entrance: 'luxury',
};

export const b2 = {
    styles: [b2Style],
    panels: [],
    floors: [floor.system],
    ceilings: [],
    glazing: [bathScreen.system],
    portals: [],
    recipes: [bathScreen.recipes, floor.recipes],
};
