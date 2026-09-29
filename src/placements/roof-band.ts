import type { InteriorRequest } from '../core/types.js';
import type { GeneratedInterior, LayoutId } from './types.js';

/** Publish the outdoor roof as a requestable floor. The shell owns its surface and
 * enclosure; the crown owns the final flight and its arrival landing. A dedicated
 * band lets the existing door streamer acknowledge the roof without generating room surfaces or
 * repeating the crown's furniture, or adding an elevator stop above its last landing. */
export function publishRoofBand(result: GeneratedInterior, request: InteriorRequest): void {
    const source = Object.values(result.layouts).find(layout => layout.npc.nav.roofAccess);
    const access = source?.npc.nav.roofAccess;
    if (!source || !access) return;
    const crown = result.building.floors.find(ref => ref.layout === source.id)!;
    const index = access.floor;
    const id: LayoutId = `floor-${index}`;
    const height = request.blueprint.roof?.bulkhead?.housingHeight ?? 2.1;
    const roofNav = source.npc.nav.floors.filter(floor => floor.floor === index);
    source.npc.nav.floors = source.npc.nav.floors.filter(floor => floor.floor !== index);
    const stair = source.floor.core.stairs.find(stair => stair.id === access.stair);
    result.layouts[id] = {
        version: 1, id, sourceFloor: index,
        floor: {
            floor: index, kind: 'roof', elevation: 0, height, ceilingElevation: height,
            coreAngleDeg: source.floor.coreAngleDeg,
            core: { elevators: [], stairs: stair ? [{ ...structuredClone(stair), entry: [...access.entry] }] : [], shafts: [] },
            openingReservations: [], rooms: [], furniture: [], lights: [],
        },
        openings: [], placements: [],
        npc: { buildingId: result.building.buildingId, anchors: [], roles: [], routines: [], placements: [],
            nav: { cellSize: source.npc.nav.cellSize, floors: roofNav, connectors: [] } },
    };
    result.building.layouts[id] = `layouts/${id}.json`;
    result.building.floors.push({ index, layout: id, elevation: crown.elevation + access.elevation, openings: {} });
}
