import type { LightFixture } from '../../core/types.js';
import type { Frame, UvRect } from '../../layout/uv.js';
import { uvToWorld } from '../../layout/uv.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { FloorSystem, SurfaceRoom } from './types.js';

/** One floor rectangle of a room in a floor system (CF: support slab 2 mm below Y0, tile
 *  blocks phased to the grid or the room, border and inlay, the pit with its lens records).
 *  Stub until package CF lands: the marker slab as one fitted slab. */
export function placeFloorSystem(builder: PlacementBuilder, spec: FloorSystem, room: SurfaceRoom, rect: UvRect, y: number, frame: Frame): LightFixture[] {
    const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
    builder.module(spec.id, room.id, [x, y, z], [rect.lu / .5, 1, rect.lv / .5], -frame.angleDeg * Math.PI / 180);
    return [];
}
