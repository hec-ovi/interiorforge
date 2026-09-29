import { BUILT_INS_C } from '../systems/reference-assemblies.js';
import { portalsWithLayers } from '../systems/reference-portals.js';
import type { KindExports } from '../systems/types.js';
import { C1_BEAM, C7_DUCT, recipesC } from './recipes.js';
import { STYLES_C } from './styles.js';
import { CEILINGS_C, FLOORS_C, PANELS_C, surfaceRecipesC } from './surfaces.js';

/** Kind C, poor building of capsule homes (c1 to c7): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file.
 *  Doors keep the damaged family's casings; the H10 bathroom opens through its portal. */
export const kind: KindExports = {
    kind: 'C',
    styles: STYLES_C,
    panels: PANELS_C,
    glazing: [],
    ceilings: CEILINGS_C,
    floors: FLOORS_C,
    portals: portalsWithLayers('c1-bath'),
    assemblies: { ...BUILT_INS_C.assemblies },
    housings: [...BUILT_INS_C.housings, C1_BEAM, C7_DUCT],
    recipes: [
        ...BUILT_INS_C.recipes, surfaceRecipesC, recipesC,
    ],
};
