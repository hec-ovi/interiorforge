import type { FurnitureKind } from '../../core/types.js';
import type { CapsuleProfile } from './profile.js';

/** Width, depth, height of the authored geometry; these match the planning reservations. */
export const CAPSULE_FURNITURE: Partial<Record<FurnitureKind, { module: string; size: [number, number, number] }>> = {
  sofa: { module: 'fit-capsule-sofa', size: [1.8, 0.85, 0.8] },
  chair: { module: 'fit-capsule-chair', size: [0.45, 0.45, 0.9] },
  low_table: { module: 'fit-capsule-low-table', size: [0.9, 0.5, 0.4] },
  dining_table: { module: 'fit-capsule-table', size: [0.9, 0.9, 0.75] },
  reception_desk: { module: 'fit-capsule-reception', size: [2.6, 0.9, 1.1] },
  kitchen_block: { module: 'fit-capsule-kitchen', size: [2.4, 0.65, 1.05] },
  fridge: { module: 'fit-capsule-fridge', size: [0.7, 0.7, 1.8] },
  bed_double: { module: 'fit-capsule-bed', size: [1.6, 2.1, 0.55] },
  bed_single: { module: 'fit-capsule-bed', size: [1.6, 2.1, 0.55] },
  wardrobe: { module: 'fit-capsule-wardrobe', size: [1.6, 0.65, 2] },
  desk: { module: 'fit-capsule-desk', size: [1.6, 0.8, 0.75] },
  office_chair: { module: 'fit-office-chair', size: [0.65, 0.65, 1.15] },
  bench: { module: 'fit-bench', size: [1.8, 0.4, 0.45] },
  shelf: { module: 'fit-capsule-shelf', size: [1.8, 0.5, 2] },
  wall_shelf: { module: 'wall-shelf-capsule', size: [1.2, 0.28, 0.4] },
  shower: { module: 'fit-capsule-shower', size: [1.3, 1.1, 2.2] },
  sink: { module: 'fit-capsule-basin', size: [0.5, 0.45, 1.05] },
  sleeping_pod: { module: 'fit-capsule-sleeping-niche', size: [2.5, 1.5, 2] },
};

/** Identities share fit interfaces, never a scaled copy of one entire room. */
export function capsuleFurnitureFor(kind: FurnitureKind, profile: CapsuleProfile) {
  const fit = CAPSULE_FURNITURE[kind];
  if (!fit) return undefined;
  if (kind === 'sofa') return { ...fit, module: 'fit-capsule-curved-sofa' };
  if (kind === 'sleeping_pod') return { ...fit, module: `fit-capsule-${profile}-niche` };
  if (kind === 'wardrobe' && profile === 'h10') return { ...fit, module: 'fit-capsule-h10-wardrobe' };
  if (kind === 'kitchen_block' && profile === 'japantown') return { module: 'fit-capsule-japantown-kitchen', size: [2.4, .65, 2.35] as [number, number, number] };
  return fit;
}
