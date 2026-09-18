import type { FloorInterior, NpcSupport, Opening } from '../core/types.js';
import type { Vector3 } from '../modules/types.js';
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
    layouts: Record<LayoutId, string>;
    floors: {
        index: number;
        layout: LayoutId;
        elevation: number;
        openings: Record<string, string>;
    }[];
    connectors: NpcSupport['nav']['connectors'];
}
export interface PlacementResult {
    building: BuildingManifest;
    layouts: Record<LayoutId, FloorPlacement>;
}
