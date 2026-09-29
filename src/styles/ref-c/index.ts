import type { KindExports } from '../systems/types.js';

/** Kind C, poor building of capsule homes (c1 to c7): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file. */
export const kind: KindExports = {
    kind: 'C',
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
