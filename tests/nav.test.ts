import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { WalkGrid } from '../src/core/grid.js';
import type { Nav, NavConnector } from '../src/core/types.js';
import { findPath, NAV_SNAP_RADIUS, type NavRoute, type NavRouteRequest } from '../src/nav.js';

const CELL = .25;

/** A 10 m square floor, open but for the listed blocked rectangles. */
function floor(index: number, blocked: { x: number; z: number; w: number; d: number }[] = []): Nav['floors'][number] {
    const grid = new WalkGrid([0, 0], CELL, 40, 40);
    grid.openRect({ x: 0, z: 0, w: 10, d: 10 });
    for (const rect of blocked) grid.blockRect(rect);
    return { floor: index, origin: [0, 0], cols: 40, rows: 40, walkable: grid.toBase64() };
}

function connector(id: string, kind: NavConnector['kind'], floors: number[], entry: [number, number]): NavConnector {
    return { id, kind, floors, entryByFloor: Object.fromEntries(floors.map(f => [f, entry])) };
}

/** Floor 0 is cut in two by a wall at x 5; floors 1 and 2 are open; each half of floor 0
 *  keeps a stair up, and the lift stands in the east half. */
const split: Nav = {
    cellSize: CELL,
    floors: [floor(0, [{ x: 4.75, z: 0, w: .5, d: 10 }]), floor(1), floor(2)],
    connectors: [
        connector('stair-a', 'stair', [0, 1, 2], [2.125, 5.125]),
        connector('stair-b', 'stair', [0, 1], [8.125, 5.125]),
        connector('lift-a', 'elevator', [0, 1, 2], [8.125, 8.125]),
    ],
};

const route = (request: NavRouteRequest): NavRoute => {
    const result = findPath(request);
    if ('error' in result) throw new Error(result.error.message);
    return result;
};

/** Every leg walks the floor it names, and each transfer joins the legs either side of it. */
function expectJoined(nav: Nav, result: NavRoute): void {
    expect(result.legs).toHaveLength(result.connectors.length + 1);
    const grids = new Map(nav.floors.map(f => [f.floor, WalkGrid.fromBase64(f.walkable, f.origin, nav.cellSize, f.cols, f.rows)]));
    for (const leg of result.legs) for (const point of leg.points) expect(grids.get(leg.floor)!.isWalkableAt(point)).toBe(true);
    result.connectors.forEach((transfer, i) => {
        expect(result.legs[i]!.floor).toBe(transfer.fromFloor);
        expect(result.legs[i]!.points.at(-1)).toEqual(transfer.from);
        expect(result.legs[i + 1]!.floor).toBe(transfer.toFloor);
        expect(result.legs[i + 1]!.points[0]).toEqual(transfer.to);
    });
}

it('rides one lift across two floors rather than climbing two flights', () => {
    const result = route({ nav: split, from: { floor: 0, x: 7, z: 7 }, to: { floor: 2, x: 3, z: 3 } });
    expectJoined(split, result);
    expect(result.connectors).toEqual([{ id: 'lift-a', kind: 'elevator', fromFloor: 0, toFloor: 2, from: [8.125, 8.125], to: [8.125, 8.125] }]);
    expect(result.legs[0]!.points[0]).toEqual([7, 7]);
    expect(result.legs[1]!.points.at(-1)).toEqual([3, 3]);
});

it('crosses a floor its own plate cannot join through the floor above', () => {
    const result = route({ nav: split, from: { floor: 0, x: 1, z: 1 }, to: { floor: 0, x: 9, z: 1 } });
    expectJoined(split, result);
    expect(result.legs.map(leg => leg.floor)).toEqual([0, 1, 0]);
    expect(result.connectors.map(c => c.id)).toEqual(['stair-a', 'stair-b']);
});

it('walks one floor directly when it can', () => {
    const result = route({ nav: split, from: { floor: 1, x: 1, z: 1 }, to: { floor: 1, x: 9, z: 9 } });
    expect(result).toEqual({ legs: [{ floor: 1, points: [[1, 1], [9, 9]] }], connectors: [] });
});

it('snaps an endpoint on blocked floor to the nearest walkable cell centre within the snap radius', () => {
    const result = route({ nav: split, from: { floor: 0, x: 5, z: 2.1 }, to: { floor: 0, x: 2, z: 2 } });
    const [x, z] = result.legs[0]!.points[0]!;
    expect(Math.hypot(x - 5, z - 2.1)).toBeLessThanOrEqual(NAV_SNAP_RADIUS);
    expect(x).toBeLessThan(5);
    expectJoined(split, result);
});

it('names why no route exists', () => {
    const closed: Nav = { ...split, connectors: [] };
    const code = (request: unknown) => {
        const result = findPath(request as NavRouteRequest);
        return 'error' in result ? result.error.code : null;
    };
    expect(code({ nav: split, from: { floor: 0, x: 1, z: 1 }, to: { floor: 7, x: 1, z: 1 } })).toBe('E_NAV_FLOOR');
    expect(code({ nav: split, from: { floor: 0, x: 1, z: 1 }, to: { floor: 1, x: 30, z: 1 } })).toBe('E_NAV_OFF_GRID');
    expect(code({ nav: closed, from: { floor: 0, x: 1, z: 1 }, to: { floor: 0, x: 9, z: 1 } })).toBe('E_NAV_UNREACHABLE');
    expect(code({ nav: split, from: { floor: 0, x: Number.NaN, z: 1 }, to: { floor: 0, x: 9, z: 1 } })).toBe('E_NAV_INPUT');
    expect(code({ nav: { floors: [] }, from: { floor: 0, x: 1, z: 1 }, to: { floor: 0, x: 9, z: 1 } })).toBe('E_NAV_INPUT');
});

it('returns fresh points, leaving the nav and later routes untouched', () => {
    const request = { nav: split, from: { floor: 0, x: 1, z: 1 }, to: { floor: 0, x: 9, z: 1 } };
    const first = route(request);
    first.connectors[0]!.from[0] = -1;
    first.legs[1]!.points[0]![0] = -1;
    expect(split.connectors[0]!.entryByFloor['0']).toEqual([2.125, 5.125]);
    expect(route(request).legs[1]!.points[0]).toEqual([2.125, 5.125]);
});

it('publishes routes and failures matching the route schema', async () => {
    const ajv = new Ajv2020({ strict: false });
    for (const name of ['npc', 'nav-route'])
        ajv.addSchema(JSON.parse(await readFile(`schemas/${name}.schema.json`, 'utf8')), `https://urbe.dev/interior/${name}.schema.json`);
    const valid = ajv.getSchema('https://urbe.dev/interior/nav-route.schema.json')!;
    const request = ajv.getSchema('https://urbe.dev/interior/nav-route.schema.json#/$defs/request')!;
    for (const input of [
        { nav: split, from: { floor: 0, x: 1, z: 1 }, to: { floor: 2, x: 9, z: 1 } },
        { nav: split, from: { floor: 0, x: 1, z: 1 }, to: { floor: 5, x: 9, z: 1 } },
    ]) {
        expect(request(input), JSON.stringify(request.errors)).toBe(true);
        expect(valid(findPath(input)), JSON.stringify(valid.errors)).toBe(true);
    }
});
