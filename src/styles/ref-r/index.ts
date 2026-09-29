import type { KindExports } from '../systems/types.js';
import { referenceCasings } from '../systems/reference-portals.js';
import { R1_ASSEMBLIES, r1FurnitureRecipes } from './furniture.js';
import { R1_STYLE } from './style.js';
import { R1_CEILING, R1_FLOOR, R1_GLAZING, R1_PANEL, R1_PORTALS } from './systems.js';

/** Kind R, rich office (r1): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file. */
export const kind: KindExports = {
    kind: 'R',
    styles: [R1_STYLE],
    panels: [R1_PANEL.system],
    glazing: [R1_GLAZING.system],
    ceilings: [R1_CEILING.system],
    floors: [R1_FLOOR.system],
    portals: R1_PORTALS,
    assemblies: { ...R1_ASSEMBLIES },
    housings: [],
    recipes: [R1_PANEL.recipes, R1_CEILING.recipes, R1_FLOOR.recipes, R1_GLAZING.recipes, referenceCasings('r1'), r1FurnitureRecipes],
};
