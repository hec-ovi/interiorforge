import type { FloorKind, InteriorStyle, RoomKind } from '../../core/types.js';
import type { Family } from '../../placements/finish.js';
import { CORPO_VANITY_FIT, CORPO_VANITY_LIGHTS } from './corpo-bathroom.js';
import { LOFT_VANITY_FIT, LOFT_VANITY_LIGHTS } from './loft-bathroom.js';

/** Private residential bathrooms use their photographed fitted assembly.
 * Guest suites and shared washrooms retain their own compact vanity programme. */
export function usesResidentialVanity(family: Family | undefined, room: RoomKind | undefined, programme: FloorKind | string | undefined): boolean {
  return family === 'luxury' && room === 'bathroom'
    && (programme === 'apartment' || programme === 'residence_studio');
}

export const residentialVanityFit = (style?: InteriorStyle) => style === 'apartment-1702' ? LOFT_VANITY_FIT : CORPO_VANITY_FIT;
export const residentialVanityLights = (style?: InteriorStyle) => style === 'apartment-1702' ? LOFT_VANITY_LIGHTS : CORPO_VANITY_LIGHTS;
