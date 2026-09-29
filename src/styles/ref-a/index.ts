import type { KindExports } from '../systems/types.js';

/** Kind A, high-tech luxury tower (e1, e2, e5, e6): its styles, systems and modules.
 *  Must not import `placements/builder.ts` at runtime: the module catalog loads this file. */
export const kind: KindExports = {
    kind: 'A',
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
