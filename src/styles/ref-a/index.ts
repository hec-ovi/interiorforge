import type { RecipeSet } from '../../modules/recipes.js';
import { BUILT_INS_A } from '../systems/reference-assemblies.js';
import { portalsWithLayers, referenceCasingRecipes } from '../systems/reference-portals.js';
import type { KindExports } from '../systems/types.js';
import { E1_BED_PANEL, E1_CEILING, E1_FLOOR, E1_LOUNGE_FLOOR, E1_PANEL, E1_STYLE, E1_WARDROBE_PANEL } from './e1.js';
import { E2_CEILING, E2_FLOOR, E2_PANEL, E2_STYLE, e2LiftRecipes } from './e2.js';
import { E5_CEILING, E5_FLOOR, E5_PANEL, E5_STYLE } from './e5.js';
import { E6_CEILING, E6_FLOOR, E6_PANEL, E6_PLASTER_PANEL, E6_STYLE } from './e6.js';

/** Systems that share pieces (the lounge floor lays E1's stone and support) draw each
 *  module once: the first definition of an id wins. */
function once(...sets: RecipeSet[]): RecipeSet {
    return add => {
        const seen = new Set<string>();
        for (const set of sets) set((id, draw) => {
            if (seen.has(id)) return;
            seen.add(id);
            add(id, draw);
        });
    };
}

const panels = [E1_PANEL, E1_BED_PANEL, E1_WARDROBE_PANEL, E2_PANEL, E5_PANEL, E6_PANEL, E6_PLASTER_PANEL];
const ceilings = [E1_CEILING, E2_CEILING, E5_CEILING, E6_CEILING];
const floors = [E1_FLOOR, E1_LOUNGE_FLOOR, E2_FLOOR, E5_FLOOR, E6_FLOOR];

/** Kind A, high-tech luxury tower (e1, e2, e5, e6): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file. */
export const kind: KindExports = {
    kind: 'A',
    styles: [E1_STYLE, E2_STYLE, E5_STYLE, E6_STYLE],
    panels: panels.map(p => p.system),
    glazing: [],
    ceilings: ceilings.map(c => c.system),
    floors: floors.map(f => f.system),
    portals: portalsWithLayers('e1-inner', 'e2-lobby'),
    assemblies: { ...BUILT_INS_A.assemblies },
    housings: [...BUILT_INS_A.housings],
    recipes: [once(...panels.map(p => p.recipes), ...ceilings.map(c => c.recipes), ...floors.map(f => f.recipes),
        e2LiftRecipes, referenceCasingRecipes, ...BUILT_INS_A.recipes)],
};
