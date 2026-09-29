import { FINISH as F } from '../finishes.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import type { Kit } from '../kit.js';
import type { RecipeSet } from '../recipes.js';
import { tube } from '../../styles/luxury/model-geometry.js';

/** Profiles stay inside the canonical flight's 75 mm edge reservation. Separate
 * side modules keep the unchanged consumer's box collision out of the walk lane. */
const profiles = ['luxury', 'corporate', 'capsule', 'damaged', 'industrial'] as const;
const timber = 'cyberpunk/corpo-plaza-veneer/rich#walnut';
const gunmetal = 'cyberpunk/interior-service-gunmetal/poor#aged';
function panel(k: Kit, slot: string, x: number, width: number, low: number, high: number, index: number, last: boolean): void {
    const a = x, b = x + width, run = .28, rise = .17;
    const faces: Vec3[][] = [
        [[a, low, 0], [a, low + rise, run], [a, high + rise, run], [a, high, 0]],
        [[b, low, 0], [b, high, 0], [b, high + rise, run], [b, low + rise, run]],
        [[a, low, 0], [b, low, 0], [b, low + rise, run], [a, low + rise, run]],
        [[a, high, 0], [a, high + rise, run], [b, high + rise, run], [b, high, 0]],
    ];
    if (!index) faces.push([[a, low, 0], [a, high, 0], [b, high, 0], [b, low, 0]]);
    if (last) faces.push([[a, low + rise, run], [b, low + rise, run], [b, high + rise, run], [a, high + rise, run]]);
    for (const face of faces) {
        const a = face[0]!, b = face[1]!, c = face[2]!;
        const u = b.map((v, i) => v - a[i]!), v = c.map((v, i) => v - a[i]!);
        const raw = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
        const length = Math.hypot(...raw), n = raw.map(v => v / length), horizontal = Math.hypot(n[0]!, n[2]!) || 1;
        // Meter UVs carry their phase across collision pieces. No repeated
        // quarter-meter paint patches or internal glass end caps reveal the split.
        const uvs = face.flatMap(p => Math.abs(n[1]!) > .9 ? [p[0], p[2] + index * run]
            : [(p[0] * n[2]! - (p[2] + index * run) * n[0]!) / horizontal, p[1] + index * rise]);
        k.mesh.addSurface(slot, { positions: face.flat(), normals: face.flatMap(() => n), uvs, indices: [0, 1, 2, 0, 2, 3] });
    }
}
export const stairFinishRecipes: RecipeSet = add => {
    // Private stairs built from individual treads can use the same rounded rail
    // without instantiating a canonical shared-core flight.
    add('stair-rail-piece', k => tube(k, gunmetal, [[.0375, 1.11, 0], [.0375, 1.28, .28]], .020, false, 16));
    add('floor-slab-stair-luxury', k => {
        k.cbox(F.mineral, [0, -.15, 0], [.5, .13, .5]);
        k.cbox(timber, [0, -.02, 0], [.5, .02, .5]);
    });
    for (const [family, lens] of [['luxury', F.lensWarm], ['corporate', F.lensCool]] as const) add(`stair-wall-lamp-${family}`, k => {
        k.box(gunmetal, [0, -.19, -.10], [.035, .38, .20]);
        k.box(lens, [.035, -.15, -.07], [.004, .30, .14]);
    });
    add('stair-wall-lamp-capsule', k => {
        k.box(gunmetal, [0, -.06, -.24], [.030, .12, .48]);
        k.box(F.lensCool, [.030, -.025, -.21], [.004, .050, .42]);
    });
    add('stair-wall-lamp-service', k => {
        k.box(gunmetal, [0, -.07, -.25], [.040, .14, .5]);
        k.box(F.lensCool, [.040, -.040, -.22], [.004, .080, .44]);
    });
    add('stair-service-pipe-damaged', k => tube(k, gunmetal, [[0, 0, 0], [0, .5, 0]], .028, false, 16));
    add('stair-service-collar-damaged', k => k.cylinder(gunmetal, [0, 0, 0], .038, .06, 16));
    for (const profile of profiles) {
        const luxury = profile === 'luxury', glass = luxury || profile === 'corporate';
        const metal = gunmetal;
        const tread = luxury ? timber : profile === 'corporate' ? F.stone : profile === 'capsule' ? F.steel : profile === 'damaged' ? F.damagedFloor : gunmetal;
        add(`stair-tread-${profile}`, k => {
            k.box(tread, [0, -.012, 0], [1.45, .012, .28]);
            k.box(tread, [0, -.17, -.002], [1.45, .158, .012]);
            // A real narrow nosing, entirely within the tread: no projecting lip
            // to catch a foot or unsupported stripe pretending to be a light.
            if (!luxury) k.box(metal, [0, -.012, 0], [1.45, .012, .012]);
        });
        for (let index = 0; index < 14; index++) for (const last of (index >= 6 ? [false, true] : [false])) {
            add(`stair-side-${profile}-piece-${index}${last ? '-end' : ''}`, k => {
                if (glass) {
                    panel(k, F.glass, .0275, .020, .13, 1.0975, index, last);
                    panel(k, metal, .010, .055, -.025, .025, index, last);
                    for (const z of [...(!index ? [.07] : []), ...(last ? [.21] : [])])
                        k.box(metal, [.0125, z / .28 * .17 + .08, z - .018], [.05, .18, .036]);
                } else if (profile === 'damaged') {
                    panel(k, F.damagedWall, .005, .065, -.025, .95, index, last);
                    panel(k, metal, 0, .075, .95, .985, index, last);
                    if (index % 4 === 0 || last) tube(k, metal, [[.0375, 1.07, .14], [.0375, 1.195, .14]], .012, false, 12);
                } else if (profile === 'capsule') {
                    panel(k, F.capsuleWall, .0125, .05, .04, .92, index, last);
                    if (index % 3 === 0) k.box(metal, [.0025, .025, .005], [.07, 1.10, .025]);
                } else {
                    for (const h of [.40, .73]) tube(k, metal, [[.0375, h, 0], [.0375, .17 + h, .28]], .015, false, 12);
                    if (index % 3 === 0) tube(k, metal, [[.0375, .17, .14], [.0375, 1.20, .14]], .018, false, 12);
                }
            });
        }
        add(`stair-landing-guard-${profile}`, k => {
            if (glass) {
                k.cbox(F.glass, [0, .12, 0], [1.34, .91, .02]);
                for (const x of [-.66, .66]) k.cbox(metal, [x, -.10, 0], [.06, .35, .055]);
            } else if (profile === 'damaged' || profile === 'capsule') {
                k.cbox(profile === 'damaged' ? F.damagedWall : F.capsuleWall, [0, -.10, 0], [1.4, 1.08, .065]);
                for (const x of [-.55, .55]) tube(k, metal, [[x, .98, 0], [x, 1.04, 0]], .012, false, 12);
            } else {
                for (const x of [-.66, 0, .66]) tube(k, metal, [[x, -.1, 0], [x, 1.05, 0]], .02, false, 12);
                for (const y of [.35, .7]) tube(k, metal, [[-.68, y, 0], [.68, y, 0]], .015, false, 12);
            }
            tube(k, metal, [[-.675, 1.04, 0], [.675, 1.04, 0]], .025, false, 16);
        });
    }
};
