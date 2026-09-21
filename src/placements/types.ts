import type { FloorInterior, FloorKind, NpcSupport, Opening } from '../core/types.js';
import type { Vector3 } from '../modules/types.js';
import type { ProgramChange } from '../layout/service-program.js';
export type LayoutId = 'ground' | 'middle' | 'crown' | `floor-${number}`;
export type LayoutMap<T> = Partial<Record<'ground' | 'middle' | 'crown', T>> & Record<`floor-${number}`, T>;
export interface Placement {
    id: string;
    module?: string;
    prop?: string;
    position: Vector3;
    rotationY: number;
    scale: Vector3;
    /** how many times the module's own UVs repeat over this placement: the stretch of a
     *  fitted piece, so its map keeps its published metre size. Absent means [1, 1]. */
    uvRepeat?: [number, number];
    room: string;
    opening?: string;
    connector?: string;
}
export interface FloorPlacement {
    version: 1;
    id: LayoutId;
    sourceFloor: number;
    floor: FloorInterior;
    openings: Opening[];
    placements: Placement[];
    npc: NpcSupport;
}
export interface BuildingManifest {
    architecture?: string;
    version: 1;
    generatorVersion: string;
    buildingId: string;
    modules: string;
    props: string;
    materialTheme: string;
    tier: string;
    /** Repeated floors share a layout; a distinct intermediate plate gets floor-<index>. */
    layouts: LayoutMap<string>;
    floors: {
        index: number;
        layout: LayoutId;
        elevation: number;
        openings: Record<string, string>;
        /** this floor's own window returns, from its own openings */
        treatments?: Placement[];
        program?: { kind: FloorKind; changes: ProgramChange[] };
    }[];
    connectors: NpcSupport['nav']['connectors'];
    /** the stair this building was furnished around, in world XZ */
    corePlacement: { stairA: { center: [number, number]; axis: [number, number]; width: number; depth: number } };
    /** set when the only core the plate holds crosses an exterior opening reservation */
    reservationCrossing?: { floor: number; opening: string; coreSolid: string; role: string; requiredDepth: number; availableDepth: number };
}
export interface PlacementResult {
    building: BuildingManifest;
    layouts: LayoutMap<FloorPlacement>;
}
