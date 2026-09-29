import type { FloorKind, FurnitureKind, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
export { industrialRecipes } from './modules.js';
export { furnishIndustrial } from './furnish.js';

/** Factory fittings are available without a third-party prop catalog. Dimensions are
 * width, depth, height, matching the planner's reserved furniture footprint. */
export const INDUSTRIAL_FITS: Partial<Record<FurnitureKind, { module: string; size: [number, number, number] }>> = {
  room_divider: { module: 'fit-industrial-ventilation-bank', size: [2.5, .5, 2] },
  ornament_wall: { module: 'fit-industrial-drive-bank', size: [3, .5, 2] },
  shelf: { module: 'fit-industrial-storage-rack', size: [1.8, .5, 2] },
  crate: { module: 'fit-industrial-transit-case', size: [.62, .62, .55] },
  desk: { module: 'fit-industrial-workbench', size: [1.6, .8, .75] },
  counter: { module: 'fit-industrial-tool-counter', size: [2, .7, .9] },
  reception_desk: { module: 'fit-industrial-dispatch-desk', size: [2.6, .9, 1.1] },
  wardrobe: { module: 'fit-industrial-lockers', size: [1.6, .65, 2] },
  wall_shelf: { module: 'wall-shelf-industrial-parts', size: [1.2, .28, .4] },
  wall_art: { module: 'wall-art-industrial-service', size: [.7, .06, 1.05] },
  display_screen: { module: 'wall-screen-industrial-status', size: [1.2, .08, .7] },
  office_chair: { module: 'fit-industrial-task-chair', size: [.65, .65, 1.15] },
  chair: { module: 'fit-industrial-chair', size: [.45, .45, .9] },
  dining_table: { module: 'fit-industrial-table', size: [.9, .9, .75] },
  meeting_table: { module: 'fit-industrial-table', size: [.9, .9, .75] },
};

/** Mineral walls and concrete walking surfaces keep large service halls legible;
 * metal is reserved for fittings and exposed services, rather than every surface. */
export function industrialFinish(room: RoomKind, _floorKind: FloorKind): RoomFinish {
  const wet = ['bathroom', 'toilets', 'locker_room'].includes(room);
  const office = ['office_open', 'office_private', 'meeting', 'executive_office', 'reception'].includes(room);
  return {
    family: 'industrial',
    field: wet ? 'wall-field-slate' : office ? 'wall-field-mineral' : 'wall-field-industrial',
    floor: wet ? 'floor-slab-marble' : 'floor-slab-industrial',
    ceiling: 'ceiling-field-industrial',
    ...(!wet && !office ? { services: 'ceiling-services-industrial' } : {}),
    cove: 'ceiling-led-strip', spot: office ? 'ceiling-spot-cool' : 'ceiling-spot-industrial-batten',
  };
}
