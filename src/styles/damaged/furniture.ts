import type { FurnitureKind, RoomKind } from '../../core/types.js';

/** Width/depth/height are the planner's reservations, never a visually guessed scale. */
export const DAMAGED_FURNITURE: Partial<Record<FurnitureKind, { module: string; size: [number, number, number] }>> = {
  bed_double: { module: 'fit-damaged-bed', size: [1.6, 2.1, .55] },
  bed_single: { module: 'fit-damaged-bed-single', size: [1, 2.1, .55] },
  wardrobe: { module: 'fit-damaged-wardrobe', size: [1.6, .65, 2] },
  sofa: { module: 'fit-damaged-sofa', size: [1.8, .85, .8] },
  bench: { module: 'fit-bench', size: [1.8, .4, .45] },
  low_table: { module: 'fit-damaged-low-table', size: [.9, .5, .4] },
  dining_table: { module: 'fit-damaged-table', size: [.9, .9, .75] },
  meeting_table: { module: 'fit-damaged-meeting-table', size: [2.8, 1.2, .75] },
  chair: { module: 'fit-damaged-chair', size: [.45, .45, .9] },
  office_chair: { module: 'fit-damaged-office-chair', size: [.65, .65, 1.15] },
  stool: { module: 'fit-stool', size: [.4, .4, .65] },
  kitchen_block: { module: 'fit-damaged-kitchen', size: [2.4, .65, 1.05] },
  fridge: { module: 'fit-damaged-fridge', size: [.7, .7, 1.8] },
  reception_desk: { module: 'fit-damaged-caretaker-desk', size: [2.6, .9, 1.1] },
  desk: { module: 'fit-damaged-desk', size: [1.6, .8, .75] },
  counter: { module: 'fit-damaged-counter', size: [2, .7, .9] },
  bar_counter: { module: 'fit-damaged-counter', size: [2, .7, .9] },
  shelf: { module: 'fit-damaged-shelf', size: [1.8, .5, 2] },
  wall_shelf: { module: 'wall-shelf-damaged', size: [1.2, .28, .4] },
  wall_art: { module: 'wall-art-damaged-noticeboard', size: [.7, .06, 1.05] },
  display_screen: { module: 'wall-screen-damaged', size: [1.2, .08, .7] },
  ornament_wall: { module: 'fit-damaged-storage-wall', size: [3, .5, 2] },
  room_divider: { module: 'fit-damaged-community-shelf', size: [2.5, .5, 2] },
  sink: { module: 'fit-basin-damaged', size: [.5, .45, .85] },
  shower: { module: 'fit-shower-damaged', size: [.9, .9, 2] },
};

/** A residential mailbox belongs at the shared entrance, never inside a private home. */
export function damagedFurnitureFor(kind: FurnitureKind, room?: RoomKind) {
  if (kind === 'ornament_wall' && ['reception', 'concourse', 'elevator_lobby'].includes(room ?? ''))
    return { module: 'fit-damaged-mail-bank', size: [3, .5, 2] as [number, number, number] };
  return DAMAGED_FURNITURE[kind];
}
