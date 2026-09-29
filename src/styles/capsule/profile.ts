import type { FurnitureKind, InteriorRequest } from '../../core/types.js';

export type CapsuleProfile = 'h10' | 'japantown';

/** Architecture supplies a stable default; an explicit interior identity survives
 * seed changes and can be paired with any compatible exterior shell. */
export function capsuleProfile(request: Pick<InteriorRequest, 'building' | 'blueprint'>): CapsuleProfile {
  const selected = (request.building as InteriorRequest['building'] & { interiorStyle?: string }).interiorStyle;
  if (selected === 'h10' || selected === 'japantown') return selected;
  const architecture = (request.blueprint.assembly as { architecture?: string } | undefined)?.architecture;
  return architecture === 'white-grid' || architecture === 'mirror-shutters' ? 'japantown' : 'h10';
}

/** Complete fixture reservation, including tap: basin rim remains at 0.85 m. */
export const CAPSULE_SIZES: Partial<Record<FurnitureKind, [number, number, number]>> = {
  sink: [0.5, 0.45, 1.05],
  shower: [1.3, 1.1, 2.2],
};

/** Complete height differs from the counter while its floor fit stays compatible. */
export const CAPSULE_PROFILE_SIZES: Record<CapsuleProfile, Partial<Record<FurnitureKind, [number, number, number]>>> = {
  h10: {}, japantown: { kitchen_block: [2.4, .65, 2.35] },
};

export const CAPSULE_PROFILE_LIGHTS = {
  japantown: { kitchen_block: { size: [2.4, .65, 2.35] as [number, number, number],
    lenses: [{ at: [0, 2.076, .11] as [number, number, number], length: 1.70, lumens: 260 }] } },
};
