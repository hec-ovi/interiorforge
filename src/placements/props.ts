import { chooseFurnitureAsset, type ModelPresence } from '../assets/families.js';
import { fitAssetBounds } from '../assets/catalog.js';
import type { FloorInterior, FurnitureKind } from '../core/types.js';
import type { UvFloorData } from '../layout/plan-floor.js';
import { clean, litModule, type PlacementBuilder } from './builder.js';
import type { Family } from './finish.js';

type Size = [number, number, number];
interface Fit { module: string; size: Size }

/** Built-in furniture per family: the module authored at its canonical width, depth and
 *  height, scaled per axis to the furniture record. Kinds without one resolve catalog props. */
const LUXURY: Partial<Record<FurnitureKind, Fit>> = {
    sofa: { module: 'fit-sofa', size: [1.8, 0.85, 0.8] }, chair: { module: 'fit-chair', size: [0.45, 0.45, 0.9] },
    stool: { module: 'fit-stool', size: [0.4, 0.4, 0.65] }, bench: { module: 'fit-bench', size: [1.8, 0.4, 0.45] },
    low_table: { module: 'fit-low-table', size: [0.9, 0.5, 0.4] }, dining_table: { module: 'fit-table', size: [0.9, 0.9, 0.75] },
    meeting_table: { module: 'fit-table', size: [0.9, 0.9, 0.75] },
    reception_desk: { module: 'fit-reception-desk', size: [2.6, 0.9, 1.1] }, bar_counter: { module: 'fit-bar-counter', size: [3, 0.65, 1.1] },
    counter: { module: 'fit-bar-counter', size: [3, 0.65, 1.1] }, kitchen_block: { module: 'fit-kitchen-run', size: [2.4, 0.65, 1.05] },
    bed_double: { module: 'fit-bed', size: [1.6, 2.1, 0.55] }, bed_single: { module: 'fit-bed', size: [1.6, 2.1, 0.55] },
    wardrobe: { module: 'fit-wardrobe', size: [1.6, 0.65, 2] }, shower: { module: 'fit-shower', size: [0.9, 0.9, 2] },
    toilet: { module: 'fit-toilet', size: [0.4, 0.65, 0.75] },
    sink: { module: 'fit-basin', size: [0.5, 0.45, 0.85] }, plant: { module: 'fit-planter', size: [0.5, 0.5, 1.3] },
    room_divider: { module: 'fit-planted-screen', size: [2.5, 0.5, 2] }, ornament_wall: { module: 'fit-aquarium-wall', size: [3, 0.5, 2] },
    display_screen: { module: 'wall-screen', size: [1.2, 0.08, 0.7] }, wall_art: { module: 'wall-art', size: [0.7, 0.06, 1.05] },
    shelf: { module: 'fit-shelf', size: [1.8, 0.5, 2] }, wall_shelf: { module: 'wall-shelf', size: [1.2, 0.28, 0.4] },
    desk: { module: 'fit-desk', size: [1.6, 0.8, 0.75] }, office_chair: { module: 'fit-office-chair', size: [0.65, 0.65, 1.15] },
};
const CAPSULE: Partial<Record<FurnitureKind, Fit>> = {
    toilet: LUXURY.toilet!, sink: { module: 'fit-basin-steel', size: [0.5, 0.45, 0.85] },
    sleeping_pod: { module: 'fit-capsule-pod', size: [2.5, 1.5, 2] }, stool: LUXURY.stool!, bench: LUXURY.bench!,
    plant: LUXURY.plant!, shelf: LUXURY.shelf!, display_screen: LUXURY.display_screen!, wall_art: LUXURY.wall_art!,
};
const DAMAGED: Partial<Record<FurnitureKind, Fit>> = {
    toilet: LUXURY.toilet!, sink: { module: 'fit-basin-worn', size: [0.5, 0.45, 0.85] },
    crate: { module: 'fit-crate', size: [0.62, 0.62, 0.55] }, display_screen: LUXURY.display_screen!, wall_art: LUXURY.wall_art!,
};
const BUILT_IN: Record<Family, Partial<Record<FurnitureKind, Fit>>> = {
    luxury: LUXURY, capsule: CAPSULE, damaged: DAMAGED, industrial: { ...DAMAGED, sink: CAPSULE.sink!, shelf: LUXURY.shelf!, bench: LUXURY.bench! },
};
/** A family's own bed and wardrobe, for a record no present catalog model fills. */
const fitted = (look: string): Partial<Record<FurnitureKind, Fit>> => ({
    bed_double: { module: `fit-bed-${look}`, size: LUXURY.bed_double!.size }, bed_single: { module: `fit-bed-${look}`, size: LUXURY.bed_single!.size },
    wardrobe: { module: `fit-wardrobe-${look}`, size: LUXURY.wardrobe!.size },
});
const FALLBACK: Record<Family, Partial<Record<FurnitureKind, Fit>>> = {
    luxury: {}, capsule: fitted('capsule'), damaged: fitted('worn'), industrial: fitted('worn'),
};

/** Built-in modules and catalog props both own furniture anchors; furniture that fits
 *  neither, or whose fitting models are all absent here, leaves the published layout. Only a
 *  piece standing as a lit module keeps the light records of its lenses. */
export function props(builder: PlacementBuilder, floor: FloorInterior, uv: UvFloorData, family: Family, models: ModelPresence): void {
    const retained = new Set<string>(), lit = new Set<string>();
    const table = BUILT_IN[family];
    for (const item of floor.furniture) {
        const position: [number, number, number] = [item.position[0], item.elevation ?? 0, item.position[1]];
        const asset = table[item.kind] ? null : chooseFurnitureAsset(item, models);
        const fit = asset ? undefined : table[item.kind] ?? FALLBACK[family][item.kind];
        if (fit) {
            builder.module(fit.module, item.room, position,
                [item.size[0] / fit.size[0], item.size[2] / fit.size[2], item.size[1] / fit.size[1]], item.rotationDeg * Math.PI / 180, { id: item.id });
            retained.add(item.id);
            if (litModule(fit.module)) lit.add(item.id);
            continue;
        }
        if (!asset)
            continue;
        const dims = fitAssetBounds(asset, item.size)!;
        // The model turns to face +z first, then with the piece.
        builder.placements.push({
            id: item.id, prop: asset.id, room: item.room, position,
            rotationY: clean((item.rotationDeg + (asset.frontYawDeg ?? 0)) % 360 * Math.PI / 180), scale: [dims.scale, dims.scale, dims.scale]
        });
        const [width, depth, height] = dims.dimensions;
        const angle = item.rotationDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const corners: [number, number][] = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]];
        builder.mesh.addPrism('prop/bounds/check', corners.map(([x, z]) => [item.position[0] + x * c + z * s, item.position[1] + z * c - x * s]), item.elevation ?? 0, (item.elevation ?? 0) + height);
        retained.add(item.id);
    }
    floor.furniture = floor.furniture.filter(item => retained.has(item.id));
    uv.furniture = uv.furniture.filter(item => retained.has(item.id));
    floor.lights = floor.lights.filter(light => !light.furniture || lit.has(light.furniture));
}
