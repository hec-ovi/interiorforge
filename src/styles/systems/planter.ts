import type { FloorInterior, Furniture, LightFixture } from '../../core/types.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { PlanterSpec } from './types.js';

/** A planter trough over the item's reservation (AS: ends, body, soil, planted 1 m bays).
 *  Stub until package AS lands: nothing. */
export function placePlanter(_builder: PlacementBuilder, _floor: FloorInterior, _item: Furniture, _spec: PlanterSpec,
    _ceilingY: number): LightFixture[] {
    return [];
}
