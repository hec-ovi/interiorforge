import type { FloorInterior, NpcSupport } from '../core/types.js';
import type { PlacementResult } from './types.js';
/** Expands lightweight simulation records on demand; meshes remain shared. */
export function expandBuilding(result: PlacementResult): {
    floors: FloorInterior[];
    npc: NpcSupport;
} {
    const floors: FloorInterior[] = [], npc: NpcSupport = {
        buildingId: result.building.buildingId, anchors: [], roles: [], routines: [], placements: [],
        nav: { cellSize: result.layouts.ground!.npc.nav.cellSize, floors: [], connectors: result.building.connectors }
    };
    for (const ref of result.building.floors) {
        const source = result.layouts[ref.layout]!;
        const ids = new Set<string>();
        const collect = (value: unknown): void => { if (Array.isArray(value))
            value.forEach(collect);
        else if (value && typeof value === 'object')
            for (const [key, v] of Object.entries(value)) {
                if (key === 'id' && typeof v === 'string')
                    ids.add(v);
                else
                    collect(v);
            } };
        collect(source.floor);
        collect(source.npc);
        const identity = (id: string) => ref.openings[id] ?? (ids.has(id) ? `floor:${ref.index}/${id}` : id);
        const keys = new Set(['id', 'room', 'to', 'unit', 'furniture', 'anchor', 'role', 'homeAnchor']);
        const clone = (value: unknown, key = ''): unknown => {
            if (typeof value === 'string')
                return keys.has(key) ? identity(value) : value;
            if (Array.isArray(value))
                return value.map(v => clone(v));
            if (value && typeof value === 'object')
                return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v, k)]));
            return key === 'floor' && typeof value === 'number' && value === source.sourceFloor ? ref.index : value;
        };
        const floor = clone(source.floor) as FloorInterior, local = clone(source.npc) as NpcSupport;
        floor.elevation = ref.elevation;
        floor.ceilingElevation += ref.elevation;
        for (const light of floor.lights)
            light.position[1] += ref.elevation;
        floors.push(floor);
        npc.anchors.push(...local.anchors);
        npc.roles.push(...local.roles);
        npc.routines.push(...local.routines);
        npc.placements!.push(...local.placements ?? []);
        npc.nav.floors.push(...local.nav.floors);
        if (local.nav.roofAccess) {
            local.nav.roofAccess.elevation += ref.elevation;
            local.nav.roofAccess.door.thresholdElevation += ref.elevation;
            npc.nav.roofAccess = local.nav.roofAccess;
        }
    }
    return { floors, npc };
}
