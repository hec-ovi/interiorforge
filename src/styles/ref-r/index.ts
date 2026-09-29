import type { KindExports } from '../systems/types.js';

/** Kind R, rich office (r1): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file. */
export const kind: KindExports = {
    kind: 'R',
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
