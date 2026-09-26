import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generate } from '../src/index.js';
import type { FloorPlacement } from '../src/index.js';
import { uncoveredRects } from '../src/placements/surfaces.js';

/** Samples at 0.1 m inside the rectangle a floor's rooms and core stand in, the one a consumer
 *  cuts its storey plate by, that neither a walking-level slab nor a core shaft covers. */
function uncovered(layout: FloorPlacement): string[] {
    const floor = layout.floor, angle = (floor.coreAngleDeg ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    const into = (x: number, z: number): [number, number] => [c * x + s * z, -s * x + c * z];
    const box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    const grow = ([x, z]: [number, number]) => Object.assign(box, { x0: Math.min(box.x0, x), z0: Math.min(box.z0, z), x1: Math.max(box.x1, x), z1: Math.max(box.z1, z) });
    for (const room of floor.rooms) for (const [x, z] of room.polygon) grow(into(x, z));
    const shafts = [...floor.core.stairs.map(stair => stair.rect), ...floor.core.elevators.map(lift => lift.rect), ...floor.core.shafts].map(r => {
        const [x, z] = into(r.x + r.w / 2, r.z + r.d / 2);
        grow([x - r.w / 2, z - r.d / 2]); grow([x + r.w / 2, z + r.d / 2]);
        return [x - r.w / 2, z - r.d / 2, x + r.w / 2, z + r.d / 2];
    });
    const slabs = layout.placements.filter(p => p.module?.startsWith('floor-slab-') && Math.abs(p.position[1]) < 1e-6).map(p => {
        const [x, z] = into(p.position[0], p.position[2]);
        return [x - p.scale[0] * .25, z - p.scale[2] * .25, x + p.scale[0] * .25, z + p.scale[2] * .25];
    });
    const covers = (r: number[], x: number, z: number) => x >= r[0]! - 1e-4 && x <= r[2]! + 1e-4 && z >= r[1]! - 1e-4 && z <= r[3]! + 1e-4;
    const missing: string[] = [];
    for (let x = box.x0 + .05; x < box.x1; x += .1) for (let z = box.z0 + .05; z < box.z1; z += .1)
        if (![...shafts, ...slabs].some(r => covers(r, x, z))) missing.push(`${x.toFixed(2)},${z.toFixed(2)}`);
    return missing;
}

it('finds the floor a set of rectangles leaves open inside a plate, in few rectangles', () => {
    const plate: [number, number][] = [[0, 0], [10, 0], [10, 6], [0, 6]];
    // A room and a stair leave a half-metre sliver between them and a corner beyond the stair.
    const open = uncoveredRects({ u: 0, v: 0, lu: 10, lv: 6 }, [{ u: 0, v: 0, lu: 6, lv: 6 }, { u: 6.5, v: 0, lu: 3.5, lv: 4 }], plate);
    expect(open).toEqual([{ u: 6, v: 0, lu: 0.5, lv: 4 }, { u: 6, v: 4, lu: 4, lv: 2 }]);
    // Nothing outside the plate is floor to fill, and rounding is not a sliver.
    const clipped: [number, number][] = [[0, 0], [8, 0], [8, 6], [0, 6]];
    expect(uncoveredRects({ u: 0, v: 0, lu: 10, lv: 6 }, [{ u: 0, v: 0, lu: 8.0000001, lv: 6 }], clipped)).toEqual([]);
});

it('lays a slab and a ceiling over the sliver between a mall floor and its lifts', { timeout: 120000 }, async () => {
    // The undertow mall shell p269, whose ground and crown once left 0.5 m open beside its lifts.
    const blueprint = JSON.parse(readFileSync(new URL('./kit-plans/mall-shell-p269.blueprint.json', import.meta.url), 'utf8'));
    const built = await generate({ seed: 'undertow-1000:p269', building: { id: 'p269', type: 'mall', tier: 'mid' }, blueprint, materialTheme: 'cyberpunk' });
    for (const [name, layout] of Object.entries(built.layouts)) {
        expect(uncovered(layout).slice(0, 5), name).toEqual([]);
    }
});
