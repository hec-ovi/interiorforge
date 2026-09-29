import { chooseFurnitureAsset, type ModelPresence } from '../assets/families.js';
import { fitAssetBounds } from '../assets/catalog.js';
import type { FloorInterior, FurnitureKind, InteriorRequest } from '../core/types.js';
import type { UvFloorData } from '../layout/plan-floor.js';
import { clean, litModule, placementRecipe, type PlacementBuilder } from './builder.js';
import { ASSEMBLIES, styleOf } from '../styles/reference/registry.js';
import { placeAssembly } from '../styles/systems/assembly.js';
import type { Family } from './finish.js';
import { CAPSULE_FURNITURE, capsuleFurnitureFor } from '../styles/capsule/furniture.js';
import { capsuleProfile } from '../styles/capsule/profile.js';
import { sandraFurnitureFor } from '../styles/sandra/furniture.js';
import { DAMAGED_FURNITURE, damagedFurnitureFor } from '../styles/damaged/furniture.js';
import { INDUSTRIAL_FITS } from '../styles/industrial/index.js';
import { CORPORATE_FITS, corporateRoomFit } from '../styles/corporate/index.js';
import { LUXURY_SHOWER_PARTS } from '../styles/luxury/bathroom.js';
import { DAMAGED_SHOWER_PARTS } from '../styles/damaged/bathroom.js';
import { CAPSULE_SHOWER_PARTS } from '../styles/capsule/shower.js';
import { luxuryCatalogAsset, luxuryRoomFit, placeLuxuryPlants } from '../styles/luxury/catalog-fits.js';
import { LUXURY_REFERENCE_FITS } from '../styles/luxury/profile.js';
import { CORPO_BATH_DIVIDER_FIT } from '../styles/luxury/corpo-bathroom.js';
import { usesResidentialVanity, residentialVanityFit } from '../styles/luxury/vanity-policy.js';
import { luxuryDiningFit } from '../styles/luxury/dining.js';

type Size = [number, number, number];
interface Fit { module: string; size: Size }

/** Composite shower models are catalog previews. Their bounded parts own actual collision. */
const SHOWER_PARTS: Readonly<Record<string, readonly string[]>> = {
    'fit-shower-luxury': LUXURY_SHOWER_PARTS,
    'fit-shower-damaged': DAMAGED_SHOWER_PARTS,
    'fit-capsule-shower': CAPSULE_SHOWER_PARTS,
};

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
    corporate: { ...LUXURY, ...LUXURY_REFERENCE_FITS, ...CORPORATE_FITS },
    luxury: { ...LUXURY, ...LUXURY_REFERENCE_FITS }, capsule: { ...CAPSULE, ...CAPSULE_FURNITURE },
    damaged: { ...DAMAGED, ...DAMAGED_FURNITURE },
    industrial: { ...DAMAGED, sink: CAPSULE.sink!, shelf: LUXURY.shelf!, bench: LUXURY.bench!, ...INDUSTRIAL_FITS },
};
/** A family's own bed and wardrobe, for a record no present catalog model fills. */
const fitted = (look: string): Partial<Record<FurnitureKind, Fit>> => ({
    bed_double: { module: `fit-bed-${look}`, size: LUXURY.bed_double!.size }, bed_single: { module: `fit-bed-${look}`, size: LUXURY.bed_single!.size },
    wardrobe: { module: `fit-wardrobe-${look}`, size: LUXURY.wardrobe!.size },
});
const FALLBACK: Record<Family, Partial<Record<FurnitureKind, Fit>>> = {
    luxury: {}, corporate: {}, capsule: fitted('capsule'), damaged: fitted('worn'), industrial: fitted('worn'),
};

/** Built-in modules and catalog props both own furniture anchors; furniture that fits
 *  neither, or whose fitting models are all absent here, leaves the published layout. Only a
 *  piece standing as a lit module keeps the light records of its lenses. A piece naming a
 *  registered assembly (`asm-*`) is built as that assembly, which publishes its own lens
 *  records; one naming a module (`fit-*`), or fitted by its room's reference style, stands as
 *  that module at its canonical size. */
export function props(builder: PlacementBuilder, floor: FloorInterior, uv: UvFloorData, family: Family, models: ModelPresence, request?: InteriorRequest): void {
    const retained = new Set<string>(), lit = new Set<string>();
    const table = BUILT_IN[family];
    const roomKinds = new Map(uv.rooms.map(room => [room.id, room.kind]));
    // A caller may hand only the furniture and lights; such a floor has no styled rooms.
    const rooms = new Map((floor.rooms ?? []).map(room => [room.id, room]));
    const ceilingY = floor.ceilingElevation - floor.elevation;
    for (const item of floor.furniture) {
        const position: [number, number, number] = [item.position[0], item.elevation ?? 0, item.position[1]];
        const assembly = item.fit?.startsWith('asm-') ? ASSEMBLIES.get(item.fit) : undefined;
        if (assembly) {
            // The assembly's lenses replace whatever the plan lit for the reservation.
            const records = placeAssembly(builder, floor, item, assembly, ceilingY);
            floor.lights = [...floor.lights.filter(light => light.furniture !== item.id), ...records.map(light => ({ ...light, furniture: item.id }))];
            retained.add(item.id); lit.add(item.id);
            continue;
        }
        const room = rooms.get(item.room);
        const styleFit = item.fit?.startsWith('fit-') ? item.fit : room ? styleOf(room)?.fit?.(item, room) ?? undefined : undefined;
        // A style may stand a generic record as one of its assemblies (E6's kitchen wall).
        const styleAssembly = styleFit?.startsWith('asm-') ? ASSEMBLIES.get(styleFit) : undefined;
        if (styleAssembly) {
            const records = placeAssembly(builder, floor, item, styleAssembly, ceilingY);
            floor.lights = [...floor.lights.filter(light => light.furniture !== item.id), ...records.map(light => ({ ...light, furniture: item.id }))];
            retained.add(item.id); lit.add(item.id);
            continue;
        }
        if (styleFit && placementRecipe(styleFit)) {
            builder.module(styleFit, item.room, position, [1, 1, 1], item.rotationDeg * Math.PI / 180, { id: item.id });
            retained.add(item.id);
            if (litModule(styleFit)) lit.add(item.id);
            continue;
        }
        const bathScreen = item.kind === 'room_divider' && usesResidentialVanity(family, roomKinds.get(item.room), floor.kind);
        if (!bathScreen && (family === 'luxury' || family === 'corporate') && placeLuxuryPlants(builder, item, models)) {
            retained.add(item.id); lit.add(item.id); continue;
        }
        const corporateExecutiveDesk = family === 'corporate' && item.kind === 'desk' && roomKinds.get(item.room) === 'executive_office';
        const preferredAsset = !corporateExecutiveDesk && (family === 'luxury' || family === 'corporate') ? luxuryCatalogAsset(item, models) : null;
        const diningFit = family === 'luxury' && item.kind === 'dining_table'
            && ['apartment', 'residence_studio'].includes(floor.kind)
            && ['living', 'studio_main', 'kitchen'].includes(roomKinds.get(item.room) ?? '') ? luxuryDiningFit(item.size) : null;
        const roomFit = diningFit ?? (bathScreen ? CORPO_BATH_DIVIDER_FIT
            : item.kind === 'sink' && usesResidentialVanity(family, roomKinds.get(item.room), floor.kind) ? residentialVanityFit(request?.building.interiorStyle)
            : family === 'luxury' ? luxuryRoomFit(item.kind, roomKinds.get(item.room), item.size)
            : family === 'corporate' ? corporateRoomFit(item.kind, roomKinds.get(item.room))
            : family === 'capsule' && request ? (request.building.interiorStyle === 'sandra-dorsett'
                ? sandraFurnitureFor(item.kind) : capsuleFurnitureFor(item.kind, capsuleProfile(request))) : null);
        const builtIn = preferredAsset ? undefined : roomFit ?? (family === 'damaged' ? damagedFurnitureFor(item.kind, roomKinds.get(item.room)) ?? table[item.kind] : table[item.kind]);
        const asset = preferredAsset ?? (builtIn ? null : chooseFurnitureAsset(item, models));
        const fit = asset ? undefined : builtIn ?? FALLBACK[family][item.kind];
        if (fit) {
            const scale: [number, number, number] = [item.size[0] / fit.size[0], item.size[2] / fit.size[2], item.size[1] / fit.size[1]];
            const showerParts = SHOWER_PARTS[fit.module];
            if (showerParts) {
                // The tray retains the furniture identity; glazing and fittings publish
                // their real local bounds instead of sealing the shower with one cuboid.
                for (const [index, module] of showerParts.entries()) {
                    builder.module(module, item.room, position, scale, item.rotationDeg * Math.PI / 180,
                        { id: index === 0 ? item.id : `${item.id}/${module}` });
                }
            } else builder.module(fit.module, item.room, position, scale, item.rotationDeg * Math.PI / 180, { id: item.id });
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
