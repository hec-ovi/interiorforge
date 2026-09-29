import type { FloorKind, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { FINISH as F } from '../../modules/finishes.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import type { StyleSpec } from '../systems/types.js';

/** E5, the tower's ground lobby: broad mineral stone panels (the Meridian mineral field, up to
 *  2 m wide over its skirting), dark polished stone in 2 m squares whose joints show bronze,
 *  and a ceiling of dark gloss 1.5 m cells. */
export const E5 = {
    ceiling: { cell: 1.5 },
    floor: { tile: 2, joint: .004 },
} as const;

export const E5_FLOOR = floorPreset('A', 'e5', {
    system: { tile: { size: [E5.floor.tile, E5.floor.tile], joint: E5.floor.joint, block: 'floor-finish-e5-stone', blockTiles: [1, 1], phase: 'grid' } },
    profile: { tile: 'cyberpunk/corpo-plaza-stone/rich#polished', support: F.bronze },
});

const GLOSS = 'cyberpunk/gutierrez-lacquer/rich#ink';
const WALNUT = 'cyberpunk/corpo-plaza-veneer/rich#walnut';

export const E5_CEILING = ceilingPreset('B', 'e5', {
    system: { grid: { pitch: [E5.ceiling.cell, E5.ceiling.cell], block: 'ceiling-e5-grid15', blockCells: [2, 2], joint: .006, phase: 'room-centre' },
        // The dropped walnut ring waits for the ceiling system to keep its rings off a room's
        // stair voids: along a lobby's open stair it hung into the flight's headroom.
        steps: [],
        // the ground floor's stairwells wear this ceiling: their planned lights stay put
        snapSpots: false },
    profile: { panel: GLOSS, backing: F.black, bevel: .003, step: WALNUT },
});

const LOBBY: ReadonlySet<RoomKind> = new Set(['reception', 'lounge', 'bar', 'dining_area', 'corridor', 'elevator_lobby', 'concourse', 'counter_area']);

export const E5_STYLE: StyleSpec = {
    id: 'e5', kind: 'A', tier: 'high_rich',
    finish(kind: RoomKind, _floorKind: FloorKind, base: RoomFinish): RoomFinish {
        const { frame: _frame, band: _band, services: _services, ...plain } = base;
        if (!LOBBY.has(kind)) return plain;
        return { ...plain, family: 'luxury', field: 'wall-field-meridian-mineral', floor: E5_FLOOR.system.id, ceiling: E5_CEILING.system.id };
    },
    lights: { plannedCoves: false, kelvin: 2900 },
    lift: { jamb: 'lift-landing-jamb-e2', header: 'lift-landing-header-e2' },
};
