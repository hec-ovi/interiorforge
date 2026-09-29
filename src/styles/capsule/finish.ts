import type { FloorKind, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';
import type { CapsuleProfile } from './profile.js';

const WET = new Set<RoomKind>(['bathroom', 'toilets', 'locker_room']);
const SERVICE = new Set<RoomKind>(['mechanical_room', 'storage', 'parking_area']);
const PUBLIC = new Set<RoomKind>(['reception', 'elevator_lobby', 'concourse', 'corridor']);

/** The captures separate quiet ivory domestic shells, charcoal public panels and washable
 * warm utility rooms. Panel joints stay in the shared 0.5 m construction system. */
export function capsuleRoomFinish(room: RoomKind, _floorKind: FloorKind): RoomFinish {
  const base: RoomFinish = {
    family: 'capsule', field: 'wall-field-capsule-domestic', floor: 'floor-slab-capsule-hex',
    ceiling: 'ceiling-field-capsule', cove: 'ceiling-cove-steel', spot: 'ceiling-spot',
  };
  if (SERVICE.has(room)) return { ...base, field: 'wall-field-steel', services: 'ceiling-services', spot: 'ceiling-spot-cool' };
  if (WET.has(room)) return { ...base, field: 'wall-field-capsule-utility', floor: 'floor-slab-capsule-wet' };
  if (PUBLIC.has(room)) return {
    ...base, field: 'wall-field-charcoal', band: 'ceiling-band-ivory',
    frame: { corner: 'wall-panel-corner-ivory', rail: 'wall-panel-rail-ivory',
      stile: 'wall-panel-stile-ivory', field: 'wall-panel-field-charcoal', line: 'wall-light-line', kelvin: 3500 },
  };
  return base;
}

/** H10's warm washable wet shell and Japantown's tiled utility recesses are
 * independent from their shared ivory dry-room construction language. */
export function capsuleProfileFinish(profile: CapsuleProfile, room: RoomKind, base: RoomFinish): RoomFinish {
  if (profile === 'h10' || SERVICE.has(room) || PUBLIC.has(room)) return base;
  if (WET.has(room)) return { ...base, field: 'wall-field-capsule-japantown-wet', floor: 'floor-slab-capsule-japantown-wet' };
  if (room === 'kitchen') return { ...base, floor: 'floor-slab-capsule-japantown-wet' };
  return base;
}
