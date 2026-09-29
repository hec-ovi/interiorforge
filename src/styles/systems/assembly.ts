import type { FloorInterior, Furniture, LightFixture } from '../../core/types.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { placeKitchenWall } from './kitchen-wall.js';
import { placePlanter } from './planter.js';
import { placeRun } from './run.js';
import type { AssemblySpec } from './types.js';

/** One built-in furniture record as its assembly, in the item's local frame (x across, +z
 *  front, origin at the record centre). Returns the light records of its lenses, each
 *  carrying `furniture: item.id`. */
export function placeAssembly(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, spec: AssemblySpec, ceilingY: number): LightFixture[] {
    switch (spec.type) {
        case 'kitchen': return placeKitchenWall(builder, floor, item, spec.spec, ceilingY);
        case 'planter': return placePlanter(builder, floor, item, spec.spec, ceilingY);
        case 'custom': return spec.place(builder, floor, item, ceilingY);
        case 'run':
            placeRun(builder, item.room, [item.position[0], item.elevation ?? 0, item.position[1]], item.rotationDeg * Math.PI / 180, item.size[0], spec.spec);
            return [];
    }
}
