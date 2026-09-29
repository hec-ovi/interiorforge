import { FINISH as F } from '../../modules/finishes.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { clothSurface, softBox, tube } from './model-geometry.js';
import type { Kit } from '../../modules/kit.js';
import { LUXURY_BATHROOM_MATERIALS } from './bathroom.js';
import { REFERENCE_MATERIAL as R } from './reference-furniture.js';

const PRIVATE_VENEER = 'cyberpunk/corpo-plaza-veneer/rich#smoked';

/** V Corpo Plaza 71703 frontal + 71702 basin close-up + 71658 reverse recess.
 * Proposed real-world dimensions; the photographs do not establish measurements.
 * The sink record is the working surface height. Its mirror and light stand higher,
 * following the existing wall-mounted basin contract. Rear mounting plane is -Z. */
export const CORPO_VANITY_FIT = { module: 'fit-basin-corpo', size: [2.2, .6, .9] as [number, number, number] };
export const CORPO_BATH_DIVIDER_FIT = { module: 'fit-bath-divider-corpo', size: [1.8, .45, 2.65] as [number, number, number] };
export const CORPO_BATH_DIVIDER_LIGHTS = {
  size: CORPO_BATH_DIVIDER_FIT.size,
  lenses: [-.49, -.16, .16, .49].map(x => ({ at: [x, 2.536, .145] as [number, number, number], length: .03, lumens: 24, up: false })),
};
export const CORPO_VANITY_LIGHTS = {
  size: CORPO_VANITY_FIT.size,
  lenses: [
    { at: [0, 2.162, -.135] as [number, number, number], length: .84, lumens: 220 },
    { at: [0, .865, -.196] as [number, number, number], length: 1.94, lumens: 55, up: true },
  ],
};

export const corpoBathroomRecipes: RecipeSet = add => {
  add(CORPO_VANITY_FIT.module, k => {
    // The floating apron is a shell with a deep, accessible trough, not a countertop
    // rectangle over a painted black inset. Its four rims terminate at their joints.
    const basin = 'cyberpunk/corpo-plaza-stone/rich#basin';
    softBox(k, basin, [0, .56, .258], [2.2, .34, .084], { radius: .006 });
    softBox(k, basin, [0, .61, -.257], [2.2, .29, .086], { radius: .004 });
    for (const x of [-1.047, 1.047]) softBox(k, basin, [x, .61, 0], [.106, .29, .43], { radius: .005 });
    softBox(k, basin, [0, .658, 0], [1.987, .039, .435], { radius: .008 });
    k.mesh.addQuad(basin, [[-.994, .89, .216], [.994, .89, .216], [.91, .697, .17], [-.91, .697, .17]]);
    k.mesh.addQuad(basin, [[-.994, .89, -.214], [-.91, .697, -.17], [.91, .697, -.17], [.994, .89, -.214]]);
    k.mesh.addQuad(basin, [[-.994, .89, -.214], [-.994, .89, .216], [-.91, .697, .17], [-.91, .697, -.17]]);
    k.mesh.addQuad(basin, [[.994, .89, .216], [.994, .89, -.214], [.91, .697, -.17], [.91, .697, .17]]);
    // Thin metal toe edge catches light under the heavy front, separate from the
    // luminous inlay inside the basin. Plumbing and brackets connect to the wall.
    softBox(k, F.bronze, [0, .558, .248], [2.17, .004, .042], { radius: .001 });
    for (const x of [-.80, .80]) {
      softBox(k, F.black, [x, .39, -.272], [.042, .27, .042], { radius: .003 });
      softBox(k, F.black, [x, .58, -.08], [.042, .04, .39], { radius: .003 });
    }
    tube(k, F.black, [[0, .66, -.06], [0, .46, -.06], [0, .414, -.1], [0, .414, -.27]], .024, false, 20);
    for (const x of [-.56, .56]) {
      softBox(k, F.chrome, [x, .695, -.025], [.17, .003, .028], { radius: .002 });
      k.cbox(F.black, [x, .698, -.025], [.146, .001, .008]);
    }
    // The source has two small angled rises below the outlets, not a thick glowing
    // frame around the entire counter. At 7 mm the diffuser remains subordinate.
    tube(k, 'cyberpunk/light-fixture/rich#corpo-amber', [[-.97, .865, .20], [-.97, .865, -.196], [-.65, .865, -.196],
      [-.605, .886, -.201], [-.49, .886, -.201], [-.445, .865, -.196],
      [.445, .865, -.196], [.49, .886, -.201], [.605, .886, -.201], [.65, .865, -.196],
      [.97, .865, -.196], [.97, .865, .20]], .0035, false, 10);

    // Continuous dark joinery backing, with the three mirror leaves projecting from
    // it. The opaque silver finish cannot reveal scenery through the wall.
    softBox(k, PRIVATE_VENEER, [0, .91, -.291], [2.19, 1.31, .018], { radius: .002 });
    softBox(k, F.black, [0, 1.165, -.268], [2.10, .99, .032], { radius: .003 });
    for (const x of [-1.052, 1.052]) softBox(k, F.bronze, [x, 1.165, -.242], [.009, .99, .012], { radius: .002 });
    for (const y of [1.165, 2.148]) softBox(k, F.bronze, [0, y, -.242], [2.105, .007, .012], { radius: .002 });
    for (const x of [-.698, 0, .698]) {
      softBox(k, LUXURY_BATHROOM_MATERIALS.mirror, [x, 1.175, -.244], [.689, .965, .008], { radius: .001 });
      for (const y of [1.235, 2.07]) {
        // Small edge hinge/retainer hardware keeps mirror segmentation physical.
        softBox(k, F.chrome, [x + (x < 0 ? -.335 : .335), y, -.235], [.009, .026, .006], { radius: .001 });
      }
    }
    for (const x of [-.56, .56]) {
      softBox(k, F.black, [x, 1.001, -.261], [.238, .108, .028], { radius: .003 });
      softBox(k, F.bronze, [x, 1.005, -.244], [.22, .097, .012], { radius: .002 });
      softBox(k, F.chrome, [x, 1.025, -.172], [.17, .025, .158], { radius: .003 });
      k.cbox(F.black, [x, 1.024, -.102], [.138, .002, .009]);
      softBox(k, F.chrome, [x + .135, 1.033, -.239], [.035, .043, .014], { radius: .004 });
    }
    // The projecting picture light has two separate supports and a real underside
    // diffuser. It is shallow enough to stay inside the fixture's 600 mm depth.
    for (const x of [-.30, .30]) {
      tube(k, F.black, [[x, 2.16, -.276], [x, 2.31, -.269], [x, 2.18, -.135]], .008, false, 12);
    }
    softBox(k, F.black, [0, 2.17, -.135], [.92, .055, .18], { radius: .004 });
    softBox(k, F.bronze, [0, 2.166, -.135], [.89, .004, .17], { radius: .001 });
    k.cbox(F.lensWarm, [0, 2.163, -.135], [.84, .003, .125]);
    // Two modest toiletry bottles occupy the dry end land, not the washing area.
    for (const [x, h] of [[-.99, .16], [.99, .21]] as const) {
      softBox(k, F.graphite, [x, .9, -.25], [.058, h, .061], { radius: .013 });
      k.cylinder(F.chrome, [x, .9 + h, -.25], .012, .025, 16);
      softBox(k, F.chrome, [x, .923 + h, -.239], [.026, .008, .05], { radius: .003 });
    }
  });
  add(CORPO_BATH_DIVIDER_FIT.module, bathDivider);
};

/** 71715 elevation + 71708/71713/71717 reverse and joint details. The geometric
 * lattice, woody climbers and stepped soil beds are independent depth layers.
 * Every leaf is a curved closed shell with thickness, attached through a petiole
 * to a branching stem rooted in soil; no image cards or unsupported leaf planes. */
function bathDivider(k: Kit): void {
  softBox(k, F.black, [0, 0, 0], [1.74, .06, .41], { radius: .009 });
  for (const [x, width, top] of [[-.565, .67, .64], [.335, 1.13, 1.15]] as const) {
    softBox(k, PRIVATE_VENEER, [x, .06, 0], [width, top - .22, .445], { radius: .004 });
    softBox(k, R.stone, [x, top - .16, 0], [width, .155, .45], { radius: .006 });
    k.cbox(F.soil, [x, top - .01, 0], [width - .04, .013, .385]);
    for (const z of [-.214, .214]) softBox(k, F.bronze, [x, top, z], [width, .005, .011], { radius: .001 });
  }
  for (const x of [-.875, .875]) {
    softBox(k, PRIVATE_VENEER, [x, .06, -.181], [.050, 2.50, .075], { radius: .003 });
    softBox(k, F.bronze, [x, .08, -.138], [.012, 2.45, .005], { radius: .001 });
  }
  for (const x of [-.71, -.43, -.09, .18, .52, .74]) {
    const bottom = x < -.23 ? .64 : 1.15;
    softBox(k, F.bronze, [x, bottom, -.167], [.014, 2.52 - bottom, .022], { radius: .002 });
  }
  for (const [x, y, width] of [[0, 1.28, 1.70], [0, 1.88, 1.70], [0, 2.47, 1.70],
    [-.48, .93, .74], [.30, 1.57, 1.10], [-.40, 2.18, .88], [.42, 2.26, .88]] as const) {
    softBox(k, F.bronze, [x, y, -.167], [width, .014, .022], { radius: .002 });
  }
  const random = (n: number): number => { const x = Math.sin(n * 127.1 + 78.2) * 43819.17; return x - Math.floor(x); };
  for (const [vine, root] of [-.68, -.45, -.13, .13, .41, .68].entries()) {
    const base = root < -.23 ? .643 : 1.153, height = 2.36 - base;
    const at = (t: number): [number, number, number] => [root + .055 * Math.sin(t * 9 + vine), base + height * t, -.045 + .036 * Math.sin(t * 11 + vine)];
    tube(k, F.stem, Array.from({ length: 21 }, (_, index) => at(index / 20)), .0045, false, 8);
    for (let node = 1; node <= 16; node++) {
      const t = (node + .6 * random(node * 3 + vine)) / 18, start = at(t);
      for (const side of [-1, 1]) {
        const end: [number, number, number] = [start[0] + side * (.032 + .023 * random(node + vine * 29)), start[1] + .025, start[2] + .033];
        tube(k, F.stem, [start, end], .0019, false, 6);
        const length = .115 + .060 * random(node * 7 + vine), breadth = .07 + .03 * random(node * 11 + vine * 3);
        const outwardEdge = Math.abs(root) > .55 && Math.sign(root) === side;
        const direction = side * (outwardEdge ? .30 : .62 + .16 * random(node + vine)), forward = .35 + .25 * random(node * 5 + vine);
        clothSurface(k, F.leaf, (u, v) => {
          const half = Math.max(.0003, breadth * .5 * Math.sin(Math.PI * v) ** .78), cross = (2 * u - 1) * half;
          return [end[0] + direction * length * v + cross * forward,
            end[1] + length * .63 * v + .010 * Math.sin(Math.PI * v) + .006 * (1 - Math.abs(u * 2 - 1)) * Math.sin(Math.PI * v),
            end[2] + forward * length * v - cross * direction];
        }, breadth, length, .0008, 4, 10);
        tube(k, F.stem, [end, [end[0] + direction * length * .84, end[1] + length * .53, end[2] + forward * length * .84]], .00065, false, 5);
      }
    }
    // Low leaves conceal the soil edge and explain the climbers' roots. Their
    // changing headings/lengths avoid six identical sparse nursery seedlings.
    for (let leaf = 0; leaf < 7; leaf++) {
      const heading = leaf * 2.399 + vine, length = .12 + .05 * random(leaf + vine * 31);
      const dx = Math.cos(heading), dz = Math.sin(heading) * .65, breadth = .052;
      clothSurface(k, F.leaf, (u, v) => {
        const cross = (u - .5) * Math.max(.0005, breadth * Math.sin(Math.PI * v));
        return [root + dx * length * v + cross * dz,
          base + .09 * Math.sin(Math.PI * v) + .023 * v + .005 * (1 - Math.abs(u * 2 - 1)),
          .015 + dz * length * v - cross * dx];
      }, breadth, length, .0008, 4, 10);
    }
  }
  // A deep service canopy supports five actual circular ventilation throats and
  // small downlights, independent from the finer lattice below it.
  softBox(k, PRIVATE_VENEER, [0, 2.55, 0], [1.8, .1, .45], { radius: .006 });
  for (const x of [-.64, -.32, 0, .32, .64]) {
    k.cylinder(F.bronze, [x, 2.542, -.05], .067, .008, 32);
    k.cylinder(F.black, [x, 2.537, -.05], .059, .005, 32);
    for (const offset of [-.036, -.018, 0, .018, .036]) {
      const width = 2 * Math.sqrt(.056 ** 2 - offset ** 2);
      softBox(k, F.graphite, [x, 2.534, -.05 + offset], [width, .003, .004], { radius: .001 });
    }
  }
  for (const x of [-.49, -.16, .16, .49]) {
    k.cylinder(F.black, [x, 2.54, .145], .024, .011, 24);
    k.cylinder(F.lensWarm, [x, 2.536, .145], .015, .004, 24);
  }
}
