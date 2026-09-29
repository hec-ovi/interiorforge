import type { FloorKind, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { FINISH as F } from '../../modules/finishes.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import { panelPreset } from '../systems/panel-recipes.js';
import type { StyleSpec } from '../systems/types.js';

/** E2, the tower's public floor: the lift lobby and the corridors in front of the suites.
 *  Dark lacquer walls in broad bays with bronze joints and a bronze foot course, a dark
 *  gloss ceiling whose 1.5 m cells alternate with luminous fields, a floor of dark 1.5 m
 *  stone fields inside a pale perimeter band with a bronze inlay, and bronze lift surrounds. */
export const E2 = {
    wall: { pitch: 1.5, seam: .004, rows: 2.1, foot: .11 },
    ceiling: { cell: 1.5, joint: .006, every: 2, lumens: 2300, reveal: .25 },
    floor: { tile: 1.5, joint: .003, border: .45, inlay: .012 },
} as const;

const LACQUER = 'cyberpunk/gutierrez-lacquer/rich#ink';
const FIELD_STONE = 'cyberpunk/corpo-plaza-stone/rich#basin';
const PALE = 'cyberpunk/loft1702-stone/rich#pale';

export const E2_PANEL = panelPreset('B', 'e2', {
    system: { pitch: [E2.wall.pitch], seam: E2.wall.seam, rows: E2.wall.rows, head: { height: .035, module: 'wall-panel-e2-backing' },
        foot: { height: E2.wall.foot, module: 'wall-panel-e2-foot' }, minColumn: .4 },
    profile: { skin: LACQUER, backing: F.bronze, bevel: { radius: .003, segments: 1 }, seams: [], depth: [.086, .095],
        head: { slot: F.bronze, depth: .097 }, foot: { slot: LACQUER, depth: .1 } },
});

export const E2_CEILING = ceilingPreset('A-fields', 'e2', {
    system: { grid: { pitch: [E2.ceiling.cell, E2.ceiling.cell], block: 'ceiling-e2-grid15', blockCells: [1, 1], joint: E2.ceiling.joint, phase: 'room-centre' },
        perimeter: { width: E2.ceiling.reveal, drop: -.02, edge: 'ceiling-e2-backing', corner: 'ceiling-e2-backing' },
        fields: { every: E2.ceiling.every, module: 'ceiling-cove-e2-field', lumens: E2.ceiling.lumens } },
    profile: { panel: LACQUER, backing: F.bronze, bevel: .003 },
});

export const E2_FLOOR = floorPreset('B', 'e2', {
    system: {
        tile: { size: [E2.floor.tile, E2.floor.tile], joint: E2.floor.joint, block: 'floor-finish-e2-stone', blockTiles: [2, 2], phase: 'grid' },
        border: { width: E2.floor.border, module: 'floor-finish-e2-border', inlay: { width: E2.floor.inlay, module: 'floor-finish-e2-inlay' } },
    },
    profile: { tile: FIELD_STONE, border: PALE, inlay: F.bronze, support: F.black },
});

/** Bronze lift surrounds in the bounds of the plain `lift-landing-jamb` and `-header`. */
export const e2LiftRecipes: RecipeSet = add => {
    add('lift-landing-jamb-e2', k => {
        k.box(F.bronze, [-0.05, 0, -0.115], [0.10, 2.20, 0.16]);
        k.box(F.black, [-0.05, 0, -0.124], [0.022, 2.20, 0.009]);
    });
    add('lift-landing-header-e2', k => {
        k.box(F.bronze, [-0.65, 0, -0.115], [1.30, 0.13, 0.16]);
        k.box(F.black, [-0.25, 0.045, -0.127], [0.50, 0.065, 0.012]);
        k.box(F.ledCyan, [-0.10, 0.064, -0.132], [0.20, 0.025, 0.005]);
    });
};

const PUBLIC: ReadonlySet<RoomKind> = new Set(['corridor', 'elevator_lobby', 'reception', 'lounge', 'concourse']);

export const E2_STYLE: StyleSpec = {
    id: 'e2', kind: 'A', tier: 'high_rich',
    finish(kind: RoomKind, _floorKind: FloorKind, base: RoomFinish): RoomFinish {
        const { frame: _frame, band: _band, services: _services, ...plain } = base;
        if (!PUBLIC.has(kind)) return { ...plain, casing: 'e2' };
        return { ...plain, family: 'luxury', field: E2_PANEL.system.id, floor: E2_FLOOR.system.id, ceiling: E2_CEILING.system.id,
            casing: 'e2', portal: 'e2-lobby' };
    },
    lights: { plannedCoves: false, kelvin: 3000 },
    lift: { jamb: 'lift-landing-jamb-e2', header: 'lift-landing-header-e2' },
};
