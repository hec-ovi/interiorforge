import { FINISH } from '../finishes.js';
import type { RecipeSet } from '../recipes.js';

/** A full-height metal guard at the unused flight mouth on the last landing.
 * Width scales with the lane; height and depth stay fixed in world metres. */
export const stairGuardRecipes: RecipeSet = (add) => {
    add('stair-landing-guard', (k) => {
        for (const x of [-.67, .67]) {
            // Side-mounted to the landing slab: no foot plate projects into the turn.
            k.cbox(FINISH.zinc, [x, -.12, 0], [.06, 1.22, .06]);
        }
        k.cbox(FINISH.zinc, [0, 1.04, 0], [1.4, .06, .06]);
        k.cbox(FINISH.zinc, [0, .06, 0], [1.4, .06, .04]);
        // Closely spaced upright infill also leaves the drop legible from the landing.
        for (let i = 1; i < 14; i++) {
            k.cbox(FINISH.zinc, [-.67 + 1.34 * i / 14, .12, 0], [.025, .92, .025]);
        }
    });
};
