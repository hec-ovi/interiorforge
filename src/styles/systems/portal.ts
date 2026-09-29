import type { LightFixture, RoomKind } from '../../core/types.js';
import type { Frame } from '../../layout/uv.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { PortalSpec } from './types.js';

/** A wall opening as the portal systems see it: centre along the line, width, sill, head. */
export interface PortalHole { at: number; width: number; y0: number; y1: number }
/** A room face beside the opening. */
export interface PortalPeer { room: string; kind: RoomKind }

/** The jamb, slot, corner and header modules of one portal spec (PT).
 *  Stub until package PT lands: draws nothing. */
export function portalRecipes(_spec: PortalSpec): RecipeSet {
    return () => {};
}

/** The wall cut a portal needs around its opening: widened by both bands of every layer and
 *  raised by the radius and band. `layers` are the spec's outer layers, resolved. */
export function portalCut(spec: PortalSpec, layers: readonly PortalSpec[], hole: PortalHole): PortalHole {
    const band = spec.band + layers.reduce((sum, layer) => sum + layer.band, 0);
    return { ...hole, width: hole.width + 2 * band, y1: hole.y1 + spec.radius + band };
}

/** Whether this spec may frame the opening: room kinds, minimum size, headroom (h + r + band
 *  + 0.01 within the face height) and one style on both sides (PT).
 *  Stub until package PT lands: never, so openings keep their casings. */
export function portalEligible(_spec: PortalSpec, _peers: readonly PortalPeer[], _hole: PortalHole, _height: number): boolean {
    return false;
}

/** Places the portal pieces per side and the header `door-header-<pid>`; returns the lens
 *  records of a lit reveal (PT). Stub until package PT lands: nothing. */
export function placePortal(_builder: PlacementBuilder, _spec: PortalSpec, _room: string, _axis: 'H' | 'V', _c: number, _at: number,
    _width: number, _height: number, _frame: Frame): LightFixture[] {
    return [];
}
