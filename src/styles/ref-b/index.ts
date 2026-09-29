import type { KindExports } from '../systems/types.js';
import { BUILT_INS_B } from '../systems/reference-assemblies.js';
import { levelRecipes } from '../systems/levels.js';
import { b1 } from './b1.js';
import { b2 } from './b2.js';
import { b3 } from './b3.js';
import { B_LOOK } from './looks.js';

/** Kind B, rich glass building with its two-floor loft (b1, b2, b3, b4): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file.
 *  The loft (b4) keeps the 1702 loft finish its duplex rooms already wear, so it registers
 *  no style of its own. The shared level look (`ref`) is drawn here once, for every kind
 *  whose style has not registered its own. */
export const kind: KindExports = {
    kind: 'B',
    styles: [...b1.styles, ...b2.styles, ...b3.styles],
    panels: [...b1.panels, ...b2.panels, ...b3.panels],
    glazing: [...b2.glazing],
    ceilings: [...b1.ceilings, ...b2.ceilings, ...b3.ceilings],
    floors: [...b1.floors, ...b2.floors, ...b3.floors],
    portals: [...b2.portals],
    assemblies: { ...BUILT_INS_B.assemblies },
    housings: [...BUILT_INS_B.housings],
    recipes: [...b1.recipes, ...b2.recipes, ...b3.recipes, ...BUILT_INS_B.recipes,
        levelRecipes('ref', { top: B_LOOK.stone, riser: B_LOOK.stone, nosing: B_LOOK.bronze, guard: { glass: B_LOOK.glass, cap: B_LOOK.bronze } })],
};
