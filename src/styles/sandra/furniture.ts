import type { FurnitureKind } from '../../core/types.js';

export interface SandraFit { module: string; size: [number, number, number] }
export const SANDRA_FURNITURE: Partial<Record<FurnitureKind, SandraFit>> = {
  sofa: { module: 'fit-sandra-sofa', size: [1.8, 0.85, 0.8] },
  chair: { module: 'fit-sandra-chair', size: [0.45, 0.45, 0.9] },
  low_table: { module: 'fit-sandra-low-table', size: [0.9, 0.5, 0.4] },
  bed_double: { module: 'fit-sandra-bed', size: [1.6, 2.1, 0.55] },
  bed_single: { module: 'fit-sandra-bed-single', size: [1, 2.05, 0.55] },
  wardrobe: { module: 'fit-sandra-wardrobe', size: [1.6, 0.65, 2] },
  shelf: { module: 'fit-sandra-bookcase', size: [1.8, 0.5, 2] },
  room_divider: { module: 'fit-sandra-lattice-screen', size: [2.5, 0.5, 2] },
  ornament_wall: { module: 'fit-sandra-bamboo-case', size: [3, 0.5, 2] },
  desk: { module: 'fit-sandra-writing-desk', size: [1.6, 0.8, 0.75] },
  reception_desk: { module: 'fit-sandra-reception', size: [2.6, 0.9, 1.1] },
  wall_art: { module: 'wall-art-sandra-lattice', size: [0.7, 0.06, 1.05] },
};

/** Undefined preserves the existing functional kitchen and sanitary module resolver. */
export function sandraFurnitureFor(kind: FurnitureKind): SandraFit | undefined {
  return SANDRA_FURNITURE[kind];
}
