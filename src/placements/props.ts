import { findFurnitureAssets } from '../assets/families.js';
import { fitAssetBounds } from '../assets/catalog.js';
import type { FloorInterior } from '../core/types.js';
import type { UvFloorData } from '../layout/plan-floor.js';
import type { PlacementBuilder } from './builder.js';
/** Only catalog furniture can own furniture anchors in a published layout. */
export function props(builder: PlacementBuilder, floor: FloorInterior, uv: UvFloorData): void {
    const retained = new Set<string>();
    for (const item of floor.furniture) {
        if (item.kind === 'wall_art' || item.kind === 'display_screen') {
            builder.module('wall-decoration-frame', item.room, [item.position[0], item.elevation ?? 1.5, item.position[1]], [item.size[0], item.size[2] / .5, 1], item.rotationDeg * Math.PI / 180, { id: item.id });
            continue;
        }
        const asset = findFurnitureAssets(item).filter(a => a.modelUri && a.dimensionsMeters)
            .sort((a, b) => Number(b.availability === 'redistributable') - Number(a.availability === 'redistributable') || a.id.localeCompare(b.id))[0];
        if (!asset)
            continue;
        const fit = fitAssetBounds(asset, item.size)!;
        builder.placements.push({
            id: item.id, prop: asset.id, room: item.room,
            position: [item.position[0], item.elevation ?? 0, item.position[1]],
            rotationY: item.rotationDeg * Math.PI / 180, scale: [fit.scale, fit.scale, fit.scale]
        });
        const [width, depth, height] = fit.dimensions;
        const angle = item.rotationDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const corners: [
            number,
            number
        ][] = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]];
        builder.mesh.addPrism('prop/bounds/check', corners.map(([x, z]) => [item.position[0] + x * c + z * s, item.position[1] + z * c - x * s]), item.elevation ?? 0, (item.elevation ?? 0) + height);
        retained.add(item.id);
    }
    floor.furniture = floor.furniture.filter(item => retained.has(item.id));
    uv.furniture = uv.furniture.filter(item => retained.has(item.id));
}
