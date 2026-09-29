import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import { softBox, tube } from './model-geometry.js';
import { REFERENCE_MATERIAL as R } from './reference-furniture.js';

const PRIVATE_VENEER = 'cyberpunk/corpo-plaza-veneer/rich#smoked';

/** Apartment 1702's vanity: two separate dark faceted bowls,
 * horizontally ribbed floating cabinetry and one broad mirror/display. The
 * shared planted recess does not make this the Corpo Plaza trough fixture. */
export const LOFT_VANITY_FIT = { module: 'fit-basin-loft1702', size: [2.2, .6, .9] as [number, number, number] };
export const LOFT_VANITY_LIGHTS = {
  size: LOFT_VANITY_FIT.size,
  lenses: [{ at: [0, 2.096, -.16] as [number, number, number], length: .72, lumens: 210, up: false }],
};

function bowl(k: Kit, x: number): void {
  const basin = 'cyberpunk/corpo-plaza-stone/rich#basin';
  // Eight planar faces are intentional source geometry, with a small separate
  // rim bevel. The inside is a real cavity and reaches its drain below the lip.
  const sections = [
    [.748, .17, .10], [.758, .20, .12], [.895, .338, .215],
    [.902, .341, .217], [.906, .337, .213], [.906, .317, .193],
    [.895, .312, .188], [.772, .16, .090], [.769, .065, .043],
  ];
  const ring = (section: number[]): Vec3[] => {
    const [y, rx, rz] = section;
    return [[-.70, -1], [.70, -1], [1, -.58], [1, .58], [.70, 1], [-.70, 1], [-1, .58], [-1, -.58]]
      .map(([u, v]) => [x + u! * rx!, y!, v! * rz!] as Vec3);
  };
  const rings = sections.map(ring);
  for (let row = 0; row < rings.length - 1; row++) for (let side = 0; side < 8; side++) {
    const next = (side + 1) % 8;
    k.mesh.addQuad(basin, [rings[row]![side]!, rings[row + 1]![side]!, rings[row + 1]![next]!, rings[row]![next]!]);
  }
  const bottom = rings.at(-1)!;
  for (let side = 0; side < 8; side++) {
    const a = bottom[side]!, b = bottom[(side + 1) % 8]!;
    k.mesh.addSurface(basin, { positions: [x, .769, 0, ...b, ...a], normals: [0, 1, 0, 0, 1, 0, 0, 1, 0],
      uvs: [0, 0, b[0] - x, b[2], a[0] - x, a[2]], indices: [0, 1, 2] });
  }
  k.cylinder(F.chrome, [x, .770, 0], .021, .002, 24);
  k.cylinder(F.black, [x, .772, 0], .013, .001, 24);
}

export const loftBathroomRecipes: RecipeSet = add => {
  add(LOFT_VANITY_FIT.module, k => {
    softBox(k, F.black, [0, .34, -.01], [2.14, .405, .55], { radius: .004 });
    for (const x of [-1.075, 1.075]) softBox(k, PRIVATE_VENEER, [x, .35, -.01], [.035, .39, .56], { radius: .003 });
    // Distinct broad horizontal ribs, with recessed dark shadow lines between.
    for (let rib = 0; rib < 11; rib++) softBox(k, PRIVATE_VENEER, [0, .357 + rib * .033, .277], [2.16, .027, .034], { radius: .004 });
    softBox(k, F.bronze, [0, .344, .27], [2.15, .006, .040], { radius: .002 });
    softBox(k, R.stone, [0, .724, 0], [2.2, .024, .6], { radius: .004 });
    for (const x of [-.52, .52]) bowl(k, x);

    softBox(k, PRIVATE_VENEER, [0, .77, -.291], [2.18, 1.45, .018], { radius: .002 });
    softBox(k, F.black, [0, 1.10, -.27], [2.1, 1.0, .033], { radius: .003 });
    softBox(k, F.bronze, [0, 1.106, -.248], [2.08, .988, .012], { radius: .002 });
    softBox(k, 'cyberpunk/corpo-plaza-mirror/rich#silver', [0, 1.115, -.237], [2.056, .967, .008], { radius: .001 });
    for (const x of [-.52, .52]) {
      softBox(k, F.black, [x, .966, -.268], [.21, .09, .022], { radius: .003 });
      softBox(k, F.chrome, [x, .989, -.182], [.15, .023, .172], { radius: .003 });
      k.cbox(F.black, [x, .988, -.103], [.12, .002, .009]);
    }
    for (const x of [-.25, .25]) tube(k, F.black, [[x, 2.08, -.279], [x, 2.23, -.276], [x, 2.12, -.16]], .007, false, 12);
    softBox(k, F.black, [0, 2.104, -.16], [.8, .052, .17], { radius: .004 });
    softBox(k, F.bronze, [0, 2.1, -.16], [.77, .004, .155], { radius: .001 });
    k.cbox(F.lensWarm, [0, 2.097, -.16], [.72, .003, .125]);
    // Short dry towel stack sits beside the separate bowls, never in a basin.
    for (let fold = 0; fold < 3; fold++) softBox(k, 'cyberpunk/meridian-terry/rich#ivory', [.986, .748 + fold * .025, .045], [.20, .024, .30],
      { radius: .011, crown: .0015 });
    for (const x of [-.84, .84]) {
      softBox(k, F.black, [x, .21, -.274], [.04, .17, .035], { radius: .003 });
      softBox(k, F.black, [x, .34, -.07], [.04, .035, .42], { radius: .003 });
    }
  });
};
