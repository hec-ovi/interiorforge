import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import { vessel } from '../../modules/recipes/sanitary.js';
import { smoothSurface, softBox, tube, welt } from '../luxury/model-geometry.js';

export const DAMAGED_MODEL_MATERIALS = {
  gunmetal: 'cyberpunk/interior-service-gunmetal/poor#aged',
  enamel: 'cyberpunk/interior-service-enamel/poor#petrol',
  vinyl: 'cyberpunk/interior-service-vinyl/poor#umber',
  cloth: 'cyberpunk/meridian-upholstery/rich#charcoal',
  bedding: 'cyberpunk/meridian-bedding/rich#ivory',
  stainless: 'cyberpunk/interior-alloy/rich#satin-fine',
} as const;
const M = DAMAGED_MODEL_MATERIALS;
const metal = M.gunmetal;

/** Tight rolled metal edges catch light without looking like padded plastic. */
function sheet(k: Kit, slot: string, at: Vec3, size: Vec3, radius = .003): void {
  softBox(k, slot, at, size, { radius, detail: 0 });
}
function pull(k: Kit, x: number, y: number, z: number, width = .12): void {
  tube(k, M.stainless, [[x - width / 2, y, z], [x - width / 2, y, z + .018],
    [x - width / 2 + .008, y, z + .025], [x + width / 2 - .008, y, z + .025],
    [x + width / 2, y, z + .018], [x + width / 2, y, z]], .005, false, 8);
}
function bolt(k: Kit, x: number, y: number, z: number): void {
  // A proper shallow head, small enough to stay subordinate to the cabinet.
  sheet(k, M.stainless, [x, y, z], [.011, .011, .003], .002);
  k.cbox(F.black, [x, y + .005, z + .0017], [.006, .001, .0005]);
}
function seat(k: Kit, at: Vec3, size: Vec3): void {
  softBox(k, M.vinyl, at, size, { radius: .035, crown: .012, wrinkles: .0025, detail: 10 });
  welt(k, M.vinyl, [at[0], at[1] + .038, at[2]], size[0] - .012, size[2] - .012, .031, .0018);
}

export const DAMAGED_QUALITY_IDS = new Set([
  'fit-damaged-sofa', 'fit-damaged-chair', 'fit-damaged-office-chair',
  'fit-damaged-kitchen', 'fit-damaged-fridge', 'fit-damaged-caretaker-desk', 'fit-damaged-bed', 'fit-damaged-bed-single', 'fit-damaged-wardrobe',
  'wall-screen-damaged',
  'fit-damaged-meeting-table',
]);

/** References: Jig-Jig rail-frame bed, segmented plain upholstered seats and deeply
 * fitted cabinets. This geometry deliberately excludes the source's decorative theme. */
export const damagedQualityRecipes: RecipeSet = add => {
  add('fit-damaged-meeting-table', k => {
    // The communal table has its own canonical 2.8×1.2m construction. Enlarging
    // the small domestic table would also stretch its legs and edge radius.
    sheet(k, metal, [0, .677, 0], [2.67, .032, 1.07], .012);
    sheet(k, M.enamel, [0, .709, 0], [2.8, .041, 1.2], .018);
    for (const x of [-1.18, 1.18]) for (const z of [-.43, .43]) {
      tube(k, metal, [[x, .023, z], [x, .692, z]], .026, false, 12);
      sheet(k, F.black, [x, 0, z], [.075, .025, .075], .008);
      tube(k, M.stainless, [[x, .647, z], [x, .67, z]], .029, false, 12);
    }
    for (const z of [-.43, .43]) tube(k, metal, [[-1.18, .25, z], [1.18, .25, z]], .018, false, 12);
    for (const x of [-1.18, 1.18]) tube(k, metal, [[x, .25, -.43], [x, .25, .43]], .018, false, 12);
  });
  add('wall-screen-damaged', k => {
    // Closed formed casing and a plain dark glass display; no inherited bronze
    // picture frame, themed advert or purple imagery in the worn lodging room.
    sheet(k, metal, [0, 0, 0], [1.2, .7, .074], .012);
    k.cbox(F.black, [0, .026, .037], [1.15, .648, .002]);
    k.cbox(F.glass, [0, .044, .039], [1.108, .61, .002]);
    for (const x of [-.12, -.06, 0, .06, .12]) k.cbox(F.black, [x, .009, .038], [.035, .005, .002]);
    tube(k, M.stainless, [[.51, .017, .036], [.51, .017, .04]], .006, false, 12);
    for (const x of [-.55, .55]) for (const y of [.055, .635])
      tube(k, M.stainless, [[x, y, -.039], [x, y, -.035]], .004, false, 10);
  });
  add('fit-damaged-sofa', k => {
    for (const x of [-.78, .78]) for (const z of [-.32, .32]) {
      tube(k, metal, [[x, .012, z], [x, .18, z]], .025, false, 10);
      sheet(k, F.black, [x, 0, z], [.068, .018, .068], .009);
    }
    sheet(k, metal, [0, .15, 0], [1.76, .16, .78], .009);
    sheet(k, M.enamel, [0, .195, .382], [1.66, .075, .026], .004);
    for (const x of [-.409, .409]) {
      seat(k, [x, .305, .02], [.797, .185, .65]);
      softBox(k, M.vinyl, [x, .445, -.286], [.79, .355, .17], {
        radius: .041, frontCrown: .012, lean: .11, wrinkles: .002, detail: 9,
      });
    }
    for (const x of [-.855, .855]) {
      sheet(k, metal, [x, .28, -.005], [.09, .285, .82], .014);
      softBox(k, M.vinyl, [x, .54, -.005], [.09, .065, .80], { radius: .025 });
      for (const z of [-.31, .29]) bolt(k, x, .355, z);
    }
  });
  add('fit-damaged-chair', k => {
    for (const x of [-.186, .186]) {
      tube(k, metal, [[x, .014, .184], [x, .413, .166], [x, .444, .14],
        [x, .444, -.15], [x, .422, -.18], [x, .014, -.2]], .013, false, 10);
      tube(k, metal, [[x, .43, -.175], [x, .82, -.195], [x, .878, -.182]], .012, false, 10);
    }
    seat(k, [0, .423, .012], [.438, .067, .416]);
    softBox(k, M.vinyl, [0, .632, -.174], [.413, .268, .055], { radius: .019, frontCrown: .005, detail: 9 });
    tube(k, metal, [[-.186, .25, -.2], [.186, .25, -.2]], .012, false, 10);
  });
  add('fit-damaged-office-chair', k => {
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5, x = Math.cos(a) * .27, z = Math.sin(a) * .27;
      tube(k, metal, [[0, .16, 0], [x * .65, .105, z * .65], [x, .071, z]], .018, false, 10);
      sheet(k, F.black, [x, .01, z], [.058, .065, .058], .02);
    }
    tube(k, M.stainless, [[0, .12, 0], [0, .42, 0]], .028, false, 12);
    seat(k, [0, .415, .01], [.535, .075, .48]);
    sheet(k, metal, [0, .45, -.228], [.074, .63, .035], .005);
    softBox(k, M.vinyl, [0, .64, -.229], [.494, .51, .11], { radius: .05, frontCrown: .012, detail: 10 });
    for (const x of [-.295, .295]) {
      tube(k, metal, [[x, .44, -.06], [x, .62, -.06], [x, .64, -.02]], .013, false, 10);
      softBox(k, M.vinyl, [x, .64, -.02], [.055, .035, .34], { radius: .015 });
    }
  });
  for (const [id, width] of [['fit-damaged-bed', 1.6], ['fit-damaged-bed-single', 1]] as const) add(id, k => bed(k, width));
  add('fit-damaged-wardrobe', k => {
    sheet(k, F.black, [0, 0, -.015], [1.48, .075, .56], .009);
    sheet(k, metal, [0, .075, -.3], [1.6, 1.925, .05], .007);
    for (const x of [-.782, .782]) sheet(k, metal, [x, .075, 0], [.036, 1.925, .65], .006);
    for (const y of [.075, 1.969]) sheet(k, metal, [0, y, 0], [1.6, .031, .65], .005);
    // Doors sit inside rolled reveals. One practical full-height door, one drawer bay.
    sheet(k, M.enamel, [-.391, .115, .270], [.746, 1.833, .039], .007);
    pull(k, -.075, 1.08, .289, .11);
    for (const [y, h] of [[.115, .43], [.558, .43], [1.001, .947]]) {
      sheet(k, M.enamel, [.391, y!, .270], [.746, h!, .039], .007);
      pull(k, .391, y! + h! - .085, .289, .22);
    }
    for (let i = 0; i < 7; i++) {
      const x = -.65 + i * .084;
      sheet(k, F.black, [x, .20, .309], [.061, .005, .002], .001);
      sheet(k, M.stainless, [x, .21, .31], [.061, .002, .002], .001);
    }
    for (const x of [-.745, .745]) for (const y of [.10, 1.93]) bolt(k, x, y, .319);
  });
  add('fit-damaged-fridge', k => {
    sheet(k, metal, [0, 0, 0], [.7, 1.8, .7], .018);
    sheet(k, F.black, [0, .08, .344], [.667, 1.686, .01], .007);
    for (const [y, h] of [[.1, 1.08], [1.196, .554]]) {
      sheet(k, M.enamel, [0, y!, .338], [.656, h!, .024], .009);
      // Recessed edge pulls cannot project beyond the planner's700mm footprint.
      sheet(k, F.black, [.252, y! + h! * .45, .351], [.021, .23, .002], .003);
    }
    for (let i = 0; i < 7; i++) sheet(k, F.black, [-.252 + i * .084, .025, .351], [.06, .012, .002], .002);
    sheet(k, F.paper, [-.17, 1.49, .352], [.14, .16, .001], .001);
  });
  add('fit-damaged-kitchen', kitchen);
  add('fit-damaged-caretaker-desk', k => {
    // One real drawer pedestal and visible staff knee-space. Its conservative
    // furniture reservation stays intact; the staff approach is behind the counter.
    sheet(k, F.black, [-.95, 0, -.01], [.50, .075, .71], .007);
    sheet(k, metal, [-.95, .075, -.01], [.54, .68, .74], .006);
    for (const y of [.11, .315, .52]) {
      sheet(k, M.enamel, [-.95, y, -.386], [.50, .187, .021], .005);
      // Staff-facing pulls stay beneath the worktop's rear edge.
      tube(k, M.stainless, [[-1.08, y + .13, -.402], [-.82, y + .13, -.402]], .006, false, 10);
    }
    for (const z of [-.35, .35]) tube(k, metal, [[1.12, .01, z], [1.12, .759, z]], .021, false, 10);
    sheet(k, metal, [0, .715, 0], [2.5, .042, .81], .007);
    sheet(k, M.stainless, [0, .757, 0], [2.6, .031, .86], .009);
    sheet(k, M.enamel, [0, .15, .389], [2.58, .815, .041], .007);
    for (const x of [-.858, 0, .858]) {
      sheet(k, metal, [x, .195, .412], [.016, .725, .010], .002);
      for (const y of [.25, .85]) bolt(k, x, y, .419);
    }
    sheet(k, metal, [0, .962, .33], [2.6, .032, .22], .009);
    sheet(k, M.stainless, [0, .994, .33], [2.6, .018, .22], .007);
    // Compact terminal and separate foot, with a recessed non-emissive screen.
    sheet(k, metal, [-.40, .788, -.14], [.27, .018, .19], .012);
    sheet(k, metal, [-.40, .806, -.19], [.05, .07, .05], .004);
    sheet(k, metal, [-.40, .876, -.19], [.37, .224, .038], .009);
    sheet(k, F.black, [-.40, .891, -.211], [.337, .192, .002], .003);
    // A writing pad and simple pencil remain small, quiet signs of habitation.
    sheet(k, F.paper, [.42, .789, -.08], [.29, .006, .36], .005);
    tube(k, M.enamel, [[.64, .799, -.14], [.64, .799, .03]], .003, false, 6);
  });
};

function bed(k: Kit, width: number): void {
  const side = width / 2 - .035;
  for (const x of [-side, side]) {
    for (const z of [-.965, .965]) tube(k, metal, [[x, .012, z], [x, .315, z]], .022, false, 12);
    tube(k, metal, [[x, .29, -.965], [x, .29, .965]], .025, false, 12);
  }
  for (const z of [-.965, .965]) tube(k, metal, [[-side, .29, z], [side, .29, z]], .025, false, 12);
  for (let i = 0; i < 10; i++) sheet(k, metal, [0, .286, -.9 + i * .2], [width - .12, .022, .032], .004);
  softBox(k, M.bedding, [0, .31, .022], [width - .115, .21, 1.985], { radius: .038, crown: .008, detail: 6 });
  welt(k, M.bedding, [0, .352, .022], width - .128, 1.969, .036, .002);
  welt(k, M.bedding, [0, .482, .022], width - .128, 1.969, .036, .002);
  blanket(k, width - .045);
  const pillowCount = width > 1.3 ? 2 : 1;
  for (let i = 0; i < pillowCount; i++) {
    const x = pillowCount === 1 ? 0 : (i - .5) * .74;
    softBox(k, M.bedding, [x, .521, -.697], [pillowCount === 1 ? .68 : .65, .105, .44], {
      radius: .035, crown: .024, wrinkles: .003, detail: 12,
    });
  }
  // Free-standing head rail and separate padded panels; no room wall or giant prop box.
  const back = -1.018;
  tube(k, metal, [[-side, .29, back], [-side, .95, back], [-side + .035, .985, back],
    [side - .035, .985, back], [side, .95, back], [side, .29, back]], .018, false, 12);
  for (const x of [-width * .23, width * .23]) softBox(k, M.vinyl, [x, .55, -1.018],
    [width * .44, .36, .062], { radius: .016, frontCrown: .004, detail: 6 });
}

/** A closed plain woven blanket with modest folds and an actual hanging foot. */
function blanket(k: Kit, width: number): void {
  const nx = 26, nz = 30, stride = nx + 1, layer = stride * (nz + 1);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const lower of [false, true]) for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = width * (i / nx - .5), z = -.43 + j / nz * 1.465;
    const edge = Math.min(1, Math.max(0, (Math.abs(x) - width / 2 + .05) / .05));
    const foot = Math.min(1, Math.max(0, (z - .94) / .095));
    const fold = .0028 * (Math.sin(x * 26 + z * 11) + .45 * Math.sin(z * 38 - x * 9));
    const y = .553 + fold + .012 * Math.exp(-(((z + .35) / .06) ** 2)) - .065 * edge ** 2 - .09 * foot ** 2;
    positions.push(x, y - (lower ? .012 : 0), z); uvs.push(x + width / 2, z + .43);
  }
  for (const offset of [0, layer]) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = offset + j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    indices.push(...(offset ? [a, b, d, a, d, c] : [a, d, b, a, c, d]));
  }
  const edge: number[] = [];
  for (let i = 0; i < nx; i++) edge.push(i);
  for (let j = 0; j < nz; j++) edge.push(j * stride + nx);
  for (let i = nx; i > 0; i--) edge.push(nz * stride + i);
  for (let j = nz; j > 0; j--) edge.push(j * stride);
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i]!, b = edge[(i + 1) % edge.length]!;
    indices.push(a, b, b + layer, a, b + layer, a + layer);
  }
  k.mesh.addSurface(M.cloth, smoothSurface({ positions, normals, uvs, indices }));
}

function kitchen(k: Kit): void {
  sheet(k, F.black, [0, .02, -.016], [2.29, .085, .55], .008);
  for (const x of [-1.181, 0, 1.181]) sheet(k, metal, [x, .10, -.014], [.038, .775, .586], .004);
  sheet(k, metal, [0, .10, -.304], [2.4, .775, .025], .004);
  sheet(k, metal, [0, .1, -.01], [2.4, .035, .62], .004);
  // Four inset doors, thin edges and practical bent pulls. Countertop is900mm high.
  for (let i = 0; i < 4; i++) {
    const x = -.9 + .6 * i;
    sheet(k, M.enamel, [x, .125, .286], [.585, .747, .03], .004);
    pull(k, x + .16, .788, .298, .11);
  }
  // Closed continuous worktop follows the pressed rim, without rectangular corner gaps.
  kitchenCounter(k);
  vessel(k, M.stainless, [
    { x: -.51, y: .738, z: 0, rx: .045, rz: .04, power: 3 },
    { x: -.51, y: .75, z: 0, rx: .19, rz: .14, power: 5 },
    { x: -.51, y: .89, z: 0, rx: .268, rz: .218, power: 6 },
    { x: -.51, y: .907, z: 0, rx: .271, rz: .222, power: 6 },
    { x: -.51, y: .912, z: 0, rx: .254, rz: .205, power: 6 },
    { x: -.51, y: .888, z: 0, rx: .245, rz: .196, power: 6 },
    { x: -.51, y: .776, z: 0, rx: .174, rz: .125, power: 5 },
    { x: -.51, y: .756, z: 0, rx: .04, rz: .033, power: 3 },
  ], 40);
  k.cylinder(F.black, [-.51, .756, 0], .032, .003, 24);
  k.cylinder(M.stainless, [-.51, .759, 0], .029, .002, 24);
  for (const x of [-.526, -.51, -.494]) k.cbox(F.black, [x, .762, 0], [.006, .001, .032]);
  tube(k, M.stainless, [[-.51, .9, -.279], [-.51, .998, -.279], [-.51, 1.022, -.255],
    [-.51, 1.027, -.17], [-.51, 1.008, -.145]], .011, false, 12);
  sheet(k, M.stainless, [-.448, .931, -.279], [.06, .009, .021], .003);
  sheet(k, metal, [0, .906, -.313], [2.4, .143, .024], .005);
  sheet(k, F.black, [.63, .907, .002], [.78, .008, .53], .007);
  for (const x of [.44, .82]) for (const z of [-.13, .13]) {
    k.cylinder(metal, [x, .915, z], .069, .012, 24);
    for (const sign of [-1, 1]) tube(k, metal, [[x - .085, .931, z + sign * .073],
      [x + .085, .931, z + sign * .073]], .006, false, 8);
  }
  for (const x of [.4, .55, .7, .85]) k.cylinder(M.stainless, [x, .916, .226], .014, .013, 16);
}


function kitchenCounter(k: Kit): void {
  const cx = -.51, rx = .26, rz = .211, low = .878, high = .906;
  const angles = Array.from({ length: 64 }, (_, i) => i / 64 * Math.PI * 2);
  // Include actual outer corners so the radial decomposition retains a full rectangular top.
  for (const x of [-1.2, 1.2]) for (const z of [-.325, .325]) {
    let a = Math.atan2(z, x - cx); if (a < 0) a += Math.PI * 2; angles.push(a);
  }
  angles.sort((a, b) => a - b);
  const inside: Vec3[] = [], outside: Vec3[] = [];
  for (const a of angles) {
    const c = Math.cos(a), s = Math.sin(a);
    const inner: Vec3 = [cx + rx * Math.sign(c) * Math.abs(c) ** (1 / 3), low,
      rz * Math.sign(s) * Math.abs(s) ** (1 / 3)];
    const tx = c >= 0 ? (1.2 - cx) / c : (-1.2 - cx) / c;
    const tz = s >= 0 ? .325 / s : -.325 / s;
    const distance = Math.min(Math.abs(tx), Math.abs(tz));
    inside.push(inner); outside.push([cx + c * distance, low, s * distance]);
  }
  const atTop = (p: Vec3): Vec3 => [p[0], high, p[2]];
  for (let i = 0; i < angles.length; i++) {
    const j = (i + 1) % angles.length, a = inside[i]!, b = inside[j]!, c = outside[i]!, d = outside[j]!;
    const top = [atTop(a), atTop(b), atTop(d), atTop(c)];
    k.mesh.addSurface(M.stainless, { positions: top.flat(), normals: top.flatMap(() => [0, 1, 0]),
      uvs: top.flatMap(p => [p[0] + 1.2, p[2] + .325]), indices: [0, 1, 2, 0, 2, 3] });
    k.mesh.addQuad(M.stainless, [a, c, d, b]);
    k.mesh.addQuad(M.stainless, [c, atTop(c), atTop(d), d]);
    k.mesh.addQuad(M.stainless, [b, atTop(b), atTop(a), a]);
  }
}
