import { casingRecipes } from '../systems/portal.js';
import { BUILT_INS_C } from '../systems/reference-assemblies.js';
import { REFERENCE_CASINGS, portalsWithLayers } from '../systems/reference-portals.js';
import type { KindExports } from '../systems/types.js';
import { C1_BEAM, C7_DUCT, recipesC } from './recipes.js';
import { STYLES_C } from './styles.js';
import { CEILINGS_C, FLOORS_C, PANELS_C, surfaceRecipesC } from './surfaces.js';

/** Kind C, poor building of capsule homes (c1 to c7): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file.
 *  The C casings (`door-jamb|header-c1`, `-c2`) are registered here and nowhere else. */
export const kind: KindExports = {
    kind: 'C',
    styles: STYLES_C,
    panels: PANELS_C,
    glazing: [],
    ceilings: CEILINGS_C,
    floors: FLOORS_C,
    portals: portalsWithLayers('c1-bath', 'c3-guest'),
    assemblies: { ...BUILT_INS_C.assemblies },
    housings: [...BUILT_INS_C.housings, C1_BEAM, C7_DUCT],
    recipes: [
        ...BUILT_INS_C.recipes, surfaceRecipesC, recipesC,
        casingRecipes('c1', REFERENCE_CASINGS.c1!), casingRecipes('c2', REFERENCE_CASINGS.c2!),
    ],
};
