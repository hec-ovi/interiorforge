import type { LightFixture, LevelZone } from '../../core/types.js';
import type { Frame, UvRect } from '../../layout/uv.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { SurfaceRoom } from './types.js';

/** The parts of a floor rectangle outside every level zone (uv polygons), which keep the
 *  room's own floor (L). Stub until package L lands: the whole rectangle. */
export function levelFloorRects(rect: UvRect, _zones: readonly LevelZone[]): UvRect[] {
    return [rect];
}

/** Platforms, sunken trays, treads, nosings and guards of the room's level zones inside one
 *  floor rectangle, in style `sid` (`floor-slab-<sid>-platform|tread`, `trim-<sid>-nosing`).
 *  Stub until package L lands: nothing. */
export function placeLevels(_builder: PlacementBuilder, _sid: string, _room: SurfaceRoom, _rect: UvRect, _frame: Frame): LightFixture[] {
    return [];
}
