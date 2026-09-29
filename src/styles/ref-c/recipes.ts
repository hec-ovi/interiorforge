import type { Point } from '../../core/geom.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { arc, registerModuleSizes, xyPrism, yzPrism } from '../systems/built-ins.js';
import type { HousingSpec } from '../systems/types.js';
import { C } from './looks.js';

/** Modules of kind C beyond its surfaces: the capsule homes' ceiling beam and duct band,
 *  the public floors' trunk bays, wall lamps and debris, the restroom urinal and the H10
 *  vending machine. Anything repeating under half a metre (ribs, slats, hangers, grille
 *  louvres) is baked into its bay. All sizes in metres. */

/** Box between two corners. */
const box = (k: Kit, slot: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    k.box(slot, [x0, y0, z0], [x1 - x0, y1 - y0, z1 - z0]);

/** A round pipe along x at (y, z). */
const pipe = (k: Kit, slot: string, x0: number, x1: number, y: number, z: number, r: number, sides = 10) =>
    yzPrism(k, slot, arc(y, z, r, 0, Math.PI * 2 * (sides - 1) / sides, sides - 1), x0, x1, false);

// ---- capsule home housings ----------------------------------------------------------

/** H10 service beam section (y, z): a flat top on the ceiling, a flat face 0.28 m deep and a
 *  rounded lower nose (R 0.06) meeting the wall, 0.30 m out from the partition face. */
const BEAM: Point[] = [[0, 0], [0, .24], ...arc(.06, .24, .06, Math.PI, Math.PI / 2, 8).slice(1), [.28, .3], [.28, 0]];

export const C1_BEAM: HousingSpec = {
    id: 'housing-c1-beam', body: 'housing-c1-beam-body', cap: 'housing-c1-beam-cap', insert: { module: 'housing-c1-beam-vent', pitch: 1.6 },
    over: 'runs', depth: .3, height: .28, minBottom: 2.3,
};
/** Japantown duct band: a teal-grey duct under the ceiling with a slot grille every 1.35 m. */
export const C7_DUCT: HousingSpec = {
    id: 'housing-c7-duct', body: 'housing-c7-duct-body', cap: 'housing-c7-duct-cap', insert: { module: 'housing-c7-duct-grille', pitch: 1.35 },
    over: 'runs', depth: .24, height: .26, minBottom: 2.3,
};

const housings: RecipeSet = add => {
    add('housing-c1-beam-body', k => yzPrism(k, C.ivory, BEAM, -.25, .25, false));
    add('housing-c1-beam-cap', k => { yzPrism(k, C.ivory, BEAM, -.01, .01); });
    // A dark vent recess on the beam face with four baked louvres.
    add('housing-c1-beam-vent', k => {
        box(k, C.black, -.25, .25, .07, .2, .3, .302);
        for (let i = 0; i < 4; i++) box(k, C.graphite, -.24, .24, .085 + i * .03, .097 + i * .03, .302, .312);
    });
    add('housing-c7-duct-body', k => {
        box(k, C.charcoal, -.25, .25, 0, .26, 0, .22);
        box(k, C.black, -.25, .25, .005, .012, .22, .24);
    });
    add('housing-c7-duct-cap', k => box(k, C.charcoal, -.01, .01, 0, .26, 0, .24));
    // Slot grille: a black recess with nine baked slats.
    add('housing-c7-duct-grille', k => {
        box(k, C.black, -.45, .45, .05, .21, .22, .223);
        for (let i = 0; i < 9; i++) box(k, C.zinc, -.44, .44, .06 + i * .017, .068 + i * .017, .223, .232);
    });
};

// ---- public floors --------------------------------------------------------------------

/** One 2 m bay of the exposed ceiling trunk: a large insulated pipe, a smaller pipe beside
 *  it, a cable tray, and one hanger frame with its rods; y = 0 is the ceiling, the bay hangs
 *  0.55 m. `-run` is the same pipes and tray without the hanger, stretched over the rest. */
function trunk(k: Kit, x0: number, x1: number, hanger: boolean) {
    pipe(k, C.ochre, x0, x1, -.26, -.18, .1, 10);
    pipe(k, C.zinc, x0, x1, -.22, .1, .055, 8);
    box(k, C.gunmetal, x0, x1, -.47, -.455, -.2, .2);
    for (const z of [-.2, .19]) box(k, C.gunmetal, x0, x1, -.47, -.41, z, z + .01);
    box(k, C.gunmetal, x0, x1, -.455, -.43, -.17, .05);
    if (!hanger) return;
    for (const z of [-.24, .22]) box(k, C.zinc, -.012, .012, -.5, 0, z, z + .024);
    box(k, C.zinc, -.02, .02, -.5, -.47, -.25, .25);
    box(k, C.zinc, -.02, .02, -.39, -.37, -.25, .25);
    for (const x of [-.7, .7]) for (const z of [-.28, .0]) box(k, C.gunmetal, x - .03, x + .03, -.28, -.1, z - .005, z + .005);
}

const publicPieces: RecipeSet = add => {
    add('trim-c2-trunk-bay', k => trunk(k, -1, 1, true));
    add('trim-c2-trunk-run', k => trunk(k, -.25, .25, false));
    // A caged fluorescent tube on the wall: back plate, tube, two guard bars; lens is the tube.
    add('trim-c2-wall-lamp', k => {
        box(k, C.gunmetal, -.06, .06, 0, .72, 0, .03);
        box(k, C.lamp, -.022, .022, .06, .66, .03, .07);
        for (const x of [-.05, .05]) box(k, C.steel, x - .006, x + .006, .04, .68, .03, .09);
        for (const y of [.04, .36, .68]) box(k, C.steel, -.056, .056, y - .006, y + .006, .084, .092);
    });
    // Debris over 1.6 x 1 m: flat sheets of paper and card, a crushed box and a can, all
    // lying on the floor (nothing to trip on: the tallest piece is 0.12 m).
    add('trim-c2-debris', k => {
        const sheets: [number, number, number, number, number, string][] = [
            [-.55, .2, .3, .22, .4, C.paper], [-.2, -.25, .21, .3, -.3, C.paper], [.35, .15, .28, .2, .9, C.paper],
            [.6, -.3, .4, .3, .2, C.cardboard], [-.65, -.3, .35, .25, -.6, C.cardboard], [.1, .35, .2, .14, 1.4, C.paper],
        ];
        for (const [x, z, w, d, a, slot] of sheets) {
            const c = Math.cos(a), s = Math.sin(a);
            const corners: Point[] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([u, v]) => [x + u! * c - v! * s, z + u! * s + v! * c]);
            k.mesh.addQuad(slot, corners.map(([px, pz]) => [px, .004, pz] as [number, number, number]).reverse() as [[number, number, number], [number, number, number], [number, number, number], [number, number, number]]);
        }
        box(k, C.cardboard, .2, .5, 0, .12, -.1, .12);
        k.cylinder(C.zinc, [-.35, 0, .05], .033, .12, 8);
    });
};

// ---- restroom and capsule extras ------------------------------------------------------

const fixtures: RecipeSet = add => {
    // Wall-hung urinal 0.4 x 0.35 x 0.6 over a steel splash plate: a ceramic body with a
    // rounded lower lip, a dark basin face and a flush pipe.
    add('fit-c4-urinal', k => {
        k.bevelBox(C.steel, [-.2, 0, -.175], [.4, .6, .01], .003);
        // The ceramic body swept front to back over its U outline, so its lower lip is round.
        const front: Point[] = [[-.17, .6], [-.17, .2], ...arc(0, .2, .17, Math.PI, Math.PI * 2, 12).slice(1, -1), [.17, .2], [.17, .6]];
        k.sweep(C.ceramic, front, -.165, .12, { axis: 'z' });
        // The dark basin face set just into the body's front, a chrome flush valve and pipe.
        k.bevelBox(C.black, [-.13, .22, .118], [.26, .3, .004], .012);
        k.tube(C.zinc, [[0, .72, -.13], [0, .62, -.13], [0, .6, -.11], [0, .6, -.06]], .012, false, 12);
        k.cylinder(C.zinc, [0, .6, -.13], .025, .07, 16);
    });
    // The H10 vending machine beside the bathroom portal: 0.9 x 0.6 x 2.1, a rounded ivory
    // case, a lit menu screen in a bezel, a glazed product window with three shelves of
    // cans, a keypad, a coin slot and a recessed dispenser with its flap.
    add('fit-c1-vending', k => {
        k.bevelBox(C.ivory, [-.45, .1, -.3], [.9, 2, .56], .03);
        k.bevelBox(C.black, [-.45, 0, -.28], [.9, .1, .54], .01);
        k.bevelBox(C.black, [-.4, .95, .24], [.8, 1.0, .03], .012);
        k.box('cyberpunk/ad-screen/rich#noir-amber', [-.37, 1.35, .27], [.74, .55, .005], 'unit');
        // product window: glass over three shelves of cans, left of the keypad
        k.box(C.glass, [-.37, .98, .271], [.49, .34, .004]);
        for (const [y, n] of [[1.0, 6], [1.11, 6], [1.22, 6]] as const) {
            k.box(C.zinc, [-.37, y, .2], [.49, .006, .07]);
            for (let i = 0; i < n; i++) k.cylinder(i % 3 ? C.cyan : C.amber, [-.33 + i * .075, y + .006, .235], .028, .1, 12);
        }
        k.bevelBox(C.gunmetal, [.15, 1.05, .265], [.22, .2, .015], .006);
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) k.cbevel(C.black, [.2 + c * .06, 1.08 + r * .055, .277], [.04, .035, .006], .004);
        k.cbevel(C.black, [.26, .8, .27], [.05, .012, .012], .004);
        // dispenser: a dark recess with a hinged flap
        k.bevelBox(C.black, [-.2, .42, .23], [.4, .22, .04], .01);
        k.bevelBox(C.gunmetal, [-.18, .44, .258], [.36, .1, .012], .006);
    });
};

// ---- ground atrium, restroom and studio extras ------------------------------------------

const extras: RecipeSet = add => {
    // Pay-here kiosk of the atrium: a gunmetal cabinet 0.9 x 0.6 x 2.1, a lit screen under a
    // hood, a card slot and a dispenser tray.
    add('fit-c3-kiosk', k => {
        k.bevelBox(C.gunmetal, [-.45, .1, -.3], [.9, 2, .55], .025);
        k.bevelBox(C.black, [-.45, 0, -.28], [.9, .1, .53], .01);
        // a hood over the screen, the screen in a bezel, a sloped counter with a card slot
        k.sweep(C.black, [[1.9, -.05], [1.9, .3], [1.96, .32], [2.05, .32], [2.05, -.05]], -.42, .42);
        k.bevelBox(C.black, [-.37, 1.23, .24], [.74, .64, .02], .012);
        k.box(C.screen, [-.34, 1.25, .26], [.68, .6, .004], 'unit');
        k.sweep(C.gunmetal, [[.95, .25], [.95, .3], [1.2, .32], [1.2, .25]], -.38, .38);
        k.bevelBox(C.black, [-.34, 1.08, .29], [.68, .09, .03], .01);
        k.box(C.screen, [-.08, 1.12, .318], [.16, .04, .002], 'unit');
        k.cbevel(C.black, [.2, 1.12, .3], [.09, .006, .02], .002);
        // the dispenser tray
        k.bevelBox(C.black, [-.2, .5, .22], [.4, .12, .09], .01);
        k.bevelBox(C.zinc, [-.18, .5, .25], [.36, .015, .05], .004);
    });
    // Low corridor lamp at the foot of the wall: a warm lens under a small hood.
    add('trim-c3-low-lamp', k => {
        box(k, C.gunmetal, -.07, .07, 0, .16, 0, .05);
        box(k, C.lamp, -.05, .05, .02, .05, .05, .07);
    });
    // Restroom wash trough 2.4 m: a cream trough on brackets, four taps, a mirror band above.
    add('fit-c4-trough', k => {
        // A rounded ivory trough swept along the wall: a thick rim round a sunk basin.
        k.sweep(C.ivory, [[.72, -.275], [.72, .245], [.75, .275], [.87, .275], [.9, .255], [.9, .2], [.84, .2], [.8, .17], [.8, -.2], [.9, -.2], [.9, -.275]], -1.2, 1.2);
        k.box(C.black, [-1.18, .795, -.2], [2.36, .006, .37]);
        for (const x of [-.9, -.3, .3, .9]) {
            // a gooseneck mixer on a round base
            k.cylinder(C.zinc, [x, .9, -.245], .022, .01, 16);
            k.tube(C.zinc, [[x, .91, -.245], [x, 1.02, -.245], [x, 1.07, -.21], [x, 1.06, -.16], [x, 1.03, -.14]], .01, false, 12);
            k.cylinder(C.black, [x, .80, -.02], .02, .002, 16);
        }
        for (const x of [-1.1, 0, 1.1]) k.bevelBox(C.black, [x - .02, .2, -.275], [.04, .52, .075], .006);
        // the mirror band in a dark frame
        k.bevelBox(C.black, [-1.2, 1.28, -.275], [2.4, .72, .01], .004);
        k.box(C.mirror, [-1.16, 1.32, -.265], [2.32, .64, .007]);
    });
    // Studio neon: a red outline sign on a dark back plate, 1.0 x 0.7.
    add('trim-c6-neon', k => {
        box(k, C.black, -.5, .5, 0, .7, 0, .02);
        const red = 'cyberpunk/light-fixture/rich#loft-red';
        box(k, red, -.42, .42, .06, .09, .02, .04); box(k, red, -.42, .42, .61, .64, .02, .04);
        box(k, red, -.42, -.39, .06, .64, .02, .04); box(k, red, .39, .42, .06, .64, .02, .04);
        box(k, red, -.2, .2, .3, .33, .02, .04); box(k, red, -.02, .01, .2, .5, .02, .04);
    });
    // Studio ceiling disc: a 1.2 m round lens in a dark ring, hung 0.1 m under the ceiling.
    add('trim-c6-disc', k => {
        k.cylinder(C.black, [0, -.12, 0], .66, .12, 20);
        k.cylinder('cyberpunk/light-fixture/rich#strip', [0, -.125, 0], .55, .01, 20);
    });
};

export const recipesC: RecipeSet = add => { housings(add); publicPieces(add); fixtures(add); extras(add); };
registerModuleSizes(recipesC);
