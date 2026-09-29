import type { RoomKind } from '../../core/types.js';
import type { StyleSpec } from '../systems/types.js';
import { R1_PANEL } from './systems.js';

/** The rich office (r1): every room of a kind R building wears it over the corporate family.
 *  The executive and private offices and the public rooms take the graphite panel walls with
 *  bronze inlays and the red floor line; the open office, meeting rooms, services and wet
 *  rooms keep the corporate family's mineral, slate and service finishes. */

/** Rooms the corporate family lines in dark graphite: they take the r1 panel system. */
const GRAPHITE = 'wall-field-corporate-graphite';

export const R1_STYLE: StyleSpec = {
    id: 'r1', kind: 'R', tier: 'rich',
    finish(_room: RoomKind, _floorKind, base) {
        return {
            ...base,
            field: base.field === GRAPHITE ? R1_PANEL.system.id : base.field,
            casing: 'r1',
        };
    },
};
