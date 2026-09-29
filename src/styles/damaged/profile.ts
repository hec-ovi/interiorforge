import type { RoomFinish } from '../../placements/finish.js';

/** Courtyard homes keep the painted communal hall of William Hare. The denser
 * megablock uses the same generous programme behind a darker service dado; broad
 * mineral fields above and private domestic finishes remain legible and calm. */
export function damagedArchitectureFinish(architecture: string | undefined, base: RoomFinish): RoomFinish {
  if (architecture !== 'residential-megablock') return base;
  if (base.field === 'wall-field-damaged-public') return { ...base, field: 'wall-field-damaged-megablock' };
  // Private apartment evidence comes from the Jig-Jig molded-shell room. Hare,
  // Clouds and No-Tell only supply the communal/service spaces in this profile.
  if (base.field === 'wall-field-damaged') return { ...base, field: 'wall-field-damaged-lodging' };
  return base;
}
