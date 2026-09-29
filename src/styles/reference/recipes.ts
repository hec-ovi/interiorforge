import type { RecipeSet } from '../../modules/recipes.js';
import { portalRecipes } from '../systems/portal.js';
import { KINDS, PANELS } from './registry.js';

/** Every module the reference kinds draw: each kind's own recipe sets, then one portal
 *  family per registered portal spec. Joined into the shared catalog (`modules/recipes.ts`). */
export const referenceRecipes: RecipeSet = add => {
    for (const kind of KINDS) {
        for (const set of kind.recipes) set(add);
        for (const portal of kind.portals) portalRecipes(portal)(add);
    }
};

/** Module ids of panel-system pieces that are not themselves a system's marker field: a
 *  stair wall never stands as one, so none gets a stair skin. */
export function panelPieces(): Set<string> {
    const pieces = new Set<string>();
    for (const spec of PANELS.values())
        for (const id of [spec.backing, spec.fill, spec.edge, spec.head?.module, spec.foot?.module])
            if (id && !PANELS.has(id)) pieces.add(id);
    return pieces;
}
