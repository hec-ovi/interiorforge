import type { KindExports } from '../systems/types.js';
import { referenceCasings } from '../systems/reference-portals.js';
import { R1_ASSEMBLIES, r1FurnitureRecipes } from './furniture.js';
import { R1_STYLE } from './style.js';
import { R1_PANEL } from './systems.js';

/** Kind R, rich office (r1): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file. */
export const kind: KindExports = {
    kind: 'R',
    styles: [R1_STYLE],
    panels: [R1_PANEL.system],
    glazing: [],
    ceilings: [],
    floors: [],
    portals: [],
    assemblies: { ...R1_ASSEMBLIES },
    housings: [],
    recipes: [R1_PANEL.recipes, referenceCasings('r1'), r1FurnitureRecipes],
};
