import { panelPreset } from '../systems/panel-recipes.js';
import { R1 } from './look.js';

/** The rich office's surface systems, measured on the reference office:
 *  - walls: broad graphite veneer panels 1.5 m wide on the half-metre grid, no horizontal
 *    joint, a 4 mm bronze inlay in every vertical joint (the bronze backing showing through),
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
        skin: R1.graphite, backing: R1.bronze, bevel: { radius: .003, segments: 1 }, seams: [], depth: [.086, .095],
        head: { slot: R1.black, depth: .097 },
    },
});
