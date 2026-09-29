import { FINISH as F } from '../../modules/finishes.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { softBox } from './model-geometry.js';

/** Corpo 71808: one dark slab on a fine open frame. Each authored length retains
 * the same edge radius, slab thickness and leg section; no tile-wall tabletop. */
const TABLES = [
  { module: 'fit-dining-corpo-four', size: [2, 1, .75] as [number, number, number] },
  { module: 'fit-dining-corpo-pair', size: [1.4, .9, .75] as [number, number, number] },
  { module: 'fit-dining-corpo-breakfast', size: [1.6, .75, .75] as [number, number, number] },
];

export function luxuryDiningFit(size?: readonly number[]): { module: string; size: [number, number, number] } | null {
  return size ? TABLES.find(table => Math.abs(table.size[0] - size[0]!) < .001 && Math.abs(table.size[1] - size[1]!) < .001) ?? null : null;
}

export const luxuryDiningRecipes: RecipeSet = add => {
  for (const { module, size: [width, depth] } of TABLES) add(module, k => {
    softBox(k, 'cyberpunk/corpo-plaza-stone/rich#polished', [0, .724, 0], [width, .026, depth], { radius: .004 });
    softBox(k, F.bronze, [0, .720, 0], [width - .012, .004, depth - .012], { radius: .001 });
    for (const x of [-width / 2 + .14, width / 2 - .14]) for (const z of [-depth / 2 + .13, depth / 2 - .13]) {
      softBox(k, F.black, [x, 0, z], [.042, .012, .050], { radius: .003 });
      k.rod(F.bronze, [x, .012, z], [x, .714, z], .027);
    }
    for (const z of [-depth / 2 + .13, depth / 2 - .13])
      softBox(k, F.black, [0, .685, z], [width - .25, .033, .032], { radius: .003 });
    for (const x of [-width / 2 + .14, width / 2 - .14])
      softBox(k, F.black, [x, .685, 0], [.030, .033, depth - .24], { radius: .003 });
  });
};
