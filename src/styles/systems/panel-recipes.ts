import type { RecipeSet } from '../../modules/recipes.js';
import type { PanelProfile, PanelSystem } from './types.js';

/** The column, top, fill, edge, head and foot modules of one panel system, drawn from its
 *  profile (boxes and prisms, visible faces only, at most 400 triangles per column).
 *  Stub until package W lands: draws nothing; a kind registers its marker field itself. */
export function panelRecipes(_spec: PanelSystem, _profile: PanelProfile): RecipeSet {
    return () => {};
}
