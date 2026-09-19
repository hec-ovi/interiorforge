import type { FloorInterior, FloorKind, NpcSupport, Opening } from '../core/types.js';
import type { Vector3 } from '../modules/types.js';
import type { ProgramChange } from '../layout/service-program.js';
export type LayoutId = 'ground' | 'middle' | 'crown';
export interface Placement {
    id: string;
    module?: string;
    prop?: string;
    position: Vector3;
    rotationY: number;
    scale: Vector3;
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
    version: 1;
    generatorVersion: string;
    buildingId: string;
    modules: string;
    props: string;
    materialTheme: string;
    tier: string;
    /** a two floor building publishes ground and crown only */
    layouts: Partial<Record<LayoutId, string>>;
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
    layouts: Partial<Record<LayoutId, FloorPlacement>>;
}
