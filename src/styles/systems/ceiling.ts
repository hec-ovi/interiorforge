import type { LightFixture } from '../../core/types.js';
import type { Frame, UvRect } from '../../layout/uv.js';
import { uvToWorld } from '../../layout/uv.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { CeilingSystem, SurfaceRoom } from './types.js';

/** One ceiling rectangle of a room in a ceiling system (CF: backing, grid blocks phased to
 *  the grid or the room centre, perimeter reveal along the room's real walls, coffers,
 *  steps, luminous fields; `planned` spot records may move to cell centres). `y` is the
 *  room's own ceiling (storey ceiling minus ceilingDrop). Returns lens records.
 *  Stub until package CF lands: the marker ceiling as one fitted field. */
export function placeCeilingSystem(builder: PlacementBuilder, spec: CeilingSystem, room: SurfaceRoom, rect: UvRect, y: number, frame: Frame,
    _planned: LightFixture[]): LightFixture[] {
    const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
    builder.module(spec.id, room.id, [x, y, z], [rect.lu / .5, 1, rect.lv / .5], -frame.angleDeg * Math.PI / 180);
    return [];
}
