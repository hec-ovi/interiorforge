import { FINISH as F } from '../../modules/finishes.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { Kit } from '../../modules/kit.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import { softBox, tube } from '../luxury/model-geometry.js';
import { DAMAGED_MODEL_MATERIALS as M } from './quality-recipes.js';

/** William Hare 173030/173142 and Clouds 174416: separate carrier, services,
 * formed enclosures, pipe collars and fine branches. Only straight runs stretch. */
export const DAMAGED_SERVICE_IDS = new Set([
  'ceiling-services-damaged-run', 'ceiling-services-damaged-hanger', 'wall-shelf-damaged-meter-bank',
]);
const sheet = (k: Kit, material: string, at: Vec3, size: Vec3, radius = .003) =>
  softBox(k, material, at, size, { radius, detail: 0 });
const pipe = (k: Kit, material: string, a: Vec3, b: Vec3, radius: number) => tube(k, material, [a, b], radius, false, 16);

export const damagedServiceRecipes: RecipeSet = add => {
  add('wall-field-damaged-lodging', k => k.cbox(M.vinyl, [0, 0, .0475], [.5, .5, .095]));
  add('wall-damaged-lodging-joint', k => {
    k.cbox(F.black, [0, 0, .001], [.009, .5, .002]);
    k.cbox(M.gunmetal, [.0065, 0, .002], [.004, .5, .002]);
  });
  add('wall-damaged-lodging-skirting', k => {
    // Sweep the rolled section along X. Changing run length never stretches its
    // rounded YZ profile, unlike scaling a rounded box into a whole wall.
    const profile = [[0, 0], [0, .007], [.025, .008], [.044, .018], [.064, .031],
      [.085, .040], [.14, .040], [.161, .037], [.179, .026], [.192, .009], [.192, 0]];
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i]!, b = profile[i + 1]!;
      k.mesh.addQuad(M.gunmetal, [[-.25, a[0]!, a[1]!], [.25, a[0]!, a[1]!],
        [.25, b[0]!, b[1]!], [-.25, b[0]!, b[1]!]]);
    }
  });
  add('wall-shelf-damaged-lodging-header', k => {
    sheet(k, M.gunmetal, [0, 0, .035], [1.4, .23, .07], .022);
    sheet(k, F.black, [0, .047, .07], [1.26, .139, .009], .015);
    for (let i = 0; i < 5; i++) sheet(k, M.stainless, [0, .060 + i * .024, .079], [1.2, .008, .019], .003);
    for (const x of [-.659, .659]) pipe(k, M.stainless, [x, .115, .066], [x, .115, .075], .005);
  });
  add('ceiling-services-damaged-run', k => {
    pipe(k, M.gunmetal, [-.25, -.18, -.19], [.25, -.18, -.19], .071);
    pipe(k, M.enamel, [-.25, -.18, .19], [.25, -.18, .19], .041);
    // An open cable carrier with restrained longitudinal bundles. Fixed-size
    // rungs are independent placements; no giant perforations on stretched trays.
    for (const z of [-.092, .092]) sheet(k, M.gunmetal, [0, -.33, z], [.5, .057, .009], .002);
    for (const z of [-.055, -.018, .018, .055]) pipe(k, F.black, [-.25, -.303, z], [.25, -.303, z], .007);
  });
  add('ceiling-services-damaged-rung', k => {
    sheet(k, M.stainless, [0, -.335, 0], [.014, .009, .187], .002);
  });
  add('ceiling-services-damaged-hanger', k => {
    for (const z of [-.29, .29]) {
      // Ceiling-field underside is +.04m relative to its placement datum.
      sheet(k, M.gunmetal, [0, -.365, z], [.018, .40, .018], .002);
      sheet(k, M.gunmetal, [0, .028, z], [.084, .012, .065], .002);
      for (const x of [-.028, .028]) pipe(k, M.stainless, [x, .02, z], [x, .03, z], .004);
    }
    sheet(k, M.gunmetal, [0, -.37, 0], [.04, .025, .60], .003);
  });
  add('ceiling-services-damaged-coupling', k => {
    for (const [z, r] of [[-.19, .071], [.19, .041]] as const) {
      pipe(k, M.stainless, [-.027, -.18, z], [.027, -.18, z], r + .008);
      for (const x of [-.030, .022]) pipe(k, M.gunmetal, [x, -.18, z], [x + .008, -.18, z], r + .012);
    }
  });
  add('ceiling-services-damaged-branch', k => pipe(k, M.stainless, [-.25, -.18, 0], [.25, -.18, 0], .018));
  add('ceiling-services-damaged-elbow', k => {
    tube(k, M.stainless, [[-.12, -.18, 0], [-.055, -.18, 0], [-.028, -.188, 0],
      [-.008, -.21, 0], [0, -.238, 0], [0, -.30, 0]], .018, false, 16);
    pipe(k, M.gunmetal, [-.125, -.18, 0], [-.099, -.18, 0], .023);
  });
  add('wall-shelf-damaged-feed', k => pipe(k, M.stainless, [0, 0, 0], [0, .5, 0], .018));
  add('wall-shelf-damaged-feed-clip', k => {
    pipe(k, M.gunmetal, [0, -.012, 0], [0, .012, 0], .024);
    sheet(k, M.gunmetal, [0, -.035, -.074], [.11, .07, .008], .003);
    sheet(k, M.gunmetal, [0, -.012, -.048], [.027, .024, .049], .002);
    for (const x of [-.04, .04]) pipe(k, M.stainless, [x, 0, -.071], [x, 0, -.066], .004);
  });
  add('wall-shelf-damaged-meter-drops', k => {
    for (const x of [-.38, 0, .38]) for (const dx of [-.075, .075])
      pipe(k, M.gunmetal, [x + dx, 0, 0], [x + dx, .5, 0], .012);
  });
  add('wall-shelf-damaged-meter-drop-clips', k => {
    for (const x of [-.38, 0, .38]) for (const dx of [-.075, .075])
      pipe(k, M.stainless, [x + dx, -.012, 0], [x + dx, .012, 0], .016);
  });
  add('wall-shelf-damaged-meter-bank', k => {
    // One supply branches into three formed casings at varied stand-off depths.
    // A dark reveal is visible all around the inset access doors.
    pipe(k, M.stainless, [0, 1.11, .072], [0, .95, .072], .018);
    tube(k, M.stainless, [[-.38, .95, .072], [-.38, .99, .072], [-.35, 1.02, .072],
      [.35, 1.02, .072], [.38, .99, .072], [.38, .95, .072]], .014, false, 12);
    for (const x of [-.38, 0, .38]) {
      const front = x === 0 ? .194 : .174;
      sheet(k, M.gunmetal, [x, .31, .075], [.335, .64, .15], .012);
      sheet(k, F.black, [x, .345, front - .025], [.287, .569, .012], .006);
      sheet(k, M.enamel, [x, .355, front - .018], [.274, .548, .028], .009);
      sheet(k, M.gunmetal, [x, .695, front + .002], [.179, .111, .013], .003);
      sheet(k, F.black, [x, .708, front + .010], [.147, .081, .002], .001);
      // Quiet etched register bars, a label and a narrow physical latch.
      for (let i = 0; i < 5; i++) sheet(k, M.stainless, [x - .052 + i * .026, .728, front + .012], [.009, .03, .001], .0004);
      sheet(k, F.paper, [x - .025, .591, front + .011], [.13, .032, .001], .001);
      sheet(k, M.stainless, [x + .096, .47, front + .013], [.012, .077, .012], .003);
      for (const dx of [-.107, .107]) for (const y of [.375, .869]) {
        pipe(k, M.stainless, [x + dx, y, front + .005], [x + dx, y, front + .010], .004);
      }
      for (const dx of [-.075, .075]) {
        pipe(k, M.gunmetal, [x + dx, 0, .065], [x + dx, .31, .065], .012);
        for (const y of [.07, .235]) pipe(k, M.stainless, [x + dx, y, .065], [x + dx, y + .027, .065], .016);
      }
    }
    // A service loop has real curvature and starts/ends on the boxes.
    tube(k, F.black, [[-.53, .47, .13], [-.58, .43, .13], [-.59, .29, .13],
      [-.56, .23, .13], [-.50, .23, .13], [-.47, .29, .13], [-.47, .31, .13]], .006, false, 10);
  });
};
