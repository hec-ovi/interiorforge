import type { RecipeSet } from '../../modules/recipes.js';
import { registerModuleSizes } from '../systems/built-ins.js';
import { BUILT_INS_A, BUILT_INS_A_EXTRA } from '../systems/reference-assemblies.js';
import { portalsWithLayers, referenceCasings } from '../systems/reference-portals.js';
import type { KindExports, PortalSpec } from '../systems/types.js';
import { E1_CEILING, E1_FLOOR, E1_LOUNGE_FLOOR, E1_PANEL, E1_STYLE } from './e1.js';
import { E1_COMPOSITES, e1BuiltInRecipes } from './e1-built-ins.js';
import { E1_SLOT, e1SlotRule } from './e1-slots.js';
import { E2_CORRIDOR_CEILING, E2_FLOOR, E2_PANEL, E2_STYLE, e2LiftRecipes } from './e2.js';
import { E5_CEILING, E5_FLOOR, E5_STYLE } from './e5.js';
import { E6_BATH_FLOOR, E6_CEILING, E6_FLOOR, E6_PANEL, E6_STYLE } from './e6.js';
import { remapSlots } from './remap.js';

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

const panels = [E1_PANEL, E2_PANEL, E6_PANEL];
const ceilings = [E1_CEILING, E2_CORRIDOR_CEILING, E5_CEILING, E6_CEILING];
const floors = [E1_FLOOR, E1_LOUNGE_FLOOR, E2_FLOOR, E5_FLOOR, E6_FLOOR, E6_BATH_FLOOR];

/** The suite portal and its stepped outer surround in the suite's cream, the reveal lens cyan. */
const portals: PortalSpec[] = portalsWithLayers('e1-inner').map(spec => ({
    ...spec, skin: { ...spec.skin, face: E1_SLOT.cream, ...(spec.skin.ret === spec.skin.face ? { ret: E1_SLOT.cream } : {}),
        ...('lens' in spec.skin ? { lens: E1_SLOT.cyan } : {}) } as PortalSpec['skin'],
}));

const builtIns = remapSlots(once(...BUILT_INS_A.recipes, ...BUILT_INS_A_EXTRA.recipes), e1SlotRule);
registerModuleSizes(e1BuiltInRecipes);

/** Kind A, high-tech luxury tower (e1, e2, e5, e6): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file. */
export const kind: KindExports = {
    kind: 'A',
    styles: [E1_STYLE, E2_STYLE, E5_STYLE, E6_STYLE],
    panels: panels.map(p => p.system),
    glazing: [],
    ceilings: ceilings.map(c => c.system),
    floors: floors.map(f => f.system),
    portals,
    assemblies: { ...BUILT_INS_A.assemblies, ...BUILT_INS_A_EXTRA.assemblies, ...E1_COMPOSITES },
    housings: [...BUILT_INS_A.housings, ...BUILT_INS_A_EXTRA.housings],
    recipes: [remapSlots(once(...panels.map(p => p.recipes), ...ceilings.map(c => c.recipes), ...floors.map(f => f.recipes)), e1SlotRule),
        builtIns, e1BuiltInRecipes, e2LiftRecipes, referenceCasings('e1')],
};
