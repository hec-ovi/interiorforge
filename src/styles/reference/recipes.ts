import type { RecipeSet } from '../../modules/recipes.js';
import { portalRecipes } from '../systems/portal.js';
import { KINDS } from './registry.js';

/** Every module the reference kinds draw: each kind's own recipe sets, then one portal
 *  family per registered portal spec. Joined into the shared catalog (`modules/recipes.ts`). */
export const referenceRecipes: RecipeSet = add => {
    for (const kind of KINDS) {
        for (const set of kind.recipes) set(add);
        for (const portal of kind.portals) portalRecipes(portal)(add);
    }
};
