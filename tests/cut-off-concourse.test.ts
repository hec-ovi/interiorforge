import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { generate } from '../src/index.js';
import { expectBuildingLevels, occupiedStoreys } from './building-levels.js';

it('keeps every floor of a mall whose stair and lift shafts cut a further concourse off its spine', { timeout: 240000 }, async () => {
    // The 24 m by 32 m poor commercial kit plan: its 4.5 m stairs and 3.5 m lifts leave a second
    // concourse that no shared wall can open into. That concourse goes; the floor keeps its spine.
    const id = 'plain-commercial-poor-3x4x8f';
    const blueprint = JSON.parse(readFileSync(new URL(`./kit-plans/${id}.blueprint.json`, import.meta.url), 'utf8'));
    const built = await generate({ seed: id, building: { id, type: 'mall', tier: 'mid' }, blueprint, materialTheme: 'cyberpunk' });
    expectBuildingLevels(built, blueprint.floors.length);
    for (const ref of occupiedStoreys(built)) {
        const floor = built.layouts[ref.layout]!.floor;
        expect(floor.kind, ref.layout).toBe('mall_floor');
        expect(floor.rooms.some(room => room.kind === 'concourse'), ref.layout).toBe(true);
        expect(floor.rooms.some(room => room.kind === 'sales_floor'), ref.layout).toBe(true);
    }
});
