import type { FloorKind, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { FINISH as F } from '../../modules/finishes.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import { panelPreset } from '../systems/panel-recipes.js';
import type { StyleSpec } from '../systems/types.js';

/** E5, the tower's ground lobby: broad mineral stone panels on 2 m over a black foot with
 *  a red floor line, a dark ceiling inside a dropped timber ring with a warm up-light, and
 *  dark polished stone in 2 m squares whose joints show bronze. */
export const E5 = {
    wall: { pitch: 2, seam: .004, rows: 2.4, foot: .06 },
    floor: { tile: 2, joint: .004 },
    ceiling: { cell: 1.5, ring: .6, drop: .2 },
    red: [1, .035, .022] as [number, number, number],
} as const;

const MINERAL = 'cyberpunk/meridian-wall-mineral/rich#field';
const DARK_STONE = 'cyberpunk/corpo-plaza-stone/rich#polished';
const GLOSS = 'cyberpunk/gutierrez-lacquer/rich#ink';
const WALNUT = 'cyberpunk/corpo-plaza-veneer/rich#walnut';

export const E5_PANEL = panelPreset('R', 'e5', {
    system: { pitch: [E5.wall.pitch], seam: E5.wall.seam, rows: E5.wall.rows, minColumn: .5,
        head: { height: .03, module: 'wall-panel-e5-backing' }, foot: { height: E5.wall.foot, module: 'wall-panel-e5-foot' },
        litJoints: [{ module: 'wall-light-line-e5', y: 'foot', facing: 'down', lumensPerMetre: 10, kelvin: 2700, color: [...E5.red], proud: .1 }] },
    profile: { skin: MINERAL, backing: F.bronze, bevel: { radius: .003, segments: 1 }, seams: [], depth: [.086, .095],
        head: { slot: F.bronze, depth: .097 }, foot: { slot: F.black, depth: .1 } },
});

export const E5_CEILING = ceilingPreset('B', 'e5', {
    system: { grid: { pitch: [E5.ceiling.cell, E5.ceiling.cell], block: 'ceiling-e5-grid15', blockCells: [2, 2], joint: .006, phase: 'room-centre' },
        steps: [{ inset: E5.ceiling.ring, drop: E5.ceiling.drop, fascia: 'ceiling-e5-step',
            lens: { module: 'ceiling-cove-e5-step', y: .19, facing: 'up', lumensPerMetre: 30, kelvin: 2700, proud: .03 } }] },
    profile: { panel: GLOSS, backing: F.black, bevel: .003, step: WALNUT },
});

export const E5_FLOOR = floorPreset('A', 'e5', {
    system: { tile: { size: [E5.floor.tile, E5.floor.tile], joint: E5.floor.joint, block: 'floor-finish-e5-stone', blockTiles: [2, 2], phase: 'grid' } },
    profile: { tile: DARK_STONE, support: F.bronze },
});

const LOBBY: ReadonlySet<RoomKind> = new Set(['reception', 'lounge', 'bar', 'dining_area', 'corridor', 'elevator_lobby', 'concourse', 'counter_area']);

export const E5_STYLE: StyleSpec = {
    id: 'e5', kind: 'A', tier: 'high_rich',
    finish(kind: RoomKind, _floorKind: FloorKind, base: RoomFinish): RoomFinish {
        const { frame: _frame, band: _band, services: _services, ...plain } = base;
        if (!LOBBY.has(kind)) return plain;
        return { ...plain, family: 'luxury', field: E5_PANEL.system.id, floor: E5_FLOOR.system.id, ceiling: E5_CEILING.system.id, casing: 'e2' };
    },
    lights: { plannedCoves: false, kelvin: 2900 },
    lift: { jamb: 'lift-landing-jamb-e2', header: 'lift-landing-header-e2' },
};
