import type { BuildingType, FloorKind, FurnitureKind, RoomKind, Tier } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
export { corporateRecipes } from './recipes.js';
export { furnishCorporate } from './furnish.js';
export { placeCorporateCeiling } from './ceiling.js';
export { dressCorporateWalls } from './walls.js';

export const isCorporate = (type: BuildingType, tier: Tier): boolean =>
  (type === 'corpo' || type === 'offices') && tier !== 'poor';

/** A six-seat boardroom needs room for its real chairs and the double-door approach. */
export const CORPORATE_SERVICE_SIZES: Readonly<Partial<Record<RoomKind, number>>> = { meeting: 6 };

/** Width, depth and height are the planner's metric reservation, not guessed GLB bounds. */
export const CORPORATE_FITS: Partial<Record<FurnitureKind, { module: string; size: [number, number, number] }>> = {
  ornament_wall: { module: 'fit-botanical-display-biotechnica', size: [3,.75,2.7] },
  sofa: { module: 'fit-corporate-bench', size: [2.8,1,.9] },
  reception_desk: { module: 'fit-corporate-security-desk', size: [2.6, .9, 1.1] },
  meeting_table: { module: 'fit-corporate-boardroom-table', size: [2.8, 1.2, .75] },
  shelf: { module: 'fit-corporate-records-cabinet', size: [1.8, .5, 2] },
  counter: { module: 'fit-corporate-credenza', size: [2, .7, .9] },
  wall_art: { module: 'wall-corporate-directory', size: [1.4, .16, .85] },
  wall_shelf: { module: 'wall-corporate-document-shelf', size: [1.2, .28, .4] },
};

export function corporateRoomFit(kind: FurnitureKind, room?: RoomKind): { module: string; size: [number, number, number] } | null {
  if(kind==='desk'&&room==='executive_office')return{module:'fit-corporate-executive-desk',size:[1.6,.8,.75]};
  if(kind==='wall_art'&&['office_private','executive_office','meeting','lounge'].includes(room??''))return{module:'wall-corporate-art',size:[1.4,.16,.85]};
  if(kind==='shelf'&&(room==='office_private'||room==='executive_office'))return{module:'fit-corporate-occupied-library',size:[1.8,.5,2]};
  return kind === 'shelf' && room === 'mechanical_room'
    ? { module: 'fit-service-shelf-luxury', size: [1.8, .5, 2] } : null;
}

/** Corporate is a program and architectural finish, not a residential luxury recolor.
 * Offices remain bright; executive rooms use timber, and the arrival/core uses dark panels. */
export function corporateRoomFinish(room: RoomKind, _floorKind: FloorKind): Omit<RoomFinish, 'family'> & { family: 'corporate' } {
  const executive = room === 'executive_office' || room === 'office_private';
  const publicRoom = ['reception', 'elevator_lobby', 'concourse', 'corridor'].includes(room);
  const wet = ['bathroom', 'toilets', 'locker_room'].includes(room);
  const service = room === 'mechanical_room' || room === 'parking_area';
  return {
    family: 'corporate',
    field: wet ? 'wall-field-slate' : executive || publicRoom ? 'wall-field-corporate-graphite' : 'wall-field-corporate-mineral',
    floor: wet ? 'floor-slab-marble' : service ? 'floor-slab-industrial' : executive ? 'floor-slab-corporate-wood' : publicRoom ? 'floor-slab-meridian-stone' : 'floor-slab-corporate-carpet',
    ceiling: executive ? 'ceiling-field-corporate-timber' : publicRoom ? 'ceiling-field-corporate-public' : 'ceiling-field-corporate-mineral',
    cove: 'ceiling-led-strip', spot: publicRoom ? 'ceiling-spot-corporate-panel' : 'ceiling-spot-cool',
  };
}
