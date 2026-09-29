import type { FurnitureKind } from '../../core/types.js';

/** Canonical widths, depths and placement heights in metres. Beds use mattress height;
 * the headboard is deliberately above it, as in the existing furniture contract. */
export const LUXURY_REFERENCE_FITS: Partial<Record<FurnitureKind, { module: string; size: [number, number, number] }>> = {
  sink: { module: 'fit-basin-luxury', size: [1.4, .58, .88] },
  shower: { module: 'fit-shower-luxury', size: [1.3, 1.1, 2.2] },
  toilet: { module: 'fit-toilet-luxury', size: [.4, .72, .8] },
  sofa: { module: 'fit-sofa-luxury', size: [2.8, 1, 0.9] },
  chair: { module: 'fit-chair-luxury', size: [0.75, 0.8, 0.9] },
  low_table: { module: 'fit-low-table-luxury', size: [1.6, 0.9, 0.4] },
  reception_desk: { module: 'fit-reception-desk-luxury', size: [3.8, 1.0, 1.1] },
  bar_counter: { module: 'fit-bar-counter-luxury', size: [3, 0.9, 1.1] },
  wardrobe: { module: 'fit-wardrobe-corpo', size: [1.6,.65,2] },
  fridge: { module: 'fit-fridge-corpo', size: [.7, .7, 1.8] },
  kitchen_block: { module: 'fit-kitchen-run-luxury', size: [2.4, 0.75, 1.17] },
  bed_double: { module: 'fit-bed-luxury', size: [2, 2.3, 0.6] },
};

/** Exact diffuser centres for this kit; consumed before room illumination balancing. */
export const LUXURY_REFERENCE_LIGHTS: Partial<Record<FurnitureKind, {
  size: [number, number, number];
  lenses: { at: [number, number, number]; length: number; lumens: number; up?: boolean }[];
}>> = {
  sink: { size: [1.4, .58, .88], lenses: [
    { at: [-.665, 1.495, -.242], length: .79, lumens: 150 },
    { at: [.665, 1.495, -.242], length: .79, lumens: 150 },
  ] },
  reception_desk: { size: [3.8, 1.0, 1.1], lenses: [{ at: [.48, .112, .480], length: 2.52, lumens: 180 }] },
  room_divider: { size: [3,.55,2.7], lenses: [{at:[0,.620,0],length:2.7,lumens:240,up:true}] },
  ornament_wall: { size: [3,.75,2.7], lenses: [{at:[0,2.64,0],length:2.721,lumens:400},{at:[0,.625,0],length:2.721,lumens:180,up:true}] },
  bar_counter: { size: [3, 0.9, 1.1], lenses: [{ at: [0, 0.139, 0.423], length: 2.1, lumens: 130 }] },
  bed_double: { size: [2, 2.3, 0.6], lenses: [
    { at: [0, .122, 1.150], length: 1.96, lumens: 110 },
  ] },
};
