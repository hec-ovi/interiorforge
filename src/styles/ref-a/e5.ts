import type { FloorKind, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import { FINISH as F } from '../../modules/finishes.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import type { StyleSpec } from '../systems/types.js';
import { E1_FLOOR } from './e1.js';
import { E2_PANEL } from './e2.js';

/** E5, the tower's ground lobby: the public floor's dark lacquer bays with bronze joints on
 *  its walls, the suite's dark polished stone on its floor, and its own ceiling: dark gloss
 *  1.5 m cells inside a dropped walnut ring 0.6 m wide whose fascia carries a warm up-light. */
export const E5 = {
    ceiling: { cell: 1.5, ring: .6, drop: .2 },
} as const;

const GLOSS = 'cyberpunk/gutierrez-lacquer/rich#ink';
const WALNUT = 'cyberpunk/corpo-plaza-veneer/rich#walnut';

export const E5_CEILING = ceilingPreset('B', 'e5', {
    system: { grid: { pitch: [E5.ceiling.cell, E5.ceiling.cell], block: 'ceiling-e5-grid15', blockCells: [2, 2], joint: .006, phase: 'room-centre' },
        steps: [{ inset: E5.ceiling.ring, drop: E5.ceiling.drop, fascia: 'ceiling-e5-step',
            lens: { module: 'ceiling-cove-e5-step', y: .19, facing: 'up', lumensPerMetre: 30, kelvin: 2700, proud: .03 } }] },
    profile: { panel: GLOSS, backing: F.black, bevel: .003, step: WALNUT },
});

const LOBBY: ReadonlySet<RoomKind> = new Set(['reception', 'lounge', 'bar', 'dining_area', 'corridor', 'elevator_lobby', 'concourse', 'counter_area']);

export const E5_STYLE: StyleSpec = {
    id: 'e5', kind: 'A', tier: 'high_rich',
    finish(kind: RoomKind, _floorKind: FloorKind, base: RoomFinish): RoomFinish {
        const { frame: _frame, band: _band, services: _services, ...plain } = base;
        if (!LOBBY.has(kind)) return plain;
        return { ...plain, family: 'luxury', field: E2_PANEL.system.id, floor: E1_FLOOR.system.id, ceiling: E5_CEILING.system.id };
    },
    lights: { plannedCoves: false, kelvin: 2900 },
    lift: { jamb: 'lift-landing-jamb-e2', header: 'lift-landing-header-e2' },
};
