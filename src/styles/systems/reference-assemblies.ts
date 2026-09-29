import type { Point } from '../../core/geom.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { placeIsland, placeTallRun, type IslandSpec, type TallRunSpec } from './assembly.js';
import { registerModuleSizes, xyPrism, yzPrism } from './built-ins.js';
import { placeGlassPlanter, type GlassPlanterSpec } from './planter.js';
import { LOOK } from './reference-looks.js';
import type { AssemblySpec, HousingSpec, KitchenWallSpec, PlanterSpec, RunSpec } from './types.js';

/** The built-in assemblies of the reference interiors, as data plus their modules. A kind
 *  lists its part in `KindExports` (`assemblies`, `housings`, `recipes`); furniture records
 *  name an assembly by fit id (`asm-<sid>-<name>`).
 *  - A (E1 suite): the embedded high-tech kitchen wall (toe recess, cool grey carcass bays,
 *    steel worktop with a real sink and hob, tan splash panels in four widths, two-tier
 *    upper housings with a dog-leg grille and screens, bulkhead, stepped service column
 *    with its screen, cyan under-cabinet lens); the island (smoked top over a lit caustic
 *    block); the window trough; the bamboo glass enclosure to the ceiling with its LED
 *    frame; the open wardrobe (black frames, dark timber, red floor line); the dark display
 *    shelving beside the kitchen; cream AC housings over doors and portals.
 *  - B (B3 apartment): the back bar (walnut bays on a gold plinth, stone top, screen bays,
 *    tall screen column), the bar counter on its pedestal, the bamboo planter.
 *  - C: the capsule storage niche (rounded returns, shelf bays), restroom stalls at 0.9 m,
 *    corridor ducts with baked ribs, wall AC units over doors.
 *  - R (R1 office): the wall library of three boards with binder bays.
 *  All geometry is boxes and extruded sections; anything repeating under 0.5 m is baked
 *  into a bay module. */

type Add = Parameters<RecipeSet>[0];
const box = (k: Kit, slot: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  k.box(slot, [x0, y0, z0], [x1 - x0, y1 - y0, z1 - z0]);
const CYAN: [number, number, number] = [.08, .78, 1];

/** A diamond mesh over a dark void inside an outline (xy), on the plane z: two families of
 *  diagonal bars at a fixed pitch, clipped to the outline, baked into the module. */
function diamondMesh(k: Kit, outline: Point[], z: number, void_: string, bar: string, pitch = .035): void {
  xyPrism(k, void_, outline, z - .0015, z, false);
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (const dir of [1, -1]) for (let c = x0 - (y1 - y0); c <= x1 + (y1 - y0); c += pitch) {
    // The line x = c + dir * (y - y0); keep its parts inside the outline.
    const at = (y: number): Point => [c + dir * (y - y0), y];
    const hits: number[] = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]!, b = outline[(i + 1) % outline.length]!;
      // Solve a + s (b - a) on the line: x - dir * y = c - dir * y0.
      const fa = a[0] - dir * a[1] - (c - dir * y0), fb = b[0] - dir * b[1] - (c - dir * y0);
      if (fa * fb > 0 || Math.abs(fa - fb) < 1e-12) continue;
      hits.push(a[1] + (b[1] - a[1]) * fa / (fa - fb));
    }
    hits.sort((p, q) => p - q);
    for (let i = 0; i + 1 < hits.length; i += 2) {
      if (hits[i + 1]! - hits[i]! < .004) continue;
      const [p, q] = [at(hits[i]!), at(hits[i + 1]!)];
      k.rod(bar, [p[0], p[1], z + .002], [q[0], q[1], z + .002], .005);
    }
  }
}
const RED: [number, number, number] = [1, .035, .022];

// ---- kitchen walls -------------------------------------------------------------------

interface KitchenLook {
  carcass: string; front: string; toe: string; top: string; splash: string; upper: string;
  line: string; grille: string; screen: string; panel: string; lens: string;
  /** e1: two tiers (projecting dog-leg tier, set-back vent tier); bar: one tall tier */
  uppers: 'e1' | 'bar';
}

/** The front of one carcass bay: plates with 3 mm gaps, slot pulls, a kick line. */
function bayFront(k: Kit, look: KitchenLook, w: number, h: number, d: number, rows: number[], split = false): void {
  box(k, look.carcass, -w / 2 + .0015, w / 2 - .0015, 0, h, 0, d - .02);
  let y = .003;
  for (const rh of rows) {
    for (const [x0, x1] of split ? [[-w / 2 + .002, -.002], [.002, w / 2 - .002]] : [[-w / 2 + .002, w / 2 - .002]]) {
      box(k, look.front, x0!, x1!, y, y + rh - .003, d - .02, d);
      const cx = (x0! + x1!) / 2, pull = Math.min(.24, (x1! - x0!) * .5);
      box(k, look.line, cx - pull / 2, cx + pull / 2, y + rh - .075, y + rh - .06, d, d + .003);
    }
    y += rh;
  }
  box(k, look.line, -w / 2 + .002, w / 2 - .002, .05, .054, d, d + .001);
}

function kitchenRecipes(sid: string, look: KitchenLook, spec: KitchenWallSpec): RecipeSet {
  const w = spec.bay, h = spec.base.height, d = spec.base.depth, t = spec.worktop.thickness, td = spec.worktop.depth;
  const id = (name: string) => `fit-${sid}-kitchen-${name}`;
  return (add: Add) => {
    add(id('toe'), k => box(k, look.toe, -.25, .25, 0, spec.toe.height, 0, d - spec.toe.setback));
    add(id('door'), k => bayFront(k, look, w, h, d, [h]));
    add(id('drawers'), k => bayFront(k, look, w, h, d, [.2, .24, h - .44]));
    add(id('sink'), k => bayFront(k, look, w, h, d, [.12, h - .12], true));
    add(id('hob'), k => bayFront(k, look, w, h, d, [.33, h - .33]));
    add(id('display'), k => {
      bayFront(k, look, w, h, d, [h]);
      box(k, look.line, -.235, .235, .39, .64, d, d + .002);
      box(k, look.screen, -.22, .22, .405, .625, d + .002, d + .005);
      for (const x of [-.12, -.06, 0, .06, .12]) box(k, look.line, x - .018, x + .018, .3, .312, d, d + .002);
    });
    add(id('filler'), k => box(k, look.carcass, -.25, .25, 0, h, 0, d));
    add(id('end'), k => box(k, look.carcass, -spec.base.endWidth / 2, spec.base.endWidth / 2, 0, spec.toe.height + h, 0, td));
    add(id('top'), k => box(k, look.top, -.25, .25, 0, t, 0, td));
    add(id('top-sink'), k => {
      // A real aperture: four slab pieces round the bowl, the bowl, a spout.
      box(k, look.top, -w / 2, w / 2, 0, t, 0, .12);
      box(k, look.top, -w / 2, w / 2, 0, t, .5, td);
      box(k, look.top, -w / 2, -.22, 0, t, .12, .5);
      box(k, look.top, .22, w / 2, 0, t, .12, .5);
      box(k, look.top, -.22, -.21, -.16, t - .002, .12, .5);
      box(k, look.top, .21, .22, -.16, t - .002, .12, .5);
      box(k, look.top, -.21, .21, -.16, t - .002, .12, .13);
      box(k, look.top, -.21, .21, -.16, t - .002, .49, .5);
      box(k, look.top, -.21, .21, -.17, -.16, .13, .49);
      k.cylinder(look.line, [0, -.16, .31], .03, .003, 8);
      k.rod(look.top, [0, t, .07], [0, t + .26, .07], .026);
      k.rod(look.top, [0, t + .26, .07], [0, t + .26, .24], .022);
      k.rod(look.top, [0, t + .26, .24], [0, t + .21, .24], .016);
    });
    add(id('top-hob'), k => {
      box(k, look.top, -w / 2, w / 2, 0, t, 0, td);
      box(k, look.line, -.27, .27, t, t + .004, .05, .6);
      k.cylinder(look.top, [0, t + .004, .33], .17, .003, 24);
    });
    add(id('splash'), k => box(k, look.splash, -.25, .25, 0, .5, 0, .012));
    add(id('pull'), k => box(k, look.line, -.006, .006, 0, .1, 0, .004));
    add(id('lens'), k => box(k, look.lens, -.25, .25, -.008, 0, -.015, .015));
    if (look.uppers === 'e1') {
      // Lower tier: projects over the worktop with a dog-leg step and a glossy underside.
      const tierA = (k: Kit) => {
        box(k, look.upper, -w / 2 + .0015, w / 2 - .0015, .07, .43, 0, .52);
        box(k, look.upper, -w / 2 + .0015, w / 2 - .0015, 0, .07, 0, .36);
        box(k, look.line, -w / 2 + .0015, w / 2 - .0015, .066, .07, .36, .52);
      };
      add(id('upper-a'), tierA);
      add(id('upper-a-vent'), k => { tierA(k); box(k, look.line, .12, .22, .3, .315, .52, .523); });
      add(id('upper-a-grille'), k => {
        tierA(k);
        diamondMesh(k, [[-.24, .17], [.08, .17], [.13, .24], [.24, .24], [.24, .35], [-.24, .35]], .5215, look.line, look.grille);
      });
      add(id('upper-a-screen'), k => {
        tierA(k);
        box(k, look.line, -.11, .11, .12, .35, .52, .522);
        box(k, look.panel, -.1, .1, .13, .34, .522, .525);
      });
      // Upper tier: set back, with slot vents.
      const tierB = (k: Kit) => box(k, look.upper, -w / 2 + .0015, w / 2 - .0015, 0, .3, 0, .4);
      add(id('upper-b'), tierB);
      add(id('upper-b-vent'), k => { tierB(k); for (const y of [.12, .15, .18]) box(k, look.line, -.1, .1, y, y + .012, .4, .402); });
    } else {
      // One tall tier: plain panels, screen bays and open bottle shelves.
      const tier = (k: Kit) => box(k, look.upper, -w / 2 + .0015, w / 2 - .0015, 0, .9, 0, .35);
      add(id('upper-a'), tier);
      add(id('upper-a-screen'), k => { tier(k); box(k, look.line, -.24, .24, .2, .72, .35, .352); box(k, look.screen, -.23, .23, .21, .71, .352, .355); });
      add(id('upper-a-shelf'), k => {
        box(k, look.upper, -w / 2 + .0015, w / 2 - .0015, 0, .9, 0, .03);
        for (const x of [-w / 2 + .0015, w / 2 - .0215]) box(k, look.upper, x, x + .02, 0, .9, .03, .35);
        for (const y of [0, .3, .6, .88]) box(k, look.line, -w / 2 + .0215, w / 2 - .0215, y, y + .02, .03, .35);
        for (let i = 0; i < 5; i++) k.cylinder(LOOK.glass, [-.2 + i * .1, .02, .18], .03, .24, 6);
      });
    }
    add(id('bulkhead'), k => box(k, look.upper, -.25, .25, 0, .5, 0, look.uppers === 'e1' ? .4 : .35));
    // Stepped service column (0.9 wide): cabinet, screen body, stepped box, top to ceiling.
    const cw = spec.column?.width ?? .9, half = cw / 2 - .0015;
    add(id('column-base'), k => bayFront(k, look, cw, spec.worktop.top, .65, [spec.worktop.top], true));
    // The column stays inside the worktop depth: the record reserves no more.
    add(id('column-mid'), k => {
      box(k, look.upper, -half, half, 0, .45, 0, td);
      box(k, look.upper, -half, half, .454, .9, 0, td);
      box(k, look.line, -half + .002, half - .002, .45, .454, 0, td - .002);
    });
    add(id('column-step'), k => { box(k, look.upper, -half, half, 0, .5, 0, td - .12); box(k, look.upper, -half, half, .25, .5, td - .12, td); });
    add(id('column-top'), k => box(k, look.upper, -half, half, 0, .5, 0, td - .15));
    // Mounted on the column front (the record's front edge), 5 mm proud.
    add(`wall-screen-${sid}-kitchen`, k => { box(k, look.line, -.13, .13, 0, .34, 0, .003); box(k, look.panel, -.12, .12, .01, .33, .003, .005); });
  };
}

function kitchenSpec(sid: string, look: 'e1' | 'bar', pattern: KitchenWallSpec['pattern'], color: [number, number, number] | undefined,
  column: boolean): KitchenWallSpec {
  const id = (name: string) => `fit-${sid}-kitchen-${name}`;
  return {
    bay: .6,
    toe: { height: .07, setback: .06, module: id('toe') },
    base: { height: .73, depth: .62, bays: { door: id('door'), drawers: id('drawers'), sink: id('sink'), hob: id('hob'), display: id('display') },
      filler: id('filler'), endPanel: id('end'), endWidth: .04 },
    pattern,
    worktop: { top: .9, thickness: .1, depth: .65, lip: .1, slab: id('top'), sinkCut: id('top-sink'), hobCut: id('top-hob') },
    backsplash: { height: 1, panels: look === 'e1' ? [.95, 1.25, .7, 1.1] : [1.2], module: id('splash'), ...(look === 'e1' ? { pull: id('pull') } : {}) },
    uppers: look === 'e1'
      ? { bottom: 1.9, height: .73, tiers: [{ depth: .52, bays: [id('upper-a'), id('upper-a-grille'), id('upper-a-vent'), id('upper-a-screen'), id('upper-a-grille')] },
        { depth: .4, bays: [id('upper-b'), id('upper-b-vent')] }], underLens: id('lens') }
      : { bottom: 1.5, height: .9, tiers: [{ depth: .35, bays: [id('upper-a'), id('upper-a-shelf'), id('upper-a-screen'), id('upper-a-shelf')] }], underLens: id('lens') },
    bulkhead: { module: id('bulkhead') },
    ...(column ? { column: { width: .9, depth: .65, modules: { stack: [id('column-base'), id('column-mid'), id('column-step'), id('column-top')], screen: `wall-screen-${sid}-kitchen` } } } : {}),
    lens: { y: look === 'e1' ? 1.9 : 1.5, z: look === 'e1' ? .3 : .2, lumensPerMetre: look === 'e1' ? 110 : 80, ...(color ? { color } : {}) },
  };
}

export const E1_KITCHEN = kitchenSpec('e1', 'e1', ['display', 'sink', 'door', 'drawers', 'hob', 'door', 'drawers'], CYAN, true);
/** The E1 window leg of the L: sink under the window, the display bay, no column. */
export const E1_KITCHEN_WINDOW = kitchenSpec('e1', 'e1', ['drawers', 'sink', 'display', 'door'], CYAN, false);
export const B3_BAR = kitchenSpec('b3', 'bar', ['drawers', 'door', 'sink', 'door', 'display', 'drawers'], undefined, true);

const E1_LOOK: KitchenLook = {
  carcass: LOOK.e1Housing, front: LOOK.e1Housing, toe: LOOK.black, top: LOOK.e1Steel, splash: LOOK.e1Splash, upper: LOOK.e1Housing,
  line: LOOK.black, grille: LOOK.e1Mesh, screen: LOOK.e1Screen, panel: LOOK.e1Panel, lens: LOOK.lensCool, uppers: 'e1',
};
const B3_LOOK: KitchenLook = {
  carcass: LOOK.b3Walnut, front: LOOK.b3Walnut, toe: LOOK.gold, top: LOOK.b3Stone, splash: LOOK.b3Walnut, upper: LOOK.b3Walnut,
  line: LOOK.black, grille: LOOK.black, screen: LOOK.b3Screen, panel: LOOK.b3Screen, lens: LOOK.lensWarm, uppers: 'bar',
};

// ---- islands, planters, enclosures ---------------------------------------------------

export const E1_ISLAND: IslandSpec = {
  top: 'fit-e1-island-top', base: 'fit-e1-island-base', overhang: .09,
  glow: { lumensPerMetre: 60, kelvin: 6500, color: CYAN },
};
export const B3_COUNTER: IslandSpec = { top: 'fit-b3-counter-top', base: 'fit-b3-counter-base', overhang: .12 };

/** The E1 window trough section (y, z): 0.78 m high, a rounded top front edge, a rim round
 *  the soil bed. */
const TROUGH: Point[] = [[0, 0], [0, .36], [.72, .36],
  ...Array.from({ length: 6 }, (_, i) => { const a = (i + 1) / 6 * Math.PI / 2; return [.72 + .06 * Math.sin(a), .3 + .06 * Math.cos(a)] as Point; }),
  [.78, .27], [.73, .27], [.73, .04], [.78, .04], [.78, 0]];

export const E1_PLANTER: PlanterSpec = { end: 'fit-e1-planter-end', body: 'fit-e1-planter-body', soil: 'fit-e1-planter-soil', bay: 'fit-e1-planter-bay', height: .78 };

export const E1_BAMBOO: GlassPlanterSpec = {
  base: 'fit-e1-bamboo-base', soil: 'fit-e1-bamboo-soil', bay: 'fit-e1-bamboo-bay', pane: 'fit-e1-bamboo-pane', post: 'fit-e1-bamboo-post',
  glass: 'ceiling', rowPitch: .6, frame: { lens: 'ceiling-cove-e1-bamboo-frame', lumensPerMetre: 70, kelvin: 4000 },
};
export const B3_BAMBOO: GlassPlanterSpec = {
  base: 'fit-b3-bamboo-base', soil: 'fit-e1-bamboo-soil', bay: 'fit-e1-bamboo-bay', pane: 'fit-e1-bamboo-pane', post: 'fit-b3-bamboo-post',
  glass: 1.05, rowPitch: .5,
};

// ---- runs --------------------------------------------------------------------------

export const E1_WARDROBE: TallRunSpec = {
  run: { start: 'fit-e1-wardrobe-end', end: 'fit-e1-wardrobe-end', mid: 'fit-e1-wardrobe-back', repeat: { module: 'fit-e1-wardrobe-bay', pitch: .9 },
    filler: 'fit-e1-wardrobe-filler', height: 2.4, depth: .6 },
  bulkhead: 'fit-e1-wardrobe-bulkhead',
  line: { module: 'fit-e1-wardrobe-line', y: .012, z: .56, lumensPerMetre: 45, kelvin: 2700, color: RED, facing: 'up' },
};
export const E1_DISPLAY: TallRunSpec = {
  run: { start: 'fit-e1-display-side', end: 'fit-e1-display-side', mid: 'fit-e1-display-back', repeat: { module: 'fit-e1-display-bay', pitch: .45 },
    filler: 'fit-e1-display-back', height: 2.4, depth: .4 },
  bulkhead: 'fit-e1-display-bulkhead',
};
export const R1_LIBRARY: RunSpec = {
  mid: 'fit-r1-library-boards', repeat: { module: 'fit-r1-library-bay', pitch: .9 }, filler: 'fit-r1-library-gap', height: .9, depth: .3,
};
export const C1_NICHE: RunSpec = {
  start: 'fit-c1-niche-left', end: 'fit-c1-niche-right', mid: 'fit-c1-niche-back', repeat: { module: 'fit-c1-niche-bay', pitch: .6 },
  filler: 'fit-c1-niche-shelves', height: 2.2, depth: .38,
};
export const C4_STALLS: RunSpec = {
  start: 'fit-c4-stall-end', end: 'fit-c4-stall-end', mid: 'fit-c4-stall-rail', repeat: { module: 'fit-c4-stall-bay', pitch: .9 },
  filler: 'fit-c4-stall-filler', height: 2, depth: 1.5,
};

// ---- housings ----------------------------------------------------------------------

export const E1_HOUSING_DOORS: HousingSpec = {
  id: 'housing-e1-ac', body: 'housing-e1-ac-body', cap: 'housing-e1-ac-cap', insert: { module: 'housing-e1-ac-grille', pitch: 1.2 },
  over: 'doors', depth: .45, height: .35, minBottom: 2.1,
};
export const E1_HOUSING_PORTALS: HousingSpec = { ...E1_HOUSING_DOORS, id: 'housing-e1-portal', over: 'portals' };
export const C2_DUCT: HousingSpec = {
  id: 'housing-c2-duct', body: 'housing-c2-duct-body', cap: 'housing-c2-duct-cap', insert: { module: 'housing-c2-duct-rib', pitch: 1 },
  over: 'runs', depth: .3, height: .28, minBottom: 2.1,
};
export const C7_AC: HousingSpec = {
  id: 'housing-c7-ac', body: 'housing-c7-ac-body', cap: 'housing-c7-ac-cap', insert: { module: 'housing-c7-ac-unit', pitch: 1.4 },
  over: 'doors', depth: .28, height: .36, minBottom: 2.1,
};

/** The E1 housing section (y, z): flat top on the ceiling, a rounded lower nose. */
const HOUSING: Point[] = [[0, 0], [.35, 0], [.35, .45], [.12, .45],
  ...Array.from({ length: 8 }, (_, i) => { const a = (i + 1) / 8 * Math.PI / 2; return [.12 - .12 * Math.sin(a), .33 + .12 * Math.cos(a)] as Point; })];

// ---- modules -----------------------------------------------------------------------

const kindA: RecipeSet = add => {
  kitchenRecipes('e1', E1_LOOK, E1_KITCHEN)(add);
  add('fit-e1-island-top', k => box(k, LOOK.e1IslandTop, -.25, .25, 0, .08, -.25, .25));
  add('fit-e1-island-base', k => { box(k, LOOK.e1Caustic, -.25, .25, 0, .94, -.25, .25); box(k, LOOK.black, -.25, .25, .925, .94, -.252, .252); });
  add('fit-e1-planter-body', k => { yzPrism(k, LOOK.e1Cream, TROUGH, -.25, .25, false); box(k, LOOK.black, -.25, .25, .5, .516, .36, .362); });
  add('fit-e1-planter-end', k => yzPrism(k, LOOK.e1Cream, TROUGH, -.02, .02));
  add('fit-e1-planter-soil', k => box(k, LOOK.soil, -.25, .25, .73, .75, .04, .27));
  // Five tufts per metre leaning out of the bed towards the room, never back into the window.
  add('fit-e1-planter-bay', k => {
    for (let i = 0; i < 5; i++) {
      const x = -.4 + i * .2, z = .12 + (i % 2) * .06, h = .5 + (i % 3) * .08;
      k.rod(LOOK.stem, [x, .75, z], [x, .75 + h * .45, z], .018);
      for (let j = 0; j < 7; j++) {
        const heading = -.15 + ((j * 2.399 + i) % 3.44), length = h * (.42 + .1 * ((j + i) % 3));
        k.leaf(LOOK.leaf, [x, .75 + h * (.18 + .05 * j), z], heading, Math.min(length, .26), h * .11, .3 + .05 * (j % 4));
      }
    }
  });
  add('fit-e1-bamboo-base', k => { box(k, LOOK.e1Housing, -.25, .25, 0, .3, -.25, .25); box(k, LOOK.black, -.25, .25, 0, .04, -.252, .252); });
  add('fit-e1-bamboo-soil', k => box(k, LOOK.soil, -.25, .25, .3, .31, -.25, .25));
  add('fit-e1-bamboo-bay', k => {
    for (let i = 0; i < 8; i++) {
      const x = -.42 + i * .12, z = ((i * 37) % 7 - 3) * .03, h = 2 + (i % 3) * .15;
      k.cylinder(LOOK.stem, [x, 0, z], .017, h, 6);
      for (let j = 0; j < 4; j++) k.leaf(LOOK.leaf, [x, h * (.55 + j * .12), z], i * 1.7 + j * 2.1, .15, .045, .15);
    }
  });
  add('fit-e1-bamboo-pane', k => box(k, LOOK.glass, -.25, .25, 0, .5, -.005, .005));
  add('fit-e1-bamboo-post', k => box(k, LOOK.black, -.015, .015, 0, .5, -.015, .015));
  add('ceiling-cove-e1-bamboo-frame', k => box(k, LOOK.lensCool, -.25, .25, -.01, 0, -.02, .02));
  // Open wardrobe: black steel frames on dark timber, a red line on the floor.
  add('fit-e1-wardrobe-back', k => box(k, LOOK.e1Shelf, -.25, .25, 0, 2.4, 0, .02));
  add('fit-e1-wardrobe-end', k => box(k, LOOK.e1Shelf, -.02, .02, 0, 2.4, 0, .6));
  add('fit-e1-wardrobe-bay', k => {
    for (const x of [-.43, .43]) box(k, LOOK.black, x - .015, x + .015, 0, 2.2, .06, .09);
    box(k, LOOK.black, -.445, .445, 2.17, 2.2, .06, .09);
    k.rod(LOOK.e1Steel, [-.43, 1.85, .3], [.43, 1.85, .3], .02);
    box(k, LOOK.e1Shelf, -.445, .445, 2.2, 2.23, .02, .6);
  });
  add('fit-e1-wardrobe-filler', k => box(k, LOOK.e1Shelf, -.25, .25, 2.2, 2.23, .02, .6));
  add('fit-e1-wardrobe-bulkhead', k => box(k, LOOK.e1Shelf, -.25, .25, 0, .5, 0, .6));
  add('fit-e1-wardrobe-line', k => box(k, LOOK.lensRed, -.25, .25, 0, .006, -.006, .006));
  // Dark display shelving beside the kitchen.
  add('fit-e1-display-back', k => box(k, LOOK.black, -.25, .25, 0, 2.4, 0, .02));
  add('fit-e1-display-side', k => box(k, LOOK.e1Shelf, -.02, .02, 0, 2.4, 0, .4));
  add('fit-e1-display-bay', k => {
    box(k, LOOK.e1Shelf, -.225, .225, 0, .9, .02, .4);
    for (const y of [1.25, 1.6, 1.95, 2.3]) box(k, LOOK.e1Shelf, -.2225, .2225, y, y + .025, .02, .38);
    box(k, LOOK.e1Shelf, .2125, .225, .9, 2.4, .02, .38);
  });
  add('fit-e1-display-bulkhead', k => box(k, LOOK.e1Shelf, -.25, .25, 0, .5, 0, .4));
  // Cream AC housing over doors and portals.
  add('housing-e1-ac-body', k => yzPrism(k, LOOK.e1Cream, HOUSING, -.25, .25, false));
  add('housing-e1-ac-cap', k => yzPrism(k, LOOK.e1Cream, HOUSING, -.015, .015));
  add('housing-e1-ac-grille', k => diamondMesh(k, [[-.2, .15], [.2, .15], [.2, .28], [-.2, .28]], .4515, LOOK.black, LOOK.e1Mesh));
};

const kindB: RecipeSet = add => {
  kitchenRecipes('b3', B3_LOOK, B3_BAR)(add);
  add('fit-b3-counter-top', k => box(k, LOOK.b3Stone, -.25, .25, 0, .05, -.25, .25));
  add('fit-b3-counter-base', k => {
    box(k, LOOK.gold, -.25, .25, 0, .04, -.25, .25);
    box(k, LOOK.b3Walnut, -.25, .25, .04, 1.05, -.25, .25);
    box(k, LOOK.gold, -.25, .25, 1.03, 1.05, -.252, .252);
  });
  add('fit-b3-bamboo-base', k => { box(k, LOOK.b3Walnut, -.25, .25, 0, .3, -.25, .25); box(k, LOOK.gold, -.25, .25, .28, .3, -.252, .252); });
  add('fit-b3-bamboo-post', k => box(k, LOOK.gold, -.01, .01, 0, .5, -.01, .01));
};

const kindC: RecipeSet = add => {
  // Capsule storage niche: rounded returns, a back, three shelves per bay.
  for (const [name, sign] of [['left', 1], ['right', -1]] as const) add(`fit-c1-niche-${name}`, k => {
    const plan: Point[] = [[-.03 * sign, 0], [.03 * sign, 0], [.03 * sign, .32],
      ...Array.from({ length: 6 }, (_, i) => { const a = (i + 1) / 6 * Math.PI / 2; return [(-.03 + .06 * Math.cos(a)) * sign, .32 + .06 * Math.sin(a)] as Point; }),
      [-.03 * sign, .38]];
    const area = plan.reduce((s, a, i) => { const b = plan[(i + 1) % plan.length]!; return s + a[0] * b[1] - b[0] * a[1]; }, 0);
    k.mesh.addPrism(LOOK.cEnamel, area < 0 ? [...plan].reverse() : plan, 0, 2.2, 'world', 'both');
  });
  add('fit-c1-niche-back', k => { box(k, LOOK.cEnamel, -.25, .25, 0, 2.2, 0, .02); box(k, LOOK.cEnamel, -.25, .25, 2.1, 2.2, .02, .38); box(k, LOOK.cEnamel, -.25, .25, 0, .45, .02, .38); });
  add('fit-c1-niche-bay', k => {
    for (const y of [.95, 1.4, 1.8]) box(k, LOOK.cGunmetal, -.295, .295, y, y + .025, .02, .34);
    box(k, LOOK.cGunmetal, .285, .3, .45, 2.1, .02, .34);
  });
  add('fit-c1-niche-shelves', k => { for (const y of [.95, 1.4, 1.8]) box(k, LOOK.cGunmetal, -.25, .25, y, y + .025, .02, .34); });
  // Restroom stalls: end partitions, a head rail, one stall per 0.9 m bay with its door.
  add('fit-c4-stall-end', k => box(k, LOOK.cLaminate, -.015, .015, .15, 2, 0, 1.5));
  add('fit-c4-stall-rail', k => box(k, LOOK.cGunmetal, -.25, .25, 1.96, 2, 1.46, 1.5));
  add('fit-c4-stall-bay', k => {
    box(k, LOOK.cLaminate, .435, .45, .15, 2, 0, 1.46);
    box(k, LOOK.cLaminate, -.425, .425, .15, 1.95, 1.46, 1.49);
    box(k, LOOK.cGunmetal, .3, .36, 1, 1.04, 1.49, 1.5);
  });
  add('fit-c4-stall-filler', k => box(k, LOOK.cLaminate, -.25, .25, .15, 1.95, 1.46, 1.49));
  // Corridor duct with ribs baked every metre, wall AC units over doors.
  add('housing-c2-duct-body', k => box(k, LOOK.cGunmetal, -.25, .25, 0, .28, 0, .3));
  add('housing-c2-duct-cap', k => box(k, LOOK.cGunmetal, -.01, .01, 0, .28, 0, .3));
  add('housing-c2-duct-rib', k => { box(k, LOOK.cPetrol, -.03, .03, -.015, .295, 0, .315); });
  add('housing-c7-ac-body', k => box(k, LOOK.cEnamel, -.25, .25, 0, .36, 0, .28));
  add('housing-c7-ac-cap', k => box(k, LOOK.cGunmetal, -.01, .01, 0, .36, 0, .28));
  add('housing-c7-ac-unit', k => { box(k, LOOK.cGunmetal, -.36, .36, .03, .33, .28, .29); box(k, LOOK.cGrille, -.33, .33, .06, .3, .29, .292); });
};

const kindR: RecipeSet = add => {
  // Wall library: three walnut boards, binder bays baked at 0.9 m.
  add('fit-r1-library-boards', k => { for (const y of [0, .42, .84]) box(k, LOOK.r1Walnut, -.25, .25, y, y + .03, 0, .3); });
  add('fit-r1-library-bay', k => {
    for (const [y, count] of [[.03, 9], [.45, 7], [.87, 8]] as const)
      for (let i = 0; i < count; i++) {
        const x = -.42 + i * .075 + (y > .4 && y < .5 ? .1 : 0), h = .3 + ((i * 7) % 3) * .02;
        box(k, i % 4 === 3 ? LOOK.black : LOOK.e1Cream, x, x + .065, y, y + h, .02, .27);
      }
  });
  add('fit-r1-library-gap', k => box(k, LOOK.black, -.12, .12, .03, .2, .04, .26));
};

export const assemblyRecipesA = kindA, assemblyRecipesB = kindB, assemblyRecipesC = kindC, assemblyRecipesR = kindR;
registerModuleSizes(kindA, kindB, kindC, kindR);

/** Kind A built-ins: assemblies by fit id, housings, and the modules they draw. */
export const BUILT_INS_A: { assemblies: Record<string, AssemblySpec>; housings: HousingSpec[]; recipes: RecipeSet[] } = {
  assemblies: {
    'asm-e1-kitchen': { type: 'kitchen', spec: E1_KITCHEN },
    'asm-e1-kitchen-window': { type: 'kitchen', spec: E1_KITCHEN_WINDOW },
    'asm-e1-island': { type: 'custom', place: (b, f, i, c) => placeIsland(b, f, i, E1_ISLAND, c) },
    'asm-e1-planter': { type: 'planter', spec: E1_PLANTER },
    'asm-e1-bamboo': { type: 'custom', place: (b, f, i, c) => placeGlassPlanter(b, f, i, E1_BAMBOO, c) },
    'asm-e1-wardrobe': { type: 'custom', place: (b, f, i, c) => placeTallRun(b, f, i, E1_WARDROBE, c) },
    'asm-e1-display': { type: 'custom', place: (b, f, i, c) => placeTallRun(b, f, i, E1_DISPLAY, c) },
  },
  housings: [E1_HOUSING_DOORS, E1_HOUSING_PORTALS],
  recipes: [kindA],
};
export const BUILT_INS_B: typeof BUILT_INS_A = {
  assemblies: {
    'asm-b3-bar': { type: 'kitchen', spec: B3_BAR },
    'asm-b3-counter': { type: 'custom', place: (b, f, i, c) => placeIsland(b, f, i, B3_COUNTER, c) },
    'asm-b3-bamboo': { type: 'custom', place: (b, f, i, c) => placeGlassPlanter(b, f, i, B3_BAMBOO, c) },
  },
  housings: [],
  recipes: [kindB],
};
export const BUILT_INS_C: typeof BUILT_INS_A = {
  assemblies: {
    'asm-c1-niche': { type: 'run', spec: C1_NICHE },
    'asm-c4-stall': { type: 'run', spec: C4_STALLS },
  },
  housings: [C2_DUCT, C7_AC],
  recipes: [kindC],
};
export const BUILT_INS_R: typeof BUILT_INS_A = {
  assemblies: { 'asm-r1-library': { type: 'run', spec: R1_LIBRARY } },
  housings: [],
  recipes: [kindR],
};
