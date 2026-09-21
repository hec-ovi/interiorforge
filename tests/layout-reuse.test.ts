import { expect, it } from 'vitest';
import { expandBuilding, generate, makePlacementFixture } from '../src/index.js';

it('shares equal intermediate plates and keeps distinct explicit programmes in their own layout', async () => {
    const request = makePlacementFixture({ width: 32, depth: 40, floors: 6, type: 'offices', tier: 'high_rich', seed: 7 });
    request.assignments = request.blueprint.floors.map(floor => ({ floor: floor.index,
        kind: floor.index === 0 ? 'lobby' : floor.index === 2 ? 'coffee_shop' : 'office' }));
    const result = await generate(request);
    expect(Object.keys(result.layouts)).toEqual(['ground', 'middle', 'floor-2', 'crown']);
    expect(result.building.floors.map(floor => floor.layout)).toEqual(['ground', 'middle', 'floor-2', 'middle', 'middle', 'crown']);
    expect(result.layouts['floor-2']!.floor.kind).toBe('coffee_shop');
    const expanded = expandBuilding(result);
    expect(expanded.floors.map(floor => floor.kind)).toEqual(['lobby', 'office', 'coffee_shop', 'office', 'office', 'office']);
    expect(expanded.npc.nav.floors.map(floor => floor.floor)).toEqual([0, 1, 2, 3, 4, 5]);
    const ids = expanded.npc.anchors.map(anchor => anchor.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const connector of expanded.npc.nav.connectors) {
        expect(connector.floors).toEqual([0, 1, 2, 3, 4, 5]);
        expect(Object.keys(connector.entryByFloor)).toEqual(['0', '1', '2', '3', '4', '5']);
    }
});
