import type { RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import type { LevelProfile } from '../systems/levels.js';
import { panelPreset } from '../systems/panel-recipes.js';
import type { StyleSpec } from '../systems/types.js';
import { B_LOOK, B_WARM } from './looks.js';

/** B1, the glass building's public rooms (the split lobby, its lounges, every floor's
 *  corridor and stairwells): polished stone to 1.2 m under a bronze course with warm walnut
 *  above in 1.5 m bays and a black skirting; honed stone floor in 2 × 1 m slabs inside a
 *  pale border with a bronze inlay; a walnut ceiling inside a dropped ring with a warm
 *  up-light; the upper lounge on a raised zone behind a glass guard with one flight. */

const wall = panelPreset('B-stone', 'b1', { system: { foot: null } });
const floor = floorPreset('B', 'b1', { system: { tile: { size: [2, 1], joint: .003, block: 'floor-finish-b1-stone', blockTiles: [1, 2], phase: 'grid' },
    border: { width: .45, module: 'floor-finish-b1-border', inlay: { width: .012, module: 'floor-finish-b1-inlay' } } } });
const ceiling = ceilingPreset('B', 'b1', { system: { steps: [], grid: { pitch: [1.5, 1.5], block: 'ceiling-b1-grid15', blockCells: [1, 1], joint: .006, phase: 'room-centre' } }, profile: { panel: B_LOOK.walnut, backing: B_LOOK.black, step: B_LOOK.walnut } });

/** The lobby's level look, for when a b1 template carries a split level (drawn then). */
export const B1_LEVEL: LevelProfile = {
    top: B_LOOK.honed, riser: B_LOOK.stone, nosing: B_LOOK.bronze,
    guard: { glass: B_LOOK.glass, cap: B_LOOK.bronze },
};

/** Rooms that wear the lobby look; offices, kitchens and services behind it keep the family's. */
const PUBLIC: ReadonlySet<RoomKind> = new Set(['reception', 'lounge', 'corridor', 'elevator_lobby', 'concourse']);

export const b1Style: StyleSpec = {
    id: 'b1', kind: 'B', tier: 'rich',
    finish(room: RoomKind, _floorKind, base: RoomFinish): RoomFinish {
        if (!PUBLIC.has(room)) return base;
        return { ...base, family: 'luxury', frame: undefined, band: undefined, services: undefined,
            field: wall.system.id, floor: floor.system.id, ceiling: ceiling.system.id };
    },
    lights: { plannedCoves: false, kelvin: B_WARM },
};

export const b1 = {
    styles: [b1Style],
    panels: [wall.system],
    floors: [floor.system],
    ceilings: [ceiling.system],
    recipes: [wall.recipes, floor.recipes, ceiling.recipes],
};
