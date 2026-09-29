import type { KindExports } from '../systems/types.js';

/** Kind B, rich glass building with its two-floor loft (b1, b2, b3, b4): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file. */
export const kind: KindExports = {
    kind: 'B',
    styles: [],
    panels: [],
    glazing: [],
    ceilings: [],
    floors: [],
    portals: [],
    assemblies: {},
    housings: [],
    recipes: [],
};
