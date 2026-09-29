import type { RecipeSet } from '../../modules/recipes.js';
import { ceilingPreset } from '../systems/ceiling-recipes.js';
import { floorPreset } from '../systems/floor-recipes.js';
import { panelPreset } from '../systems/panel-recipes.js';
import type { CeilingSystem, FloorSystem, PanelSystem } from '../systems/types.js';
import { C } from './looks.js';

/** The surface systems of kind C, shared between styles wherever the references share a
 *  look (systems are keyed by their marker id, so a style names any of them):
 *  - `wall-field-c1`: capsule plates of the H10 home, ivory enamel on a 1.6 m plate rhythm
 *    with rounded vertical edges, a dark 0.11 m plinth course, a dark seam at 2.1 m and a
 *    dark recessed band under the ceiling (the rest of the home's plate joints are the
 *    plates' own edges).
 *  - `wall-field-c7`: the Japantown home's warm cream plates on 1.35 m, a dark foot course,
 *    a seam over door heads at 2.3 m and the dark duct band above it.
 *  - `wall-field-c2`: the poor building's public walls, worn paint over a petrol enamel dado
 *    to 1.15 m under a gunmetal course, 1.5 m plates with rivets, a gunmetal skirting.
 *  - `wall-field-c4`: the service rooms' dark teal paint (restroom, machine rooms) on 1.5 m
 *    plates with a gunmetal course at 1.2 m and a gunmetal skirting.
 *  - `ceiling-field-c1`: dark capsule cassettes, 1.5 m on the building grid with black
 *    joints (H10 and Japantown homes).
 *  - `ceiling-field-c2`: worn 1.5 m public cassettes with gunmetal joints.
 *  - `floor-slab-c1`: the capsule homes' dark hex sheet in 2 m panels.
 *  - `floor-slab-c2`: worn metre tiles of the public floors.
 *  Plain slabs (`floor-slab-c7`, `floor-slab-c4`) wear their tile maps at their physical
 *  repeat without joint geometry. */

const c1 = panelPreset('C-capsule', 'c1', {
    system: { pitch: [1.6], exact: true, rows: 2.1, minColumn: .45,
        head: { height: .12, module: 'wall-field-meridian-backing' }, foot: null },
    profile: { skin: C.ivory, bevel: { radius: .014, segments: 2 },
        seams: [{ y: .11, width: .01, slot: C.black }, { y: 2.1, width: .01, slot: C.black }],
        fixings: undefined, depth: [.088, .095], head: { slot: C.black, depth: .091 } },
    options: { lower: { to: .11, skin: C.charcoal } },
});

const c7 = panelPreset('C-capsule', 'c7', {
    system: { pitch: [1.35], exact: true, rows: 2.3, minColumn: .4,
        head: { height: .2, module: 'wall-field-meridian-backing' }, foot: null },
    profile: { skin: C.cream, bevel: { radius: .008, segments: 1 },
        seams: [{ y: .1, width: .008, slot: C.black }, { y: 1.15, width: .004, slot: C.graphite }, { y: 2.3, width: .008, slot: C.black }],
        fixings: undefined, depth: [.088, .095], head: { slot: C.teal, depth: .091 } },
    options: { lower: { to: .1, skin: C.charcoal } },
});

const c2 = panelPreset('C', 'c2', {
    profile: { skin: C.worn, backing: C.gunmetal, bevel: { radius: .004, segments: 1 },
        seams: [{ y: 1.15, width: .03, slot: C.gunmetal }],
        fixings: { inset: [.03, .03], radius: .005, slot: C.gunmetal, pairs: 1 }, depth: [.084, .095],
        foot: { slot: C.gunmetal, depth: .1 } },
    options: { lower: { to: 1.15, skin: C.dado } },
});

const c4 = panelPreset('C', 'c4', {
    system: { rows: 1.2 },
    profile: { skin: C.teal, backing: C.gunmetal, bevel: { radius: .004, segments: 1 },
        seams: [{ y: 1.2, width: .025, slot: C.gunmetal }], fixings: undefined, depth: [.084, .095],
        foot: { slot: C.gunmetal, depth: .1 } },
    options: {},
});

const ceilingC1 = ceilingPreset('C', 'c1', {
    system: { grid: { pitch: [1.5, 1.5], block: 'ceiling-c1-grid15', blockCells: [2, 2], joint: .012, phase: 'grid' } },
    profile: { panel: C.charcoal, backing: C.black },
});
const ceilingC2 = ceilingPreset('C', 'c2');

const floorC1 = floorPreset('C-hex', 'c1');
const floorC2 = floorPreset('C', 'c2');

export const PANELS_C: PanelSystem[] = [c1.system, c7.system, c2.system, c4.system];
export const CEILINGS_C: CeilingSystem[] = [ceilingC1.system, ceilingC2.system];
export const FLOORS_C: FloorSystem[] = [floorC1.system, floorC2.system];

/** Plain floor slabs: a 0.5 m cell with the tile map on top, stretched over each rectangle
 *  (the placement publishes the repeat). */
const plainSlab = (id: string, slot: string): RecipeSet => add => add(id, k => {
    k.cbox(C.black, [0, -.15, 0], [.5, .15, .5], undefined, ['north', 'south', 'east', 'west']);
    k.cbox(C.concrete, [0, -.15, 0], [.5, .15, .5], undefined, ['bottom']);
    k.cbox(slot, [0, -.02, 0], [.5, .02, .5], undefined, ['top']);
});

export const surfaceRecipesC: RecipeSet = add => {
    for (const preset of [c1, c7, c2, c4, ceilingC1, ceilingC2, floorC1, floorC2]) preset.recipes(add);
    plainSlab('floor-slab-c7', 'cyberpunk/interior-capsule-floor/mid#field')(add);
    plainSlab('floor-slab-c4', C.umber)(add);
};
