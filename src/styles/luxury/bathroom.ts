import { FINISH as F } from '../../modules/finishes.js';
import { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { pipe, vessel, sanitaryRecipes } from '../../modules/recipes/sanitary.js';
import type { Vector3 } from '../../modules/types.js';

/** Full metre scale bathroom fittings, rear wall at -Z. The Konpeki suite reference
 * informs the long suspended counter, open towel shelf and calm metal
 * detailing. Functional fixtures retain recognisable ceramic and clear glass finishes. */
export const LUXURY_BATHROOM_SIZES = {
  sink: [1.4, .58, .88], shower: [1.3, 1.1, 2.2], toilet: [.4, .72, .8],
} as const;
export const LUXURY_BATHROOM_MATERIALS = {
  glass: 'cyberpunk/corpo-plaza-glass/rich#clear',
  mirror: 'cyberpunk/corpo-plaza-mirror/rich#silver',
  towel: 'cyberpunk/meridian-terry/rich#ivory',
} as const;
const towel = LUXURY_BATHROOM_MATERIALS.towel;

/** A stone slab surrounding an actual rounded opening. Its top has no polygon over
 * the bowl: rays and highlights reach the ceramic bowl 17 cm below the countertop. */
function counter(k: Kit): void {
  const n = 64, x = -.16, z = .012, y = .85, thickness = .03;
  const inside: Vector3[] = [], outside: Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
    inside.push([x + .272 * Math.sign(c) * Math.abs(c) ** .5, y, z + .187 * Math.sign(s) * Math.abs(s) ** .5]);
    const tx = c > 0 ? (.7 - x) / c : (-.7 - x) / c;
    const tz = s > 0 ? (.29 - z) / s : (-.29 - z) / s;
    const t = Math.min(Math.abs(tx), Math.abs(tz));
    outside.push([x + c * t, y, z + s * t]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = inside[i]!, b = inside[j]!, c = outside[i]!, d = outside[j]!;
    const up = (v: Vector3): Vector3 => [v[0], v[1] + thickness, v[2]];
    const top = [up(a), up(b), up(d), up(c)];
    k.mesh.addSurface(F.ivory, { positions: top.flat(), normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      uvs: top.flatMap(p => [p[0] + .7, p[2] + .29]), indices: [0, 1, 2, 0, 2, 3] });
    k.mesh.addQuad(F.ivory, [c, d, b, a]);
    k.mesh.addQuad(F.ivory, [c, up(c), up(d), d]);
    k.mesh.addQuad(F.ivory, [b, up(b), up(a), a]);
  }
}

function foldedTowel(k: Kit, x: number, y: number, z: number, width: number): void {
  // Rounded stacked folds, with separate thin woven edges; no rigid square towel brick.
  vessel(k, towel, [
    { x, y, z, rx: width / 2 - .018, rz: .095, power: 7 },
    { x, y: y + .012, z, rx: width / 2, rz: .108, power: 7 },
    { x, y: y + .036, z, rx: width / 2, rz: .108, power: 7 },
    { x, y: y + .045, z, rx: width / 2 - .018, rz: .098, power: 7 },
    { x, y: y + .045, z, rx: .001, rz: .001 },
    { x, y, z, rx: .001, rz: .001 },
  ], 32);
  for (let i = 0; i < 3; i++) k.cbox(towel, [x, y + .014 + i * .004, z + .109], [width - .04, .0015, .0015]);
}

export const luxuryBathroomRecipes: RecipeSet = add => {
  add('fit-basin-luxury', k => {
    // Suspended cabinet sides and back; basin bay contains no solid filler intersecting its cavity.
    for (const x of [-.67, .67]) k.cbox(F.timber, [x, .32, -.015], [.035, .53, .51]);
    k.cbox(F.timber, [0, .32, -.257], [1.34, .53, .025]);
    k.cbox(F.timber, [0, .32, -.015], [1.34, .032, .51]);
    k.cbox(F.timber, [.345, .35, -.015], [.024, .5, .5]);
    k.cbox(F.timber, [.51, .585, -.015], [.30, .025, .5]);
    for (const y of [.36, .59]) {
      k.cbox(F.timber, [-.16, y, .252], [.99, .222, .026]);
      k.cbox(F.black, [-.16, y + .198, .269], [.92, .008, .004]);
      k.cbox(F.bronze, [-.16, y + .192, .276], [.32, .012, .015]);
    }
    foldedTowel(k, .51, .36, .075, .255);
    foldedTowel(k, .51, .41, .075, .24);
    foldedTowel(k, .51, .62, .075, .25);
    counter(k);
    vessel(k, F.ceramic, [
      { x: -.16, y: .701, rx: .008, rz: .008, z: .012 },
      { x: -.16, y: .71, rx: .14, rz: .10, z: .012, power: 3 },
      { x: -.16, y: .84, rx: .271, rz: .186, z: .012, power: 4 },
      { x: -.16, y: .879, rx: .275, rz: .190, z: .012, power: 4 },
      { x: -.16, y: .884, rx: .271, rz: .186, z: .012, power: 4 },
      { x: -.16, y: .881, rx: .255, rz: .169, z: .012, power: 4 },
      { x: -.16, y: .85, rx: .245, rz: .160, z: .012, power: 4 },
      { x: -.16, y: .748, rx: .185, rz: .120, z: .012, power: 3.5 },
      { x: -.16, y: .716, rx: .07, rz: .05, z: .012 },
      { x: -.16, y: .715, rx: .008, rz: .008, z: .012 },
    ], 64);
    k.cylinder(F.chrome, [-.16, .716, .012], .026, .003, 32);
    k.cbox(F.chrome, [-.16, .835, -.148], [.038, .010, .005]);
    k.cylinder(F.chrome, [-.16, .88, -.23], .027, .145, 32);
    pipe(k, [[-.16, 1.015, -.23], [-.16, 1.047, -.22], [-.16, 1.055, -.2], [-.16, 1.055, -.07], [-.16, 1.038, -.05]], .014);
    k.cbox(F.chrome, [-.106, 1.018, -.23], [.078, .013, .024]);
    k.cylinder(F.black, [-.16, 1.033, -.05], .009, .002, 20);
    // An opaque metal-backed mirror sits proud of the rear wall and cannot expose outside scenery.
    k.cbox(F.black, [0, 1.07, -.278], [1.34, .85, .018]);
    k.cbox(F.bronze, [0, 1.075, -.266], [1.32, .84, .009]);
    k.cbox(LUXURY_BATHROOM_MATERIALS.mirror, [0, 1.089, -.258], [1.29, .812, .004]);
    for (const x of [-.665, .665]) k.cbox(F.lensWarm, [x, 1.10, -.246], [.012, .79, .008]);
    // Soap tray, actual bottle shoulder and pump, kept away from usable basin area.
    k.cbox(F.ivory, [.49, .88, -.03], [.25, .014, .15]);
    vessel(k, F.ceramic, [
      { x: .49, z: -.03, y: .895, rx: .031, rz: .031 },
      { x: .49, z: -.03, y: .985, rx: .031, rz: .031 },
      { x: .49, z: -.03, y: .997, rx: .014, rz: .014 },
      { x: .49, z: -.03, y: .997, rx: .001, rz: .001 },
      { x: .49, z: -.03, y: .895, rx: .001, rz: .001 },
    ], 24);
    k.cylinder(F.chrome, [.49, .997, -.03], .01, .021, 20);
    pipe(k, [[.49, 1.018, -.03], [.49, 1.021, .005], [.49, 1.015, .018]], .005);
  });

  add('fit-toilet-luxury', k => {
    // Reuse the proven open glazed bowl, rounded seat, skirt, cistern and dual flush,
    // authored independently of room size. Its enlarged reservation supplies rear plumbing space.
    sanitaryRecipes((id, draw) => { if (id === 'fit-toilet') draw(k); });
    // Raised lid: a bevelled oval ceramic shell, rotated upright behind the open seat.
    const lid = new Kit(() => [1, 1]);
    vessel(lid, F.ceramic, [
      { y: 0, rx: .001, rz: .001 },
      { y: 0, rx: .146, rz: .146, power: 2.5 },
      { y: .005, rx: .155, rz: .153, power: 2.5 },
      { y: .014, rx: .155, rz: .153, power: 2.5 },
      { y: .02, rx: .146, rz: .146, power: 2.5 },
      { y: .02, rx: .001, rz: .001 },
    ], 48);
    lid.cylinder(F.ceramic, [0, 0, 0], .0015, .02, 16);
    const g = lid.mesh.getGroup(F.ceramic)!;
    const positions: number[] = [], normals: number[] = [];
    for (let i = 0; i < g.positions.length; i += 3) {
      positions.push(g.positions[i]!, .62 + g.positions[i + 2]!, -.118 - g.positions[i + 1]!);
      // The planar centre stays planar: averaging its radial closure would leave a false dimple.
      if (Math.hypot(g.positions[i]!, g.positions[i + 2]!) < .002) {
        normals.push(0, 0, g.positions[i + 1]! > .01 ? -1 : 1);
      } else normals.push(g.normals[i]!, g.normals[i + 2]!, -g.normals[i + 1]!);
    }
    k.mesh.addSurface(F.ceramic, { positions, normals, uvs: g.uvs, indices: g.indices });
    k.cbox(F.ceramic, [0, .463, -.155], [.29, .016, .04]);
    pipe(k, [[-.10, .19, -.30], [-.10, .19, -.333]], .012);
    k.cylinder(F.chrome, [-.10, .184, -.333], .022, .025, 24);
  });

  // The complete module is retained for catalog previews; placed showers publish the
  // actual bounded components so the unchanged engine does not seal their walk-in volume.
  add('fit-shower-luxury', k => { for (const draw of Object.values(SHOWER_COMPONENTS)) draw(k); });
  for (const [part, draw] of Object.entries(SHOWER_COMPONENTS)) add(`fit-shower-luxury-${part}`, draw);
};

function showerSide(k: Kit, x: number): void {
  k.cbox(F.chrome, [x, .066, 0], [.019, .018, 1.065]);
  k.cbox(LUXURY_BATHROOM_MATERIALS.glass, [x, .084, 0], [.01, 2.08, 1.065]);
  k.cbox(F.chrome, [x, .084, -.525], [.018, 2.08, .018]);
  for (const z of [-.33, .34]) k.cbox(F.chrome, [x, .16, z], [.018, .045, .05]);
  k.cbox(F.chrome, [x, 2.165, 0], [.014, .012, 1.06]);
}

/** Parts retain the same local authored zero. Their measured bounds are the only
 * collision contract: no consumer exception, prefix bypass, or hidden proxy. */
const SHOWER_COMPONENTS: Record<string, (k: Kit) => void> = {
  tray: k => {
    k.cbox(F.ivory, [0, 0, 0], [1.3, .04, 1.1]);
    k.cbox(F.ceramic, [0, .04, .01], [1.26, .015, 1.04]);
    for (const x of [-.635, .635]) k.cbox(F.ivory, [x, .04, 0], [.03, .026, 1.1]);
    k.cbox(F.ivory, [0, .04, -.535], [1.24, .026, .03]);
    k.cbox(F.chrome, [0, .056, -.43], [.72, .005, .055]);
    for (let i = 0; i < 24; i++) k.cbox(F.black, [-.335 + i * .029, .061, -.43], [.012, .001, .035]);
  },
  'left-glass': k => showerSide(k, -.632),
  'right-glass': k => showerSide(k, .632),
  'front-glass': k => {
    k.cbox(LUXURY_BATHROOM_MATERIALS.glass, [-.419, .084, .526], [.416, 2.08, .01]);
    k.cbox(F.chrome, [-.419, .066, .526], [.425, .018, .019]);
    for (const y of [.36, 1.80]) k.cbox(F.chrome, [-.627, y, .519], [.03, .04, .023]);
  },
  riser: k => pipe(k, [[0, .98, -.478], [0, 2.075, -.478]], .014),
  head: k => {
    // The overhead arm is independent of the riser: its bound cannot create a
    // floor-to-head pillar across the space where a person stands.
    pipe(k, [[0, 2.075, -.478], [0, 2.14, -.452], [0, 2.17, -.4], [0, 2.17, -.1]], .014);
    k.cylinder(F.chrome, [0, 2.138, -.1], .145, .015, 48);
    k.cylinder(F.graphite, [0, 2.135, -.1], .133, .003, 48);
    for (let r = 1; r <= 3; r++) for (let j = 0; j < r * 8; j++) {
      const a = j * 2 * Math.PI / (r * 8);
      k.cylinder(F.ceramic, [Math.cos(a) * r * .034, 2.133, -.1 + Math.sin(a) * r * .034], .003, .003, 6);
    }
  },
  mixer: k => {
    pipe(k, [[-.17, 1.02, -.455], [.17, 1.02, -.455]], .026);
    for (const x of [-.145, .145]) k.cbox(F.chrome, [x, .99, -.44], [.028, .06, .032]);
  },
  'hand-shower': k => {
    pipe(k, [[.18, 1.01, -.445], [.22, .73, -.44], [.29, .68, -.44], [.35, .76, -.44], [.34, 1.30, -.44]], .008);
    pipe(k, [[.34, 1.29, -.44], [.34, 1.48, -.405]], .019);
    k.cbox(F.chrome, [.34, 1.43, -.466], [.065, .07, .07]);
  },
  shelf: k => {
    k.cbox(F.chrome, [-.41, 1.06, -.425], [.24, .015, .18]);
    for (const [x, height] of [[-.46, .16], [-.36, .13]]) {
      k.cylinder(F.ceramic, [x!, 1.075, -.44], .026, height!, 24);
      k.cylinder(F.bronze, [x!, 1.075 + height!, -.44], .019, .018, 24);
    }
  },
};
export const LUXURY_SHOWER_PARTS = Object.keys(SHOWER_COMPONENTS).map(part => `fit-shower-luxury-${part}`);
