import { expect } from 'vitest';
import type { PlacementResult } from '../src/index.js';

/** A requestable outdoor roof is a level, but never another furnished storey. */
export function occupiedStoreys(result: PlacementResult) {
    return result.building.floors.filter(ref => result.layouts[ref.layout]!.floor.kind !== 'roof');
}

/** Preserve exact occupied counts and independently check the optional roof contract. */
export function expectBuildingLevels(result: PlacementResult, occupiedCount: number): void {
    const occupied = occupiedStoreys(result);
    const roofs = result.building.floors.filter(ref => result.layouts[ref.layout]!.floor.kind === 'roof');
    const source = Object.values(result.layouts).find(layout => layout.npc.nav.roofAccess);
    const access = source?.npc.nav.roofAccess;
    expect(occupied).toHaveLength(occupiedCount);
    expect(roofs).toHaveLength(access ? 1 : 0);
    expect(result.building.floors).toHaveLength(occupiedCount + roofs.length);
    if (!access || !source) return;
    const ref = roofs[0]!, roof = result.layouts[ref.layout]!;
    const crown = occupied.find(item => item.layout === source.id)!;
    expect(ref.index).toBe(access.floor);
    expect(ref.layout).toBe(`floor-${access.floor}`);
    expect(ref.elevation).toBeCloseTo(crown.elevation + access.elevation, 8);
    expect(roof.sourceFloor).toBe(access.floor);
    expect(roof.floor.rooms.map(room => [room.id, room.kind])).toEqual([['stair-a', 'corridor']]);
    expect(roof.floor.furniture).toEqual([]);
    expect(roof.floor.core.elevators).toEqual([]);
    expect(roof.placements).toEqual([]);
    expect(roof.npc.nav.floors.map(floor => floor.floor)).toEqual([access.floor]);
    expect(result.building.connectors.filter(connector => connector.kind === 'elevator')
        .some(connector => connector.floors.includes(access.floor))).toBe(false);
}
