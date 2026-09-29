import type { RoomKind } from '../../core/types.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import { glazingPreset } from '../systems/glazing.js';
import { panelPreset } from '../systems/panel-recipes.js';
import type { PortalSpec } from '../systems/types.js';
import { R1 } from './look.js';

/** The rich office's surface systems, measured on the reference office:
 *  - walls: broad graphite veneer panels 1.5 m wide on the half-metre grid, no horizontal
 *    joint, a 4 mm brass inlay in every vertical joint (the brass backing showing through),
 *    a thin black shadow line under the ceiling, and a red lit line along the floor. */

/** Panel pitch of the office walls: one bronze inlay every 1.5 m (the reference joints stand
 *  1.4-1.65 m apart). */
export const R1_PANEL_PITCH = 1.5;
/** Width of the bronze inlay (the joint between two panels). */
export const R1_INLAY = .004;
/** Height of the black shadow line under the ceiling. */
export const R1_HEAD = .03;
/** Height of the red floor line's centre above the floor. */
export const R1_BASE_LINE = .012;

export const R1_PANEL = panelPreset('R', 'r1', {
    system: {
        pitch: [R1_PANEL_PITCH], phase: 'grid', rows: 2, seam: R1_INLAY, minColumn: .4,
        head: { height: R1_HEAD, module: 'wall-panel-r1-head' }, foot: null,
        litJoints: [{ module: 'wall-light-line-r1', y: R1_BASE_LINE, facing: 'down', lumensPerMetre: 12, kelvin: 2700,
            color: [1, .035, .022], proud: .1 }],
    },
    profile: {
        skin: R1.graphite, backing: R1.brass, bevel: { radius: .003, segments: 1 }, seams: [], depth: [.086, .095],
        head: { slot: R1.black, depth: .097 },
    },
});

/** Ceiling: continuous warm timber in large 1.5 × 3 m panels with 3 mm joints (the reference
 *  ceiling shows none), phased to the building grid so a cut panel stays timber up to the
 *  black 25 mm shadow gap along the walls. */
export const R1_CEILING = ceilingPreset('R', 'r1', {
    system: {
        grid: { pitch: [1.5, 3], block: 'ceiling-r1-panel', blockCells: [1, 1], joint: .003, phase: 'grid' },
        perimeter: { width: .025, drop: -.02, edge: 'ceiling-r1-shadow', corner: 'ceiling-r1-shadow-corner' }, snapSpots: false,
    },
    profile: { panel: R1.ceiling, backing: R1.black, perimeter: R1.black },
});

/** Floor: walnut boards 2 × 0.2 m with 2 mm joints, laid from the room's corner. */
export const R1_FLOOR = floorPreset('R', 'r1', { profile: { tile: R1.walnut } });

/** Glazing of the meeting rooms and private offices toward the open office and the public
 *  rooms: black mullions on the metre over a 0.1 m black base, a transom at 2.4 m. The
 *  executive office is not glazed: the reference office is closed on every side. */
const GLAZING = glazingPreset('R', 'r1', ['meeting', 'office_private', 'lounge'],
    ['corridor', 'elevator_lobby', 'concourse', 'office_open', 'reception', 'lounge']);
export const R1_GLAZING = { system: { ...GLAZING.system, id: 'r1-glass' }, recipes: GLAZING.recipes };

/** Rooms whose doorways take the layered doorway (both sides must be one of them). */
const OFFICE: RoomKind[] = ['executive_office', 'office_private', 'office_open', 'meeting', 'corridor', 'reception', 'lounge', 'elevator_lobby'];

/** The layered doorway: a square ink frame lined with polished brass on its returns, inside a
 *  broader honed graphite stone frame with a bronze reveal, both square cornered. */
export const R1_PORTALS: PortalSpec[] = [
    {
        id: 'r1-layered', radius: 0, band: .1, depth: [.1, .14], layers: ['r1-layered-outer'],
        rooms: OFFICE, minWidth: .8, minHeight: 2, skin: { face: R1.ink, reveal: R1.black, ret: R1.brass },
    },
    {
        id: 'r1-layered-outer', radius: 0, band: .14, depth: [.105, .125],
        rooms: OFFICE, minWidth: .8, minHeight: 2, skin: { face: R1.graphite, reveal: R1.bronze, ret: R1.ink },
    },
];
