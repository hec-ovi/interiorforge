import type { Point } from "../../core/geom.js";
import type { Vec3 } from "../../glb/mesh-builder.js";
import { softBox } from "../../styles/luxury/model-geometry.js";
import { FINISH as F } from "../finishes.js";
import type { Kit } from "../kit.js";
import type { RecipeSet } from "../recipes.js";

/** Small decor and counter appliances the dressing pass stands on worktops, shelves,
 *  tables and desks, and the counter stools it sets at islands and bars. Each stands on
 *  y = 0, centred in XZ, its front to +z; every round thing is turned and every box has a
 *  rounded edge. Catalog models (CC0 vases, bottles, sculpture) join these as props. */

const STEEL = "cyberpunk/interior-alloy/rich#satin-fine";
const DARK_GLASS = "cyberpunk/window-glass-opaque/mid#dark";
const GREEN_GLASS = "cyberpunk/window-glass/high_rich#1";
const PAGES = F.linen;
/** Book cloth in rotation: navy, teal leather, charcoal, cream leather, walnut, ink. */
export const BOOK_CLOTH = [
  "cyberpunk/meridian-upholstery/rich#navy", "cyberpunk/r1-leather/rich#teal-navy", "cyberpunk/meridian-upholstery/rich#charcoal",
  "cyberpunk/corpo-plaza-leather/rich#cream", "cyberpunk/corpo-plaza-veneer/rich#walnut", "cyberpunk/gutierrez-lacquer/rich#ink",
] as const;

/** A turned vase `height` tall and `width` across its belly, open at a flared lip; `neck`
 *  narrows it into a bottle vase. */
export function vase(k: Kit, slot: string, at: Vec3, height: number, width: number, neck = .45, sides = 32): void {
  const r = width / 2, n = r * neck, h = height;
  k.turned(slot, at, [[0, 0], [r * .55, 0], [r * .62, h * .02], [r * .92, h * .22], [r, h * .42], [r * .9, h * .62], [n * 1.05, h * .8],
    [n, h * .9], [n * 1.2, h * .985], [n * 1.22, h], [n * 1.08, h], [n * .92, h * .92], [n * .9, h * .82], [0, h * .8]], sides);
}

const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** A profile arc (r, y) about (0, cy) from angle a0 to a1 (radians, 0 = +r). */
function ring(cy: number, radius: number, a0: number, a1: number, n: number): [number, number][] {
  return Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [Math.max(0, radius * Math.cos(a)), cy + radius * Math.sin(a)]; });
}
const sphere = (k: Kit, slot: string, at: Vec3, r: number) => k.turned(slot, [at[0], at[1] + r, at[2]], ring(0, r, -Math.PI / 2, Math.PI / 2, 8), 16);

/** A hardcover standing on its tail, spine to +z, `w` thick, `h` tall and `d` deep: two
 *  boards joined by a rounded spine, swept up its height, round a page block set 3 mm in
 *  from the boards' head, tail and fore-edge. About 80 triangles. */
export function hardcover(k: Kit, slot: string, pages: string, x: number, y: number, z: number, w: number, h: number, d: number): void {
  const t = Math.min(.0025, w * .12), bulge = Math.min(.006, w * .3), back = z - d / 2, spine = z + d / 2 - bulge;
  // (z, x) section: one board from the fore-edge to the spine, round the spine, back along
  // the other board, then in by the board thickness and back round the inside.
  const arc = (halfWidth: number, depth: number, from: number, to: number): Point[] => Array.from({ length: 5 }, (_, i) => {
    const a = Math.PI * (from + (to - from) * (i + 1) / 6);
    return [spine + Math.sin(a) * depth, x - Math.cos(a) * halfWidth] as Point;
  });
  const outer = w / 2, inner = w / 2 - t;
  const section: Point[] = [[back, x - outer], [spine, x - outer], ...arc(outer, bulge, 0, 1), [spine, x + outer], [back, x + outer],
    [back, x + inner], [spine, x + inner], ...arc(inner, Math.max(.0005, bulge - t), 1, 0), [spine, x - inner], [back, x - inner]];
  k.sweep(slot, section, y, y + h, { axis: "y" });
  k.box(pages, [x - inner, y + .003, back + .003], [2 * inner, h - .006, spine - back - .003], undefined, ["top", "south"]);
}

/** A book standing on its tail; `lean` tips it about z (radians) against its neighbour, as a
 *  rounded cloth block. */
function book(k: Kit, slot: string, x: number, y: number, z: number, w: number, h: number, d: number, lean = 0): void {
  if (lean) { softBox(k, slot, [x, y + .004, z], [w, h, d], { radius: Math.min(.003, w * .3), detail: 0, rotation: [0, 0, lean] }); return; }
  hardcover(k, slot, PAGES, x, y, z, w, h, d);
}

/** A row of upright books from x0, `count` of them, colours from `seed`; the last leans on
 *  its neighbour when `lean`. Returns the row's right end. */
function bookRow(k: Kit, x0: number, count: number, seed: number, depth = .16, lean = false): number {
  let x = x0;
  for (let i = 0; i < count; i++) {
    const w = .018 + hash(seed + i) * .026, h = .2 + hash(seed * 3 + i) * .07, d = depth - hash(seed * 7 + i) * .02;
    const slot = BOOK_CLOTH[Math.floor(hash(seed * 11 + i) * BOOK_CLOTH.length)]!;
    if (lean && i === count - 1) book(k, slot, x + w / 2 + h * .18, 0, 0, w, h, d, -.32);
    else book(k, slot, x + w / 2, 0, 0, w, h, d);
    x += w + .001;
  }
  return x;
}

/** Stool legs from the seat's underside out to a splayed foot circle, with a foot ring. */
function stoolFrame(k: Kit, slot: string, seat: number, top: number, foot: number, ringY: number, legs = 4): void {
  for (let i = 0; i < legs; i++) {
    const a = (i + .5) / legs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    k.tube(slot, [[c * top, seat, s * top], [c * foot, .012, s * foot]], .011, false, 10);
    k.cylinder(F.black, [c * foot, 0, s * foot], .014, .012, 12);
  }
  const r = top + (foot - top) * (1 - ringY / seat), loop: Vec3[] = [];
  for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2; loop.push([Math.cos(a) * r, ringY, Math.sin(a) * r]); }
  k.tube(slot, loop, .009, true, 8);
}

export const decorRecipes: RecipeSet = (add) => {
  // Espresso machine: dark body with a steel cap, the group head under a front hood, a
  // portafilter, a drip tray with its grille and a cup, a small status screen.
  add("decor-coffee-machine", (k) => {
    k.bevelBox(F.black, [-.12, .012, -.16], [.24, .37, .2], .012);
    k.bevelBox(STEEL, [-.118, .38, -.158], [.236, .014, .196], .005);
    k.bevelBox(F.black, [-.11, .25, .03], [.22, .11, .1], .01);
    k.cylinder(STEEL, [0, .215, .085], .034, .035, 24);
    k.cylinder(STEEL, [0, .205, .085], .03, .012, 24);
    k.tube(F.black, [[0, .21, .11], [0, .205, .2]], .009, false, 10);
    k.bevelBox(STEEL, [-.1, .012, .03], [.2, .018, .11], .004);
    for (let i = 0; i < 6; i++) k.box(F.black, [-.09 + i * .034, .0305, .04], [.02, .0006, .09]);
    k.turned(F.ceramic, [0, .031, .085], [[0, 0], [.028, 0], [.032, .01], [.035, .055], [.032, .055], [.029, .012], [0, .01]], 20);
    k.box(F.screen, [-.04, .31, .1301], [.08, .03, .0012], "unit", ["north"]);
    for (const x of [-.1, .1]) for (const z of [-.14, .12]) k.cylinder(F.black, [x, 0, z], .012, .012, 12);
  });
  // Kettle on its power base: a turned steel body, a bent handle over the lid, a spout.
  add("decor-kettle", (k) => {
    k.cylinder(F.black, [0, 0, 0], .085, .016, 32);
    k.turned(STEEL, [0, .016, 0], [[0, 0], [.07, 0], [.078, .012], [.08, .1], [.074, .15], [.058, .175], [.03, .186], [.03, .192], [0, .192]], 32);
    k.cylinder(F.black, [0, .205, 0], .018, .01, 16);
    k.tube(F.black, [[0, .16, -.07], [0, .24, -.055], [0, .255, 0], [0, .24, .04]], .01, false, 10);
    k.tube(STEEL, [[0, .07, .075], [0, .12, .1], [0, .15, .115]], .012, false, 12);
  });
  // Three canisters in a row: glazed bodies, steel lids with a knob.
  add("decor-canisters", (k) => {
    for (const [x, h, r] of [[-.12, .19, .055], [0, .15, .05], [.11, .11, .045]] as const) {
      k.turned(F.ceramic, [x, 0, 0], [[0, 0], [r - .004, 0], [r, .006], [r, h - .012], [r - .003, h - .01], [0, h - .01]], 28);
      k.turned(STEEL, [x, h - .012, 0], [[0, 0], [r + .002, 0], [r + .002, .012], [r - .006, .016], [0, .016]], 28);
      k.turned(STEEL, [x, h + .004, 0], [[0, 0], [.009, 0], [.011, .008], [.006, .014], [0, .014]], 12);
    }
  });
  // Knife block: a sloped timber block, five black handles standing out of its top.
  add("decor-knife-block", (k) => {
    const section: Point[] = [[0, -.1], [0, .08], [.22, .08], [.3, -.05], [.3, -.1]];
    k.sweep(F.plank, section, -.06, .06, { crease: 20 });
    for (let i = 0; i < 5; i++) {
      const x = -.04 + i * .02, y = .27 - (i % 2) * .02, z = -.02 - (i % 2) * .02;
      k.tube(F.black, [[x, y - .02, z + .01], [x, y + .09, z - .03]], .009 + (i === 0 ? .003 : 0), false, 10);
    }
  });
  // Books: three rows (one with a bookend), and a stack of three lying flat.
  add("decor-books-row-a", (k) => { bookRow(k, -.16, 9, 3, .17, true); });
  add("decor-books-row-b", (k) => { bookRow(k, -.22, 12, 17); });
  add("decor-books-row-c", (k) => {
    const end = bookRow(k, -.11, 6, 29, .15);
    k.bevelBox(F.bronze, [end + .002, 0, -.06], [.006, .16, .12], .002);
    k.bevelBox(F.bronze, [end - .09, 0, -.06], [.1, .004, .12], .0015);
  });
  add("decor-books-stack", (k) => {
    let y = 0;
    for (const [w, d, h, yaw, cloth] of [[.26, .2, .032, .05, 0], [.23, .17, .028, -.12, 3], [.19, .14, .024, .2, 1]] as const) {
      softBox(k, BOOK_CLOTH[cloth]!, [0, y, 0], [w, h, d], { radius: .004, detail: 0, rotation: [0, yaw, 0] });
      y += h;
    }
  });
  add("decor-tumblers", (k) => {
    const glass: [number, number][] = [[0, 0], [.034, 0], [.036, .012], [.038, .095], [.035, .095], [.033, .014], [0, .014]];
    for (const [x, z] of [[-.05, 0], [.04, -.02], [.01, .05]] as const) k.turned(F.glass, [x, 0, z], glass, 24);
  });
  // A shallow glazed bowl of oranges and green apples.
  add("decor-fruit-bowl", (k) => {
    k.turned(F.ceramic, [0, 0, 0], [[0, 0], [.07, 0], [.09, .01], [.14, .06], [.145, .07], [.138, .068], [.085, .018], [0, .012]], 36);
    for (const [x, z, r, slot] of [[-.04, -.03, .036, F.fish], [.045, -.02, .038, F.fish], [0, .045, .035, "cyberpunk/garden-leaf-light/mid#surface"], [-.02, .005, .034, F.fish], [.02, .01, .033, "cyberpunk/garden-leaf-light/mid#surface"]] as const)
      sphere(k, slot, [x, .012 + (Math.hypot(x, z) < .03 ? .03 : 0), z], r);
  });
  // Three bottles for a bar: a dark wine bottle, a green bottle, a square-shouldered decanter.
  add("decor-bottles", (k) => {
    k.turned(DARK_GLASS, [-.08, 0, 0], [[0, 0], [.037, 0], [.038, .01], [.038, .2], [.03, .23], [.014, .25], [.013, .31], [.015, .312], [.015, .32], [0, .32]], 24);
    k.turned(GREEN_GLASS, [0, 0, .03], [[0, 0], [.034, 0], [.036, .01], [.036, .18], [.016, .215], [.013, .27], [.015, .275], [0, .275]], 24);
    k.turned(F.glass, [.085, 0, -.01], [[0, 0], [.045, 0], [.05, .012], [.05, .16], [.02, .19], [.016, .21], [0, .21]], 24);
    sphere(k, F.glass, [.085, .205, -.01], .022);
  });
  // Table lamp: a turned glazed base, a linen drum shade.
  add("decor-table-lamp", (k) => {
    k.turned(F.ceramic, [0, 0, 0], [[0, 0], [.06, 0], [.065, .01], [.075, .08], [.06, .16], [.025, .2], [.012, .24], [0, .24]], 28);
    k.cylinder(STEEL, [0, .24, 0], .005, .06, 8);
    k.turned(F.linen, [0, .26, 0], [[.11, 0], [.115, 0], [.1, .16], [.095, .16], [.11, .003]], 36);
  });
  // A bronze tray with a carafe and two glasses.
  add("decor-tray", (k) => {
    k.bevelBox(F.bronze, [-.16, 0, -.1], [.32, .012, .2], .004);
    k.turned(F.glass, [-.07, .012, 0], [[0, 0], [.045, 0], [.05, .015], [.048, .12], [.025, .18], [.02, .22], [.023, .225], [0, .225]], 24);
    for (const x of [.04, .1]) k.turned(F.glass, [x, .012, .02], [[0, 0], [.03, 0], [.032, .01], [.034, .085], [.031, .085], [.029, .012], [0, .012]], 20);
  });
  // Counter stools. E1: a padded round seat on splayed pale steel legs with a foot ring,
  // seat 0.68 m under a 0.95 m island. B3: a small leather seat on a wire sled frame,
  // seat 0.76 m under the 1.05 m bar.
  add("fit-bar-stool-e1", (k) => {
    k.turned("cyberpunk/meridian-upholstery/rich#charcoal", [0, .62, 0], [[0, 0], [.16, 0], [.185, .015], [.19, .04], [.18, .058], [.12, .066], [0, .068]], 36);
    k.cylinder(STEEL, [0, .6, 0], .12, .02, 32);
    stoolFrame(k, STEEL, .6, .1, .22, .26);
  });
  add("fit-bar-stool-b3", (k) => {
    k.turned("cyberpunk/corpo-plaza-leather/rich#cream", [0, .72, 0], [[0, 0], [.15, 0], [.17, .012], [.172, .03], [.16, .042], [0, .045]], 32);
    k.cylinder(F.black, [0, .705, 0], .13, .015, 32);
    for (const s of [-1, 1]) {
      const x = s * .15;
      k.tube(F.bronze, [[x, .705, -.12], [x, .02, -.2], [x, .008, -.16], [x, .008, .16], [x, .02, .2], [x, .705, .12]], .008, false, 8);
    }
    k.tube(F.bronze, [[-.15, .26, .17], [.15, .26, .17]], .008, false, 8);
    k.tube(F.bronze, [[-.15, .705, 0], [.15, .705, 0]], .008, false, 8);
  });
};
