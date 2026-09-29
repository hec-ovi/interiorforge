import type { FloorInterior, Furniture, LightFixture } from '../../core/types.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { KitchenWallSpec } from './types.js';

/** An embedded kitchen wall over the item's reservation (AS: toe, fixed base bays, worktop
 *  with sink and hob cuts, backsplash panels, tiered uppers, bulkhead to the ceiling, one
 *  under-cabinet lens record per straight stretch). Stub until package AS lands: nothing. */
export function placeKitchenWall(_builder: PlacementBuilder, _floor: FloorInterior, _item: Furniture, _spec: KitchenWallSpec,
    _ceilingY: number): LightFixture[] {
    return [];
}
