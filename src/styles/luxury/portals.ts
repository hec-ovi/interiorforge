import type { RecipeSet } from '../../modules/recipes.js';
import { FINISH as F } from '../../modules/finishes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { Frame } from '../../layout/uv.js';
import { placePortal, portalRecipes } from '../systems/portal.js';
import type { PortalSpec } from '../systems/types.js';
import { MERIDIAN_IVORY } from './surfaces.js';

/** Biotechnica 62652/63022/63027: broad formed casing, rounded returns,
 * separate recessed outer plate and real vertical service slots. Corners never stretch.
 * The public portal is the `luxury-public` PortalSpec of the portal system; its module ids
 * (`wall-portal-luxury-*`, `door-header-luxury-public`) are the published ones. */
export const PUBLIC_PORTAL = { radius: .24, band: .30, slotHeight: 1.2, slotBase: .65 } as const;

export const LUXURY_PUBLIC_PORTAL: PortalSpec = {
  id: 'luxury-public', radius: PUBLIC_PORTAL.radius, band: PUBLIC_PORTAL.band, depth: [.114, .17],
  // The recess runs 0.12 m inside the 1.2 m slot piece at both ends.
  slot: { base: PUBLIC_PORTAL.slotBase + .12, height: PUBLIC_PORTAL.slotHeight - .24, width: .024 },
  rooms: ['reception', 'lounge', 'corridor', 'elevator_lobby', 'concourse', 'dining_area', 'bar', 'living', 'studio_main'],
  minWidth: 1.2, minHeight: 1.9,
  skin: { face: MERIDIAN_IVORY, reveal: F.black, ret: F.black },
};

export const luxuryPortalRecipes: RecipeSet = portalRecipes(LUXURY_PUBLIC_PORTAL);

/** Minimum rectangular passage remains empty; upper arcs rise above its height. */
export function placeLuxuryPortal(builder: PlacementBuilder, room: string, axis: 'H' | 'V', c: number, at: number,
  width: number, height: number, frame: Frame): void {
  placePortal(builder, LUXURY_PUBLIC_PORTAL, room, axis, c, at, width, height, frame);
}
