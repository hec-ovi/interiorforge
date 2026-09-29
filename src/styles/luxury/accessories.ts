import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { industrialRecipes } from '../industrial/modules.js';
import { REFERENCE_MATERIAL as R } from './reference-furniture.js';
import { softBox, tube } from './model-geometry.js';

/** These frames are completed by real catalog vegetation in catalog-fits.ts.
 * Original furniture reservation and diffuser coordinates are retained. */
export const LUXURY_PLANT_FRAMES = {
  plant: { module: 'fit-planter-pedestal-luxury', size: [.5, .5, 1.3] as [number, number, number], plants: [[0, .47, 0]] },
  room_divider: { module: 'fit-planted-screen-luxury', size: [2.5, .5, 2] as [number, number, number], plants: [[-.81, .45, 0], [0, .45, 0], [.81, .45, 0]] },
  ornament_wall: { module: 'fit-planted-display-luxury', size: [3, .5, 2] as [number, number, number], plants: [[-.91, .54, -.005], [0, .77, -.005], [.91, .63, -.005]] },
} as const;

function lens(k: Kit, x: number, y: number, z: number, width: number, up = false): void {
  softBox(k, F.black, [x, up ? y - .018 : y + .002, z], [width + .014, .014, .034], { radius: .004 });
  k.cbox(F.lensWarm, [x, y - .004, z], [width, .008, .030]);
}

export const luxuryAccessoryRecipes: RecipeSet = add => {
  // Reuse the authored service rack in storage/mechanical rooms, with the same
  // under-shelf light as the luxury reservation already publishes.
  industrialRecipes((id, draw) => { if (id === 'fit-industrial-storage-rack') add('fit-service-shelf-luxury', k => { draw(k); lens(k, 0, 1.88, .15, 1.6); }); });
  add('fit-bookcase-luxury', k => {
    softBox(k, F.black, [0, 0, 0], [1.70, .075, .44], { radius: .006 });
    softBox(k, R.veneer, [0, .075, -.235], [1.80, 1.925, .03], { radius: .003 });
    for (const x of [-.882, .882]) softBox(k, R.veneer, [x, .075, 0], [.036, 1.925, .5], { radius: .003 });
    for (const y of [.09, .53, .97, 1.41, 1.955]) softBox(k, R.veneer, [0, y, 0], [1.728, .032, .49], { radius: .003 });
    const ivory = 'cyberpunk/ivory-panel/mid#native';
    for (const [row, y] of [.122, .562, 1.002, 1.442].entries()) {
      let x = -.76;
      for (let i = 0; i < 17; i++) {
        const width = .033 + ((i * 3 + row) % 5) * .008, height = .252 + ((i * 5 + row) % 7) * .013;
        const depth = .202 + (i % 3) * .012, front = .118 + (i % 4) * .002;
        const cloth = (i + row) % 5 ? 'cyberpunk/meridian-upholstery/rich#charcoal' : 'cyberpunk/meridian-bedding/rich#ivory';
        const center = x + width / 2, z = front - depth / 2;
        k.cbox(ivory, [center, y + .002, z], [width - .005, height - .004, depth - .008]);
        for (const side of [-1, 1]) softBox(k, cloth, [center + side * (width / 2 - .001), y, z], [.002, height, depth], { radius: .0006 });
        softBox(k, cloth, [center, y, front - .003], [width, height, .012], { radius: .003 });
        for (const band of [.035, height - .035]) k.cbox(F.bronze, [center, y + band, front + .0032], [width - .006, .001, .0007]);
        x += width + .002;
      }
      // A horizontal stack breaks the repeated vertical rows and exposes page edges.
      let stackY = y;
      for (let i = 0; i < 4; i++) {
        const width = .41 - (i % 3) * .025, thickness = .026 + (i % 2) * .008;
        const cloth = i % 3 ? 'cyberpunk/meridian-upholstery/rich#charcoal' : 'cyberpunk/meridian-bedding/rich#ivory';
        const center = .58 + (i % 2) * .012;
        k.cbox(ivory, [center, stackY + .002, -.01], [width - .01, thickness - .004, .218]);
        for (const yy of [stackY, stackY + thickness - .002]) softBox(k, cloth, [center, yy, -.01], [width, .002, .225], { radius: .0006 });
        softBox(k, cloth, [center, stackY, .104], [width, thickness, .006], { radius: .002 });
        stackY += thickness + .001;
      }
    }
    for (const x of [-.73, .73]) softBox(k, F.black, [x, 1.891, .15], [.012, .064, .02], { radius: .002 });
    lens(k, 0, 1.88, .15, 1.6);
  });

  add('fit-planter-pedestal-luxury', k => {
    softBox(k, F.black, [0, 0, 0], [.43, .035, .43], { radius: .012 });
    softBox(k, R.veneer, [0, .035, 0], [.40, .419, .40], { radius: .016 });
    softBox(k, F.bronze, [0, .454, 0], [.422, .008, .422], { radius: .003 });
    softBox(k, F.stone, [0, .462, 0], [.42, .008, .42], { radius: .002 });
    // A single slim grow-light stem replaces the old cage around seven flat leaves.
    tube(k, F.bronze, [[0, .02, -.223], [0, 1.26, -.223], [0, 1.286, -.20], [0, 1.286, 0]], .009, false, 12);
    lens(k, 0, 1.28, 0, .4);
  });
  add('fit-planted-screen-luxury', k => {
    softBox(k, F.black, [0, 0, 0], [2.39, .055, .44], { radius: .015 });
    softBox(k, R.veneer, [0, .055, 0], [2.49, .371, .495], { radius: .012 });
    softBox(k, F.bronze, [0, .426, 0], [2.48, .009, .49], { radius: .004 });
    softBox(k, F.stone, [0, .435, 0], [2.48, .015, .49], { radius: .004 });
    // Keep substantial depth on each slat, and put the screen behind the foliage.
    for (let i = 0; i < 17; i++) softBox(k, R.veneer, [-1.12 + i * .14, .45, -.236], [.036, 1.52, .025], { radius: .002 });
    softBox(k, R.veneer, [0, 1.97, -.236], [2.38, .030, .025], { radius: .004 });
    // Continuous uplight remains at the placement contract's .46 m centre.
    lens(k, 0, .46, 0, 2.2, true);
  });
  add('fit-planted-display-luxury', k => {
    softBox(k, F.black, [0, 0, 0], [2.86, .065, .43], { radius: .014 });
    softBox(k, R.veneer, [0, .065, 0], [3, .435, .5], { radius: .01 });
    // Thin physical back panel gives the real plant leaves the full cavity depth.
    softBox(k, F.graphite, [0, .5, -.246], [2.99, 1.50, .008], { radius: .002 });
    for (const [x, top] of [[-.91, .54], [0, .77], [.91, .63]]) {
      softBox(k, F.stone, [x!, .5, -.005], [.56, top! - .5, .45], { radius: .008 });
    }
    softBox(k, R.veneer, [0, 1.504, 0], [2.76, .058, .47], { radius: .007 });
    lens(k, 0, 1.488, 0, 2.4);
    for (const x of [-1.44, 1.44]) softBox(k, R.veneer, [x, .5, .218], [.12, 1.35, .064], { radius: .006 });
    softBox(k, R.veneer, [0, 1.85, .218], [3, .15, .064], { radius: .006 });
    // An open botanical display, not an aquarium with token leaf-shaped fish.
    // The original reference shows planted exhibition niches as well as glazing.
  });
};
