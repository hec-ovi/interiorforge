import type { RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import { glazingPreset } from '../systems/glazing.js';
import { panelPreset } from '../systems/panel-recipes.js';
import { portalsWithLayers } from '../systems/reference-portals.js';
import type { StyleSpec } from '../systems/types.js';
import { B_LOOK, B_WARM } from './looks.js';

/** B2, the glass building's guest suite: warm walnut screen panels in 0.5 m boards with
 *  deep joints, a black reveal at the ceiling; walnut planks; a walnut ceiling inside a
 *  dropped ring with a warm up-light; the bath behind a bronze-framed screen with a frosted
 *  band, entered through a small-radius timber portal; white marble in the bath. */

const wall = panelPreset('B', 'b2', {
    system: { pitch: [.5], rows: 2.1, seam: .012, head: { height: .06, module: 'wall-panel-b2-backing' }, minColumn: .2 },
    profile: { skin: B_LOOK.walnut, backing: B_LOOK.black, seams: [] },
});
const wetWall = panelPreset('B', 'b2-wet', {
    system: { pitch: [1.2], rows: 2.1, seam: .004, head: { height: .06, module: 'wall-panel-b2-wet-backing' }, minColumn: .3 },
    profile: { skin: B_LOOK.stone, backing: B_LOOK.bronze, seams: [] },
});
const floor = floorPreset('B-plank', 'b2', { profile: { tile: B_LOOK.walnut } });
const wetFloor = floorPreset('B', 'b2-marble', {
    system: { tile: { size: [1.2, 1.2], joint: .002, block: 'floor-finish-b2-marble-slab', blockTiles: [2, 2], phase: 'room' }, border: undefined },
    profile: { tile: B_LOOK.marble },
});
const ceiling = ceilingPreset('B', 'b2', { profile: { panel: B_LOOK.walnut, backing: B_LOOK.black, step: B_LOOK.walnut } });
const bathScreen = glazingPreset('B-bath', 'b2', ['bathroom'], ['bedroom', 'living']);
const PORTALS = portalsWithLayers('b2-bath');

const WET: ReadonlySet<RoomKind> = new Set(['bathroom', 'toilets']);

export const b2Style: StyleSpec = {
    id: 'b2', kind: 'B', tier: 'rich',
    finish(room: RoomKind, _floorKind, base: RoomFinish): RoomFinish {
        const wet = WET.has(room);
        return { ...base, family: 'luxury', frame: undefined, band: undefined, services: undefined,
            field: wet ? wetWall.system.id : wall.system.id, floor: wet ? wetFloor.system.id : floor.system.id,
            ceiling: ceiling.system.id, ...(wet ? { glazing: bathScreen.system.id, portal: 'b2-bath' } : { portal: 'b2-bath' }) };
    },
    lights: { plannedCoves: false, kelvin: B_WARM },
    entrance: 'luxury',
};

export const b2 = {
    styles: [b2Style],
    panels: [wall.system, wetWall.system],
    floors: [floor.system, wetFloor.system],
    ceilings: [ceiling.system],
    glazing: [bathScreen.system],
    portals: PORTALS,
    recipes: [wall.recipes, wetWall.recipes, floor.recipes, wetFloor.recipes, ceiling.recipes, bathScreen.recipes],
};
