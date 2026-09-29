import type { FloorKind, RoomKind } from '../../core/types.js';
import type { RoomFinish } from '../../placements/finish.js';

/** Shared-space paint is washable up to shoulder height; bedrooms keep mineral plaster.
 * The original captures show maintained wet areas alongside worn public circulation. */
export function damagedRoomFinish(room: RoomKind, _floorKind: FloorKind): RoomFinish {
  const wet = ['bathroom', 'toilets', 'locker_room'].includes(room);
  const publicRoom = ['corridor', 'elevator_lobby', 'reception', 'lounge', 'concourse', 'mechanical_room'].includes(room);
  return {
    family: 'damaged',
    field: wet ? 'wall-field-damaged-wet' : publicRoom ? 'wall-field-damaged-public' : 'wall-field-damaged',
    floor: wet ? 'floor-slab-damaged-wet' : 'floor-slab-damaged',
    ceiling: 'ceiling-field-damaged',
    cove: 'ceiling-led-strip', spot: 'ceiling-spot-cool',
  };
}
