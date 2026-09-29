import type { Point } from '../../core/geom.js';
import { triangulate } from '../../core/triangulate.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { placeIsland, placeTallRun, type IslandSpec, type TallRunSpec } from './assembly.js';
import { registerModuleSizes } from './built-ins.js';
import { bambooBay, tuft } from './foliage.js';
import { placeGlassPlanter, type GlassPlanterSpec } from './planter.js';
import { kitchenRecipes, roundedSection, type KitchenLook } from './kitchen-modules.js';
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
 *  The kitchen walls are joinery (`kitchen-modules.ts`): rounded fronts under finger
 *  channels, a nosed worktop with a pressed bowl, mixer and glass hob, uppers with an
 *  angled underside and framed grilles. Slabs are swept sections with rounded noses and
 *  ends; anything repeating under 0.5 m is baked into a bay module. */

type Add = Parameters<RecipeSet>[0];
const box = (k: Kit, slot: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  k.box(slot, [x0, y0, z0], [x1 - x0, y1 - y0, z1 - z0]);
const CYAN: [number, number, number] = [.08, .78, 1];

const RED: [number, number, number] = [1, .035, .022];
const STAINLESS = 'cyberpunk/interior-alloy/rich#satin-fine';

/** A framed grille panel on the plane z over an xy outline: the grille surface fitted once
 *  over the outline's bounds (the E1 diamond mesh is an exact map), a round rim round it. */
function grillePanel(k: Kit, outline: Point[], z: number, grille: string, rim: string): void {
  const xs = outline.map(p => p[0]), ys = outline.map(p => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const area = outline.reduce((s, p, i) => { const q = outline[(i + 1) % outline.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const p = area < 0 ? [...outline].reverse() : outline;
  k.mesh.addSurface(grille, {
    positions: p.flatMap(([x, y]) => [x, y, z]), normals: p.flatMap(() => [0, 0, 1]),
    uvs: p.flatMap(([x, y]) => [(x - x0) / (x1 - x0), 1 - (y - y0) / (y1 - y0)]), indices: triangulate(p).flat(),
  });
  k.tube(rim, outline.map(([x, y]) => [x, y, z + .0005] as [number, number, number]), .0045, true, 8);
}

// ---- kitchen walls -------------------------------------------------------------------

function kitchenSpec(sid: string, look: 'e1' | 'bar', pattern: KitchenWallSpec['pattern'], color: [number, number, number] | undefined,
  column: boolean, ledge = false): KitchenWallSpec {
  const id = (name: string) => `fit-${sid}-kitchen-${name}`, top = ledge ? '-ledge' : '';
  return {
    bay: .6,
    toe: { height: .07, setback: .06, module: id('toe') },
    // The sink stands over a base lowered under its bowl, the hob over drawers: their worktop
    // cut-outs make them.
    base: { height: .73, depth: .62, bays: { door: id('door'), drawers: id('drawers'), sink: id('sink-base'), hob: id('drawers'), display: id('display') },
      filler: id('filler'), endPanel: id('end'), endWidth: .04 },
    pattern,
    worktop: { top: .9, thickness: .1, depth: .65, lip: .1, slab: id(`top${top}`), sinkCut: id(`top-sink${top}`), hobCut: id(`top-hob${top}`) },
    backsplash: { height: 1, panels: look === 'e1' ? [.95, 1.25, .7, 1.1] : [1.2], module: id('splash') },
    uppers: look === 'e1'
      ? { bottom: 1.9, height: .73, tiers: [{ depth: .52, bays: [id('upper-a'), id('upper-a-grille'), id('upper-a'), id('upper-a-screen'), id('upper-a-grille')] },
        { depth: .4, bays: [id('upper-b'), id('upper-b-vent')] }], underLens: id('lens') }
      : { bottom: 1.5, height: .9, tiers: [{ depth: .35, bays: [id('upper-a'), id('upper-a-shelf'), id('upper-a-screen'), id('upper-a-shelf')] }], underLens: id('lens') },
    bulkhead: { module: id('bulkhead') },
    ...(column ? { column: { width: .9, depth: .65, modules: { stack: [id('column-base'), id('column-mid'), id('column-top')], screen: `wall-screen-${sid}-kitchen` } } } : {}),
    lens: { y: look === 'e1' ? 1.9 : 1.5, z: look === 'e1' ? .3 : .2, lumensPerMetre: look === 'e1' ? 110 : 80, ...(color ? { color } : {}) },
  };
}

export const E1_KITCHEN = kitchenSpec('e1', 'e1', ['display', 'sink', 'door', 'drawers', 'hob', 'door', 'drawers'], CYAN, true);
/** The E1 window leg of the L: sink under the window, the display bay, no column; its
 *  worktop steps up into a ledge along the glass. */
export const E1_KITCHEN_WINDOW = kitchenSpec('e1', 'e1', ['drawers', 'sink', 'display', 'door'], CYAN, false, true);
export const B3_BAR = kitchenSpec('b3', 'bar', ['drawers', 'door', 'sink', 'door', 'display', 'drawers'], undefined, true);

const E1_LOOK: KitchenLook = {
  carcass: LOOK.e1Housing, front: LOOK.e1Housing, toe: LOOK.black, kick: LOOK.e1Steel, top: LOOK.e1Steel, splash: LOOK.e1Splash, upper: LOOK.e1Housing,
  line: LOOK.black, grille: LOOK.e1Mesh, screen: LOOK.e1Screen, panel: LOOK.e1Panel, lens: LOOK.lensCool, steel: LOOK.e1Steel, glass: LOOK.black, uppers: 'e1',
};
const B3_LOOK: KitchenLook = {
  carcass: LOOK.b3Walnut, front: LOOK.b3Walnut, toe: LOOK.black, kick: LOOK.gold, top: LOOK.b3Stone, splash: LOOK.b3Walnut, upper: LOOK.b3Walnut,
  line: LOOK.black, grille: LOOK.black, screen: LOOK.b3Screen, panel: LOOK.b3Screen, lens: LOOK.lensWarm, steel: STAINLESS, glass: LOOK.black,
  bottle: ['cyberpunk/window-glass/high_rich#1', 'cyberpunk/window-glass-opaque/mid#dark'], uppers: 'bar',
};

// ---- islands, planters, enclosures ---------------------------------------------------

export const E1_ISLAND: IslandSpec = {
  top: 'fit-e1-island-top', topEnd: { module: 'fit-e1-island-top-end', width: .03 }, base: 'fit-e1-island-base', overhang: .09,
  glow: { lumensPerMetre: 60, kelvin: 6500, color: CYAN },
};
export const B3_COUNTER: IslandSpec = { top: 'fit-b3-counter-top', topEnd: { module: 'fit-b3-counter-top-end', width: .02 }, base: 'fit-b3-counter-base', overhang: .12 };

/** A counter slab one cell deep: its section rounded front and back, swept along the run,
 *  and its end nose (x from 0 to e) swept across it. */
function counterTop(k: Kit, slot: string, t: number, r: number): void {
  k.sweep(slot, roundedSection(0, t, -.25, .25, { bottomFront: r * .4, topFront: r, topBack: r, bottomBack: r * .4 }, 4), -.25, .25);
}
function counterEnd(k: Kit, slot: string, t: number, r: number, e: number): void {
  // (x, y) points of the end section: roundedSection's (y, z) with z the outward x.
  const section = roundedSection(0, t, 0, e, { bottomFront: r * .4, topFront: r }, 4).map(([y, x]) => [x, y] as Point);
  k.sweep(slot, section, -.25, .25, { axis: 'z' });
}

/** The E1 window trough section (y, z): 0.78 m high, a rounded top front edge, a rim round
 *  the soil bed. */
const TROUGH: Point[] = [[0, 0], [0, .36], [.72, .36],
  ...Array.from({ length: 6 }, (_, i) => { const a = (i + 1) / 6 * Math.PI / 2; return [.72 + .06 * Math.sin(a), .3 + .06 * Math.cos(a)] as Point; }),
  [.78, .27], [.73, .27], [.73, .04], [.78, .04], [.78, 0]];

export const E1_PLANTER: PlanterSpec = { end: 'fit-e1-planter-end', body: 'fit-e1-planter-body', soil: 'fit-e1-planter-soil', bay: 'fit-e1-planter-bay', height: .78 };

export const E1_BAMBOO: GlassPlanterSpec = {
  base: 'fit-e1-bamboo-base', soil: 'fit-e1-bamboo-soil', bay: 'fit-e1-bamboo-bay', pane: 'fit-e1-bamboo-pane', post: 'fit-e1-bamboo-post',
  glass: 'ceiling', rowPitch: .3, frame: { lens: 'ceiling-cove-e1-bamboo-frame', lumensPerMetre: 70, kelvin: 4000 },
};
export const B3_BAMBOO: GlassPlanterSpec = {
  base: 'fit-b3-bamboo-base', soil: 'fit-e1-bamboo-soil', bay: 'fit-e1-bamboo-bay', pane: 'fit-e1-bamboo-pane', post: 'fit-b3-bamboo-post',
  glass: 1.05, rowPitch: .5,
};

// ---- runs --------------------------------------------------------------------------

export const E1_WARDROBE: TallRunSpec = {
  run: { start: 'fit-e1-wardrobe-end', end: 'fit-e1-wardrobe-end', mid: 'fit-e1-wardrobe-back', repeat: { module: 'fit-e1-wardrobe-bay', pitch: .9 },
    filler: 'fit-e1-wardrobe-filler', height: 2.4, depth: .6 },
  bulkhead: 'fit-e1-shelf-bulkhead',
  line: { module: 'fit-e1-wardrobe-line', y: .012, z: .56, lumensPerMetre: 45, kelvin: 2700, color: RED, facing: 'up' },
};
export const E1_DISPLAY: TallRunSpec = {
  run: { start: 'fit-e1-display-side', end: 'fit-e1-display-side', mid: 'fit-e1-display-back', repeat: { module: 'fit-e1-display-bay', pitch: .45 },
    filler: 'fit-e1-display-back', height: 2.4, depth: .4 },
  bulkhead: 'fit-e1-shelf-bulkhead',
};
export const B3_MEDIA: RunSpec = {
  start: 'fit-b3-media-end', end: 'fit-b3-media-end', mid: 'fit-b3-media-top', repeat: { module: 'fit-b3-media-bay', pitch: .75 },
  filler: 'fit-b3-media-filler', height: .6, depth: .45,
};
export const E5_BAR: RunSpec = {
  start: 'fit-e5-bar-end', end: 'fit-e5-bar-end', mid: 'fit-e5-bar-top', repeat: { module: 'fit-e5-bar-bay', pitch: .6 },
  filler: 'fit-e5-bar-filler', height: 1.1, depth: .45,
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
  kitchenRecipes('e1', E1_LOOK, E1_KITCHEN, true)(add);
  // E5 back bar storage: ivory door bays between mineral ends, a mineral top, a dark plinth.
  add('fit-e5-bar-end', k => box(k, LOOK.e5Mineral, -.02, .02, 0, 1.1, 0, .45));
  add('fit-e5-bar-top', k => { box(k, LOOK.e5Stone, -.25, .25, 1.06, 1.1, 0, .45); box(k, LOOK.black, -.25, .25, 0, .08, .03, .41); });
  add('fit-e5-bar-filler', k => box(k, LOOK.e5Ivory, -.25, .25, .08, 1.06, 0, .44));
  add('fit-e5-bar-bay', k => {
    box(k, LOOK.e5Ivory, -.2985, .2985, .08, 1.06, 0, .43);
    box(k, LOOK.e5Ivory, -.297, .297, .083, 1.057, .43, .445);
    box(k, LOOK.bronze, .22, .232, .5, .9, .445, .449);
  });
  add('fit-e1-island-top', k => counterTop(k, LOOK.e1IslandTop, .08, .016));
  add('fit-e1-island-top-end', k => counterEnd(k, LOOK.e1IslandTop, .08, .016, .03));
  // The lit caustic glass block in a black frame: corner posts, a top rail, a recessed
  // plinth. Its glass is an exact map, fitted once over each face however far it stretches.
  add('fit-e1-island-base', k => {
    box(k, LOOK.e1Caustic, -.245, .245, .03, .925, -.245, .245);
    box(k, LOOK.black, -.235, .235, 0, .03, -.235, .235);
    box(k, LOOK.black, -.25, .25, .925, .94, -.25, .25);
    for (const x of [-.25, .238]) for (const z of [-.25, .238]) box(k, LOOK.black, x, x + .012, .03, .925, z, z + .012);
  });
  add('fit-e1-planter-body', k => { k.sweep(LOOK.e1Cream, TROUGH, -.25, .25, { caps: false }); box(k, LOOK.black, -.25, .25, .5, .516, .36, .362); });
  add('fit-e1-planter-end', k => k.sweep(LOOK.e1Cream, TROUGH, -.02, .02));
  add('fit-e1-planter-soil', k => box(k, LOOK.soil, -.25, .25, .73, .75, .04, .27));
  // Six broad-leaved tufts per metre leaning out of the bed towards the room, never back
  // into the window: arching blades with a keel, inside the bay and a hand over the front.
  add('fit-e1-planter-bay', k => {
    const bounds = { x: [-.5, .5] as [number, number], y: [.75, 2.2] as [number, number], z: [.01, .46] as [number, number] };
    for (let i = 0; i < 6; i++) {
      const x = -.42 + i * .168, z = .12 + (i % 2) * .07, h = .55 + (i % 3) * .1;
      tuft(k, LOOK.leaf, LOOK.stem, [x, .75, z], h * .75, 91 + i * 17, 7, Math.PI / 2, bounds);
    }
  });
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
  // One timber soffit closes both the wardrobe and the display shelving to the ceiling.
  add('fit-e1-shelf-bulkhead', k => box(k, LOOK.e1Shelf, -.25, .25, 0, .5, 0, .4));
  add('fit-e1-wardrobe-line', k => box(k, LOOK.lensRed, -.25, .25, 0, .006, -.006, .006));
  // Cream AC housing over doors and portals.
  add('housing-e1-ac-body', k => k.sweep(LOOK.e1Cream, HOUSING, -.25, .25, { caps: false }));
  add('housing-e1-ac-cap', k => k.sweep(LOOK.e1Cream, HOUSING, -.015, .015));
  add('housing-e1-ac-grille', k => grillePanel(k, [[-.2, .15], [.2, .15], [.2, .28], [-.2, .28]], .4512, LOOK.e1Mesh, LOOK.black));
};

/** Kind A pieces a kind registers when its templates place them (they cost kit bytes): the
 *  bamboo glass enclosure and the display shelving beside the kitchen. */
const kindAExtra: RecipeSet = add => {
  add('fit-e1-bamboo-base', k => { box(k, LOOK.e1Housing, -.25, .25, 0, .3, -.25, .25); box(k, LOOK.black, -.25, .25, 0, .04, -.252, .252); });
  add('fit-e1-bamboo-soil', k => box(k, LOOK.soil, -.25, .25, .3, .31, -.25, .25));
  // A dense metre of bamboo: round culms with node rings, twigs and narrow leaves up top.
  add('fit-e1-bamboo-bay', k => bambooBay(k, LOOK.stem, LOOK.leaf, .96, .3, 2.3, 2609));
  add('fit-e1-bamboo-pane', k => box(k, LOOK.glass, -.25, .25, 0, .5, -.005, .005));
  add('fit-e1-bamboo-post', k => box(k, LOOK.black, -.015, .015, 0, .5, -.015, .015));
  add('ceiling-cove-e1-bamboo-frame', k => box(k, LOOK.lensCool, -.25, .25, -.01, 0, -.02, .02));
  // Dark display shelving beside the kitchen.
  add('fit-e1-display-back', k => box(k, LOOK.black, -.25, .25, 0, 2.4, 0, .02));
  add('fit-e1-display-side', k => box(k, LOOK.e1Shelf, -.02, .02, 0, 2.4, 0, .4));
  add('fit-e1-display-bay', k => {
    box(k, LOOK.e1Shelf, -.225, .225, 0, .9, .02, .4);
    for (const y of [1.25, 1.6, 1.95, 2.3]) box(k, LOOK.e1Shelf, -.2225, .2225, y, y + .025, .02, .38);
    box(k, LOOK.e1Shelf, .2125, .225, .9, 2.4, .02, .38);
  });
};

const kindB: RecipeSet = add => {
  kitchenRecipes('b3', B3_LOOK, B3_BAR)(add);
  // Media console under the TV wall: walnut drawer bays on a gold plinth, a stone top.
  add('fit-b3-media-end', k => box(k, LOOK.b3Walnut, -.015, .015, 0, .6, 0, .45));
  add('fit-b3-media-top', k => { box(k, LOOK.b3Stone, -.25, .25, .57, .6, 0, .45); box(k, LOOK.gold, -.25, .25, 0, .04, .03, .42); });
  add('fit-b3-media-filler', k => box(k, LOOK.b3Walnut, -.25, .25, .04, .57, 0, .44));
  add('fit-b3-media-bay', k => {
    box(k, LOOK.b3Walnut, -.374, .374, .04, .57, 0, .43);
    for (const [y0, y1] of [[.045, .3], [.305, .565]] as const) {
      box(k, LOOK.b3Walnut, -.372, .372, y0, y1, .43, .45);
      box(k, LOOK.gold, -.1, .1, y1 - .05, y1 - .038, .45, .453);
    }
  });
  add('fit-b3-counter-top', k => counterTop(k, LOOK.b3Stone, .05, .008));
  add('fit-b3-counter-top-end', k => counterEnd(k, LOOK.b3Stone, .05, .008, .02));
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

export const assemblyRecipesA = kindA, assemblyRecipesAExtra = kindAExtra, assemblyRecipesB = kindB, assemblyRecipesC = kindC, assemblyRecipesR = kindR;
registerModuleSizes(kindA, kindAExtra, kindB, kindC, kindR);

/** Kind A built-ins: assemblies by fit id, housings, and the modules they draw. */
export const BUILT_INS_A: { assemblies: Record<string, AssemblySpec>; housings: HousingSpec[]; recipes: RecipeSet[] } = {
  assemblies: {
    'asm-e1-kitchen': { type: 'kitchen', spec: E1_KITCHEN },
    'asm-e1-kitchen-window': { type: 'kitchen', spec: E1_KITCHEN_WINDOW },
    'asm-e1-island': { type: 'custom', place: (b, f, i, c) => placeIsland(b, f, i, E1_ISLAND, c) },
    'asm-e1-planter': { type: 'planter', spec: E1_PLANTER },
    'asm-e1-wardrobe': { type: 'custom', place: (b, f, i, c) => placeTallRun(b, f, i, E1_WARDROBE, c) },
    'asm-e5-bar': { type: 'run', spec: E5_BAR },
  },
  housings: [E1_HOUSING_DOORS, E1_HOUSING_PORTALS],
  recipes: [kindA],
};
/** Opt-in kind A built-ins (see `kindAExtra`). */
export const BUILT_INS_A_EXTRA: typeof BUILT_INS_A = {
  assemblies: {
    'asm-e1-bamboo': { type: 'custom', place: (b, f, i, c) => placeGlassPlanter(b, f, i, E1_BAMBOO, c) },
    'asm-e1-display': { type: 'custom', place: (b, f, i, c) => placeTallRun(b, f, i, E1_DISPLAY, c) },
  },
  housings: [],
  recipes: [kindAExtra],
};
export const BUILT_INS_B: typeof BUILT_INS_A = {
  assemblies: {
    'asm-b3-bar': { type: 'kitchen', spec: B3_BAR },
    'asm-b3-counter': { type: 'custom', place: (b, f, i, c) => placeIsland(b, f, i, B3_COUNTER, c) },
    'asm-b3-bamboo': { type: 'custom', place: (b, f, i, c) => placeGlassPlanter(b, f, i, B3_BAMBOO, c) },
    'asm-b3-media': { type: 'run', spec: B3_MEDIA },
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
