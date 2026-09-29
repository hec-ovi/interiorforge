import type { FloorKind, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';

const WET = new Set<RoomKind>(['bathroom', 'toilets', 'locker_room']);
const UTILITY = new Set<RoomKind>(['storage', 'mechanical_room', 'parking_area']);

/** Woven mat circulation and pale fields meet dark timber rather than capsule shells.
 * Lattice depth belongs to fitted screens, never an opaque layer over a facade opening. */
export function sandraRoomFinish(room: RoomKind, _floorKind: FloorKind, base?: RoomFinish): RoomFinish {
  if (UTILITY.has(room)) return base ?? {
    family: 'capsule', field: 'wall-field-steel', floor: 'floor-slab-steel', ceiling: 'ceiling-field-steel',
    services: 'ceiling-services', cove: 'ceiling-led-strip', spot: 'ceiling-spot-cool',
  };
  const wet = WET.has(room);
  return { family: base?.family ?? 'capsule', field: wet ? 'wall-field-sandra-wet' : 'wall-field-sandra-plaster',
    floor: wet ? 'floor-slab-marble' : room === 'kitchen' ? 'floor-slab-stone' : 'floor-slab-sandra-mat',
    ceiling: 'ceiling-field-light', band: 'ceiling-band-timber', cove: 'ceiling-cove-timber', spot: 'ceiling-spot',
  };
}
