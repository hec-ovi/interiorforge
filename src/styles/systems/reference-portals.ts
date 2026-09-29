import type { RoomKind } from '../../core/types.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { casingRecipes, validatePortal, type CasingLook } from './portal.js';
import { LOOK } from './reference-looks.js';
import type { PortalSpec } from './types.js';

/** Portal specs and casings of the reference interiors. Radii are discrete (a corner never
 *  scales), so each look is its own spec; layers are concentric: a rounded layer's radius is
 *  the previous layer's outer radius.
 *  - E1 suite: a cream rounded surround (R 0.26) with deep jambs, a black jamb slot
 *    0.06 x 1.15 m from 1.1 m and a cyan-lit return, inside a stepped outer surround
 *    (R 0.5); the full outer block (R 0.68) joins for tall rooms (`e1-grand`).
 *  - E2 floor lobby: the rounded double frame in dark lacquer with a bronze reveal.
 *  - R1 office: the layered square doorway, an ink lacquer frame inside a bronze-lined one.
 *  - B2 suite bathroom portal, C1 capsule bathroom portal, C3 guest-room portals. */

const skin = (face: string, reveal: string, ret: string, lens?: string): PortalSpec['skin'] =>
  ({ face, reveal, ret, ...(lens ? { lens } : {}) }) as PortalSpec['skin'];

const HOME: RoomKind[] = ['living', 'studio_main', 'bedroom', 'kitchen', 'dining_area', 'bar', 'lounge', 'corridor', 'storage'];
const PUBLIC: RoomKind[] = ['reception', 'lounge', 'corridor', 'elevator_lobby', 'concourse', 'dining_area', 'bar'];
const OFFICE: RoomKind[] = ['executive_office', 'office_private', 'office_open', 'meeting', 'corridor', 'reception', 'lounge', 'elevator_lobby'];
const CYAN: [number, number, number] = [.08, .78, 1];

export const REFERENCE_PORTALS: PortalSpec[] = [
  {
    id: 'e1-inner', radius: .26, band: .24, depth: [.13, .19],
    slot: { base: 1.1, height: 1.15, width: .06 }, reveal: { lit: true, color: CYAN }, layers: ['e1-outer'],
    rooms: [...HOME, 'reception', 'elevator_lobby'], minWidth: 1.2, minHeight: 2.1,
    skin: skin(LOOK.e1Cream, LOOK.black, LOOK.glowCyan, LOOK.lensCool),
  },
  {
    id: 'e1-outer', radius: .5, band: .18, depth: [.12, .15],
    rooms: [...HOME, 'reception', 'elevator_lobby'], minWidth: 1.2, minHeight: 2.1,
    skin: skin(LOOK.e1Cream, LOOK.black, LOOK.e1Cream),
  },
  {
    id: 'e1-block', radius: .68, band: .3, depth: [.11, .13],
    rooms: [...HOME, ...PUBLIC], minWidth: 1.2, minHeight: 2.1,
    skin: skin(LOOK.e1Cream, LOOK.black, LOOK.e1Cream),
  },
  {
    id: 'e1-grand', radius: .26, band: .24, depth: [.13, .19],
    slot: { base: 1.1, height: 1.15, width: .06 }, reveal: { lit: true, color: CYAN }, layers: ['e1-outer', 'e1-block'],
    rooms: [...HOME, ...PUBLIC], minWidth: 2, minHeight: 2.3,
    skin: skin(LOOK.e1Cream, LOOK.black, LOOK.glowCyan, LOOK.lensCool),
  },
  {
    id: 'e2-lobby', radius: .3, band: .26, depth: [.12, .17],
    slot: { base: 1, height: 1.2, width: .03 }, reveal: { lit: true, color: CYAN }, layers: ['e2-lobby-outer'],
    rooms: PUBLIC, minWidth: 1.6, minHeight: 2.2,
    skin: skin(LOOK.e2Lacquer, LOOK.bronze, LOOK.black, LOOK.lensCool),
  },
  {
    id: 'e2-lobby-outer', radius: .56, band: .14, depth: [.105, .13],
    rooms: PUBLIC, minWidth: 1.6, minHeight: 2.2,
    skin: skin(LOOK.e2Lacquer, LOOK.bronze, LOOK.bronze),
  },
  {
    id: 'r1-layered', radius: 0, band: .1, depth: [.1, .13], layers: ['r1-layered-outer'],
    rooms: OFFICE, minWidth: .8, minHeight: 2,
    skin: skin(LOOK.r1Ink, LOOK.bronze, LOOK.bronze),
  },
  {
    id: 'r1-layered-outer', radius: 0, band: .16, depth: [.105, .12],
    rooms: OFFICE, minWidth: .8, minHeight: 2,
    skin: skin(LOOK.r1Walnut, LOOK.black, LOOK.r1Ink),
  },
  {
    id: 'b2-bath', radius: .12, band: .12, depth: [.1, .12],
    rooms: ['bathroom', 'bedroom', 'living', 'corridor', 'storage'], minWidth: .8, minHeight: 2,
    skin: skin(LOOK.b2Timber, LOOK.black, LOOK.b2Timber),
  },
  {
    id: 'c1-bath', radius: .2, band: .14, depth: [.1, .125],
    rooms: ['bathroom', 'living', 'studio_main', 'bedroom', 'kitchen', 'corridor'], minWidth: .7, minHeight: 1.95,
    skin: skin(LOOK.cEnamel, LOOK.cGunmetal, LOOK.cGunmetal),
  },
  {
    id: 'c3-guest', radius: .1, band: .16, depth: [.11, .14],
    rooms: ['corridor', 'bedroom', 'living', 'studio_main', 'lounge', 'reception'], minWidth: .8, minHeight: 2,
    skin: skin(LOOK.cPetrol, LOOK.black, LOOK.cGunmetal),
  },
];

const BY_ID = new Map(REFERENCE_PORTALS.map(spec => [spec.id, spec]));
export const referencePortal = (id: string): PortalSpec | undefined => BY_ID.get(id);

/** Style casings `door-jamb-<sid>` / `door-header-<sid>` inside the shared envelope. */
export const REFERENCE_CASINGS: Record<string, CasingLook> = {
  e1: { body: LOOK.black, face: LOOK.e1Cream, edge: LOOK.black },
  e2: { body: LOOK.black, face: LOOK.e2Lacquer, edge: LOOK.bronze },
  b3: { body: LOOK.black, face: LOOK.b3Walnut, edge: LOOK.gold },
  r1: { body: LOOK.black, face: LOOK.r1Ink, edge: LOOK.bronze },
  c1: { body: LOOK.cGunmetal, face: LOOK.cEnamel, edge: LOOK.cGunmetal },
  c2: { body: LOOK.cGunmetal, face: LOOK.cPetrol, edge: LOOK.cGunmetal },
};

for (const spec of REFERENCE_PORTALS) validatePortal(spec, referencePortal);

/** The casing modules of the reference styles. Portal modules are not here: the catalog
 *  draws one family per registered spec (`referenceRecipes`), so a kind lists the specs it
 *  uses in `portals` (with their layers) and this set in `recipes`. */
export const referenceCasingRecipes: RecipeSet = add => {
  for (const [sid, look] of Object.entries(REFERENCE_CASINGS)) casingRecipes(sid, look)(add);
};

/** The specs a kind registers: these ids and every layer they name. */
export function portalsWithLayers(...ids: string[]): PortalSpec[] {
  const out: PortalSpec[] = [];
  const visit = (id: string) => {
    const spec = BY_ID.get(id);
    if (!spec) throw new Error(`unknown reference portal ${id}`);
    if (out.includes(spec)) return;
    out.push(spec);
    for (const layer of spec.layers ?? []) visit(layer);
  };
  ids.forEach(visit);
  return out;
}
