import type { Vec3 } from '../../glb/mesh-builder.js';
import type { Kit } from '../../modules/kit.js';
import { clothSurface } from '../luxury/model-geometry.js';

/** Planting baked into bay modules: leaves are thin closed blades that arch and droop,
 *  stems and culms are round tubes with node rings, every one seeded so no two tufts match.
 *  Budgets are per bay: a planted metre stays under 10 k triangles. */

const noise = (v: number) => { const a = Math.sin(v * 127.1 + 31.7) * 43758.5453; return a - Math.floor(a); };

export interface Bounds { x: [number, number]; y: [number, number]; z: [number, number] }
const clampTo = (b: Bounds | undefined, p: Vec3): Vec3 => b ? [
  Math.max(b.x[0], Math.min(b.x[1], p[0])), Math.max(b.y[0], Math.min(b.y[1], p[1])), Math.max(b.z[0], Math.min(b.z[1], p[2])),
] : p;

/** One leaf blade from `at` along a horizontal heading: it rises by `rise` of its length at
 *  its middle, droops at its tip, and is widest a third of the way out. */
export function blade(k: Kit, slot: string, at: Vec3, heading: number, length: number, width: number, rise = .35, droop = .25,
  bounds?: Bounds, segments = 6): void {
  const dx = Math.cos(heading), dz = Math.sin(heading), px = -dz, pz = dx;
  const point = (u: number, v: number, l: number): Vec3 => {
    const half = width / 2 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.25)), .7) * (1 - .35 * v), cross = (u - .5) * 2 * half;
    // A shallow keel: the blade's middle line sits a little above its edges.
    const keel = width * .12 * (1 - Math.abs(u * 2 - 1)) * Math.sin(Math.PI * v);
    const along = v * l, lift = l * (rise * Math.sin(v * Math.PI * .8) - droop * v * v);
    return [at[0] + dx * along + px * cross, at[1] + lift + keel, at[2] + dz * along + pz * cross];
  };
  // A blade that would leave its bay is shortened, never squashed flat against the bounds.
  const inside = (q: Vec3) => !bounds || (q[0] >= bounds.x[0] && q[0] <= bounds.x[1] && q[1] >= bounds.y[0] && q[1] <= bounds.y[1] && q[2] >= bounds.z[0] && q[2] <= bounds.z[1]);
  let l = length;
  for (let tries = 0; tries < 8 && ![0, .25, .5, .75, 1].every(v => inside(point(0, v, l)) && inside(point(1, v, l)) && inside(point(.5, v, l))); tries++) l *= .8;
  if (l < length * .2) return;
  clothSurface(k, slot, (u, v) => clampTo(bounds, point(u, v, l)), width, l, .0008, 2, segments);
}

/** A broad-leaved tuft: a short stem and `leaves` blades fanned round it, leaning out
 *  towards `facing` (radians) when given. */
export function tuft(k: Kit, leaf: string, stem: string, at: Vec3, height: number, seed: number, leaves = 7, facing?: number, bounds?: Bounds, upright = 1): void {
  k.tube(stem, [at, [at[0], at[1] + height * .35, at[2]]], .007, false, 6);
  for (let i = 0; i < leaves; i++) {
    const t = noise(seed + i), spread = facing === undefined ? i * 2.399 + t : facing + (i / Math.max(1, leaves - 1) - .5) * 2.6 + (t - .5) * .4;
    const y = at[1] + height * (.08 + .28 * noise(seed * 3 + i)), length = height * (.55 + .35 * noise(seed + 11 + i));
    blade(k, leaf, [at[0], y, at[2]], spread, length, height * (.2 + .1 * noise(seed + 23 + i)), (.3 + .25 * t) * upright, (.2 + .25 * noise(seed + 41 + i)) / upright, bounds);
  }
}

/** A metre of bamboo: `culms` round culms with node rings, short twigs with narrow leaves in
 *  the upper half, all inside `bounds`. */
export function bambooBay(k: Kit, stem: string, leaf: string, width: number, depth: number, height: number, seed: number, culms = 6): void {
  const bounds: Bounds = { x: [-width / 2, width / 2], y: [0, height + .1], z: [-depth / 2, depth / 2] };
  for (let i = 0; i < culms; i++) {
    const x = -width / 2 + .06 + (width - .12) * (i + .5) / culms + (noise(seed + i) - .5) * .05;
    const z = (noise(seed + i * 3) - .5) * depth * .5, h = height * (.8 + .2 * noise(seed + i * 5)), lean = (noise(seed + i * 7) - .5) * .06;
    const r = .012 + noise(seed + i * 9) * .005, shaft: Vec3[] = [];
    for (let s = 0; s <= 8; s++) shaft.push([x + lean * s / 8, h * s / 8, z + .01 * Math.sin(s * .5 + i)]);
    k.tube(stem, shaft, r, false, 8);
    for (let nIdx = 1; nIdx < 7; nIdx++) {
      const s = nIdx / 7, c = [x + lean * s, h * s, z + .01 * Math.sin(s * 8 * .5 + i)] as Vec3, ring: Vec3[] = [];
      for (let a = 0; a < 8; a++) { const t = a / 8 * Math.PI * 2; ring.push([c[0] + Math.cos(t) * (r + .001), c[1], c[2] + Math.sin(t) * (r + .001)]); }
      k.tube(stem, ring, .0022, true, 4);
      if (nIdx < 2) continue;
      // One twig a node, sides alternating up the culm, three narrow leaves on each.
      const side = (nIdx + i) % 2 ? 1 : -1, heading = (side > 0 ? 0 : Math.PI) + (noise(seed + i * 13 + nIdx) - .5) * 1.4;
      const end = clampTo(bounds, [c[0] + Math.cos(heading) * .1, c[1] + .07, c[2] + Math.sin(heading) * .07]);
      k.tube(stem, [c, end], .0025, false, 4);
      for (let l = 0; l < 3; l++)
        blade(k, leaf, end, heading + (l - 1) * .7 + (noise(seed + nIdx * 3 + l) - .5) * .4, .14 + .08 * noise(seed + i * 17 + nIdx * 5 + l), .024, .12, .5, bounds, 4);
    }
  }
}
