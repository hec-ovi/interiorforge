import type { Point } from '../../core/geom.js';
import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { biotechnicaSeat, corpoBed, REFERENCE_MATERIAL as R } from './reference-furniture.js';
import { softBox, tube, smoothSurface } from './model-geometry.js';

/** Biotechnica public seating and V Corpo private furniture are separate
 * authored families. See MODEL-STUDY.md for full-resolution reference IDs.
 * Dimensions and textile/veneer coordinates remain metric. */
const counterStone = R.stone;
const stainless = 'cyberpunk/interior-alloy/rich#satin-fine';

function roundRect(w: number, d: number, radius: number, x = 0, z = 0): Point[] {
  const r = Math.min(radius, w / 2, d / 2), out: Point[] = [];
  for (const [cx, cz, start] of [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 90],
    [-w / 2 + r, -d / 2 + r, 180], [w / 2 - r, -d / 2 + r, 270]]) {
    for (let i = 0; i <= 8; i++) {
      const a = (start! + i * 11.25) * Math.PI / 180;
      out.push([x + cx! + Math.cos(a) * r, z + cz! + Math.sin(a) * r]);
    }
  }
  return out;
}
function rounded(k: Kit, slot: string, x: number, y: number, z: number, w: number, h: number, d: number, r: number): void {
  softBox(k, slot, [x, y, z], [w, h, d], { radius: Math.min(h * .3, .008), planRadius: r, detail: 0 });
}
function strip(k: Kit, x: number, y: number, z: number, width: number): void {
  k.cbox(F.black, [x, y, z], [width + 0.02, 0.028, 0.024]);
  k.cbox(F.lensWarm, [x, y + 0.006, z + 0.014], [width, 0.012, 0.005]);
}

/** Plan sizes the luxury low table is authored at (id, width, depth). */
export const LOW_TABLE_SIZES: readonly (readonly [string, number, number])[] = [['fit-low-table-luxury', 1.6, .9], ['fit-low-table-luxury-80', .8, .8]];

/** A low table w x d x 0.4: a black plinth, two bronze panels standing on it 0.28 in from
 *  the ends, a bronze tray and a stone top with rounded corners. */
function lowTable(k: Kit, w: number, d: number): void {
  rounded(k, F.black, 0, 0, 0, w - 0.44, 0.07, d - 0.42, 0.05);
  for (const x of [-(w / 2 - 0.28), w / 2 - 0.28]) rounded(k, F.bronze, x, 0.07, 0, 0.065, 0.27, d - 0.32, 0.02);
  rounded(k, F.bronze, 0, 0.34, 0, w, 0.014, d, 0.10);
  rounded(k, counterStone, 0, 0.354, 0, w - 0.01, 0.046, d - 0.01, 0.095);
}

/** One stone slab with a real sink aperture. Shared plane/UVs remove false
 * grout lines where the four sides of the opening meet. */
function kitchenCounter(k: Kit): void {
  const xs = [-1.2, .405, .895, 1.2], zs = [-.375, -.185, .215, .375];
  const quad = (points: [number, number, number][], normal: [number, number, number]) => {
    k.mesh.addSurface(counterStone, { positions: points.flat(), normals: points.flatMap(() => normal),
      uvs: points.flatMap(p => Math.abs(normal[1]) > .5 ? [p[2], p[0]] : [normal[0] ? p[2] : p[0], p[1]]), indices: [0, 1, 2, 0, 2, 3] });
  };
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    if (i === 1 && j === 1) continue;
    const x = xs[i]!, X = xs[i + 1]!, z = zs[j]!, Z = zs[j + 1]!;
    quad([[x, .945, z], [x, .945, Z], [X, .945, Z], [X, .945, z]], [0, 1, 0]);
    quad([[x, .89, z], [X, .89, z], [X, .89, Z], [x, .89, Z]], [0, -1, 0]);
    if (i === 0 || i === 2 && j === 1) quad([[x, .89, Z], [x, .945, Z], [x, .945, z], [x, .89, z]], [-1, 0, 0]);
    if (i === 2 || i === 0 && j === 1) quad([[X, .89, z], [X, .945, z], [X, .945, Z], [X, .89, Z]], [1, 0, 0]);
    if (j === 0 || j === 2 && i === 1) quad([[x, .89, z], [x, .945, z], [X, .945, z], [X, .89, z]], [0, 0, -1]);
    if (j === 2 || j === 0 && i === 1) quad([[X, .89, Z], [X, .945, Z], [x, .945, Z], [x, .89, Z]], [0, 0, 1]);
  }
}

/** Stainless pressed sink shell: rounded lip, curved bowl, closed underside. */
function kitchenBasin(k: Kit): void {
  const rings = [
    { w: .532, d: .438, y: .951, r: .058 }, { w: .485, d: .391, y: .951, r: .048 },
    { w: .463, d: .369, y: .941, r: .048 }, { w: .445, d: .351, y: .911, r: .05 },
    { w: .413, d: .319, y: .829, r: .055 }, { w: .38, d: .286, y: .811, r: .055 },
    { w: .353, d: .259, y: .807, r: .055 },
  ];
  const polygons = rings.map(r => roundRect(r.w, r.d, r.r, .65, .015));
  const positions: number[] = [], indices: number[] = [], uvs: number[] = [];
  const count = polygons[0]!.length, stride = count + 1;
  let down = 0;
  for (let j = 0; j < rings.length; j++) {
    if (j) down += Math.hypot(rings[j]!.y - rings[j - 1]!.y, (rings[j]!.w - rings[j - 1]!.w) / 2);
    let along = 0;
    for (let i = 0; i <= count; i++) {
      const [x, z] = polygons[j]![i % count]!;
      if (i) { const prev = polygons[j]![(i - 1) % count]!; along += Math.hypot(x - prev[0], z - prev[1]); }
      positions.push(x, rings[j]!.y, z); uvs.push(along, down);
    }
  }
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < count; i++) {
    const a = j * stride + i, b = a + 1, c = a + stride, d = b + stride;
    indices.push(a, c, d, a, d, b);
  }
  // Independent planar floor UVs meet the developed, unstretched wall panels.
  const base = positions.length / 3;
  for (const [x, z] of polygons.at(-1)!) { positions.push(x, .807, z); uvs.push(x, z); }
  const center = positions.length / 3; positions.push(.65, .807, .015); uvs.push(.65, .015);
  for (let i = 0; i < count; i++) indices.push(center, base + (i + 1) % count, base + i);
  k.mesh.addSurface(stainless, smoothSurface({ positions, indices, uvs, normals: [] }));
  // Concealed outside shell closes the pressed metal beneath the inner bowl.
  k.mesh.addPrism(stainless, polygons[0]!, .804, .951, 'world', 'none');
  k.mesh.addHorizontalPolygon(stainless, polygons[0]!, .804, 'down');
  k.cylinder(F.black, [.65, .8071, .015], .023, .001, 24);
  k.cylinder(stainless, [.65, .8082, .015], .017, .001, 24);
}

export const luxuryFurnitureRecipes: RecipeSet = add => {
  add('fit-sofa-luxury', k => biotechnicaSeat(k));
  add('fit-chair-luxury', k => biotechnicaSeat(k, true));
  // a long coffee table and a square side table of the same make: a small record stands
  // the square one instead of squeezing the long one's bronze panels (placements/props.ts)
  for (const [id, w, d] of LOW_TABLE_SIZES) add(id, k => lowTable(k, w, d));
  add('fit-reception-desk-luxury', k => {
    // A substantial two-height concierge counter, with a real staff work surface
    // and a low accessible return. Coordinates fit the composition's 3.8m bay.
    softBox(k,F.black,[.48,0,.12],[2.64,.095,.58],{radius:.018});
    softBox(k,R.veneer,[.48,.095,.330],[2.76,.945,.27],{radius:.013});
    for(const x of[-.854,1.854])softBox(k,R.veneer,[x,.095,-.005],[.075,.945,.89],{radius:.006});
    softBox(k,F.bronze,[.48,1.039,0],[2.84,.009,1.0],{radius:.003});
    softBox(k,counterStone,[.48,1.048,0],[2.84,.052,1.0],{radius:.012});
    softBox(k,R.veneer,[.48,.742,-.10],[2.64,.039,.56],{radius:.004});
    softBox(k,R.veneer,[-1.39,.736,0],[1.02,.034,.89],{radius:.004});
    softBox(k,F.bronze,[-1.39,.770,0],[1.02,.006,.92],{radius:.002});
    softBox(k,counterStone,[-1.39,.776,0],[1.02,.040,.92],{radius:.007});
    softBox(k,R.veneer,[-1.852,0,0],[.084,.736,.82],{radius:.006});
    for(let i=0;i<25;i++)softBox(k,R.veneer,[-.72+i*.104,.164,.472],[.046,.785,.012],{radius:.002});
    // Screen is visibly supported on the staff desktop, facing the operator.
    softBox(k,F.black,[.55,.781,-.22],[.23,.015,.15],{radius:.008});
    softBox(k,F.black,[.55,.796,-.22],[.038,.10,.035],{radius:.006});
    softBox(k,F.black,[.55,.875,-.22],[.405,.218,.026],{radius:.006});
    k.cbox(F.screen,[.55,.890,-.235],[.377,.187,.004],'unit');
    strip(k,.48,.10,.466,2.52);
  });
  add('fit-bar-counter-luxury', k => {
    rounded(k, F.black, 0, 0, 0, 2.76, 0.10, 0.61, 0.20);
    rounded(k, F.bronze, 0, 0.10, 0, 2.88, 0.025, 0.74, 0.24);
    rounded(k, R.veneer, 0, 0.125, 0.10, 2.9, 0.885, 0.62, 0.26);
    // Staff-side work shelf, below the guest top.
    k.cbox(F.black, [0, 0.72, -0.32], [2.36, 0.035, 0.25]);
    rounded(k, F.bronze, 0, 1.01, 0, 3, 0.016, 0.9, 0.28);
    rounded(k, counterStone, 0, 1.026, 0, 3, 0.074, 0.9, 0.28);
    strip(k, 0, 0.127, 0.409, 2.1);
    for (const x of [-0.95, 0.95]) tube(k, F.bronze, [[x, 0.22, 0.40], [x, 0.22, 0.435]], .012, false, 12);
    tube(k, F.bronze, [[-1.1, 0.22, 0.435], [1.1, 0.22, 0.435]], .012, false, 16);
  });
  add('fit-kitchen-run-luxury', k => {
    // Cabinet carcass, toe recess and individual inset fronts retain real joinery.
    softBox(k, F.black, [0, 0, -.025], [2.3, .10, .61], { radius: .005 });
    softBox(k, R.veneer, [0, .1, -.015], [2.4, .025, .69], { radius: .004 });
    for (const x of [-1.188, 1.188]) softBox(k, R.veneer, [x, .125, -.015], [.024, .765, .69], { radius: .003 });
    softBox(k, R.veneer, [0, .125, -.347], [2.352, .765, .024], { radius: .003 });
    for (const x of [-.6, 0, .6]) softBox(k, R.veneer, [x, .125, -.015], [.018, .60, .66], { radius: .002 });
    for (let i = 0; i < 4; i++) {
      const x = -.9 + i * .6;
      for (const [y, h] of [[.105, .555], [.669, .211]]) {
        softBox(k, R.veneer, [x, y!, .337], [.585, h!, .035], { radius: .0035 });
        softBox(k, F.black, [x, y! + h! - .025, .357], [.40, .018, .009], { radius: .003 });
        tube(k, F.bronze, [[x - .17, y! + h! - .013, .365], [x + .17, y! + h! - .013, .365]], .005, false, 10);
      }
    }
    // Actual counter opening: no opaque stone slab remains across the bowl.
    kitchenCounter(k);
    softBox(k, counterStone, [0, .945, -.356], [2.4, .105, .038], { radius: .003 });
    kitchenBasin(k);
    // One bent cylindrical mixer spout, distinct from its base and lever.
    const spout: [number, number, number][] = [[.65, .945, -.265], [.65, 1.065, -.265]];
    for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI; spout.push([.65, 1.085 + Math.sin(a) * .065, -.2 - Math.cos(a) * .065]); }
    spout.push([.65, 1.068, -.135]);
    tube(k, stainless, spout, .013, false, 16);
    softBox(k, stainless, [.65, .945, -.265], [.060, .013, .060], { radius: .005 });
    tube(k, stainless, [[.674, .968, -.265], [.699, 1.020, -.265]], .006, false, 12);
    softBox(k, F.black, [-.60, .945, .01], [.65, .010, .46], { radius: .004 });
    for (const x of [-.76, -.45]) for (const z of [-.1, .13]) {
      // Induction markings are thin inlaid rings rather than raised toy discs.
      const points: [number, number, number][] = [];
      for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; points.push([x + Math.cos(a) * .078, .956, z + Math.sin(a) * .078]); }
      tube(k, F.graphite, points, .0008, true, 6);
    }
    for (let i = 0; i < 4; i++) k.cbox(stainless, [-.71 + i * .073, .956, .19], [.018, .0007, .003]);
  });
  add('fit-bed-luxury', corpoBed);
};
