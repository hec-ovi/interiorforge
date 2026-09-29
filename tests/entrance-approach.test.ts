import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { coreFeasibility, generate } from '../src/index.js';
import type { BuildingType, Tier } from '../src/index.js';
import { expectBuildingLevels, occupiedStoreys } from './building-levels.js';

/** Kit plans whose street door once opened onto a wall: the plain plan behind four of
 *  Sluice's venues (p34, p50, p90, p93) stood its egress stair flush behind the door, and
 *  the small white-grid podium stood its toilets and storage 2 m in front of it. */
const plan = (id: string) => JSON.parse(readFileSync(new URL(`./kit-plans/${id}.blueprint.json`, import.meta.url), 'utf8'));

/** The layout contract's floor in front of a street door, a corridor's width. */
const APPROACH = 2.5;

interface Box { x0: number; x1: number; z0: number; z1: number }

const overlaps = (a: Box, b: Box): boolean =>
    Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6;

/** A frame rect turned about its own centre by the floor's core angle, as world bounds. */
function footprint({ x, z, w, d }: { x: number; z: number; w: number; d: number }, angleDeg: number): Box {
    const turn = angleDeg * Math.PI / 180, c = Math.abs(Math.cos(turn)), s = Math.abs(Math.sin(turn));
    const hx = (w * c + d * s) / 2, hz = (w * s + d * c) / 2, cx = x + w / 2, cz = z + d / 2;
    return { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz };
}

function bounds(points: readonly (readonly number[])[]): Box {
    const xs = points.map(p => p[0]!), zs = points.map(p => p[1]!);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}

type Built = Awaited<ReturnType<typeof generate>>;

/** No stair, lift or other room than the one it lands in stands in front of the street door. */
function expectClearWayIn(built: Built, blueprint: ReturnType<typeof plan>): void {
    const floor = built.layouts.ground!.floor;
    const door = floor.openingReservations.find(r => r.opening === 'entrance')!;
    const width = blueprint.floors.find((f: { index: number }) => f.index === 0)
        .openings.find((o: { id: string }) => o.id === 'entrance').width;
    // The approach: the door's clear width, the opening's clear volume plus APPROACH deep.
    const [px, pz] = door.position, [ix, iz] = door.inward, reach = door.depth + APPROACH - 1e-3;
    const approach = bounds([-1, 1].flatMap(side => [0, reach].map(d =>
        [px - iz * side * width / 2 + ix * d, pz + ix * side * width / 2 + iz * d])));
    for (const { id: solid, rect } of [...floor.core.stairs, ...floor.core.elevators]) {
        expect(overlaps(footprint(rect, floor.coreAngleDeg), approach), `${solid} stands in the way in`).toBe(false);
    }
    const landing = floor.rooms.find(room => room.doors.some(d => d.to === 'outside'))!;
    for (const room of floor.rooms.filter(other => other !== landing)) {
        expect(overlaps(bounds(room.polygon), approach), `${room.kind} ${room.id} stands in the way in`).toBe(false);
    }
}

it.each([
    ['plain-commercial-mid-3x4x2f', 'offices', 'mid'], ['plain-commercial-mid-3x4x2f', 'hotel', 'mid'],
    ['plain-commercial-mid-3x4x2f', 'coffee_shop', 'mid'], ['white-grid-commercial-rich-4x3x10f', 'offices', 'rich'],
] as [string, BuildingType, Tier][])('opens the %s %s street door onto floor, clear of the core and the service rooms', async (id, type, tier) => {
    const blueprint = plan(id);
    expectClearWayIn(await generate({ seed: `sluice-500:${type}`, building: { id, type, tier }, blueprint, materialTheme: 'cyberpunk' }), blueprint);
});

/** A balcony door keeps only its own clear volume: the core rises past every floor, and the
 *  approach of twelve balcony doors a floor left this bulkhead-pinned stair no place in 0.37.2. */
it('keeps a core, and every floor, behind the balcony doors of plain-2x4x6f', async () => {
    const blueprint = plan('plain-2x4x6f');
    expect(coreFeasibility(blueprint).fits).toBe(true);
    const built = await generate({ seed: 'undertow:residential', building: { id: 'plain-2x4x6f', type: 'residential', tier: 'mid' },
        blueprint, materialTheme: 'cyberpunk' });
    expectBuildingLevels(built, 6);
    expect(occupiedStoreys(built).map(floor => floor.index)).toEqual([0, 1, 2, 3, 4, 5]);
    expectClearWayIn(built, blueprint);
}, 120_000);
