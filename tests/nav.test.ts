import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { WalkGrid } from '../src/core/grid.js';
import type { Nav, NavConnector } from '../src/core/types.js';
import { findPath, NAV_SNAP_RADIUS, type NavRoute, type NavRouteRequest } from '../src/nav.js';

const CELL = .25;

type Rect = { x: number; z: number; w: number; d: number };

/** A 10 m square plate walkable over `open`, by default all of it, less the blocked rectangles. */
function floor(index: number, blocked: Rect[] = [], open: Rect[] = [{ x: 0, z: 0, w: 10, d: 10 }]): Nav['floors'][number] {
    const grid = new WalkGrid([0, 0], CELL, 40, 40);
    for (const rect of open) grid.openRect(rect);
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

/** Floors 0 to 2 open, and the roof level 3 a landing west of the stair door and a deck
 *  east of it. Stair A climbs to the roof; the lift stops at floor 2. */
const roofed: Nav = {
    cellSize: CELL,
    floors: [floor(0), floor(1), floor(2), floor(3, [], [{ x: 1, z: 4, w: 3, d: 2.5 }, { x: 4, z: 3, w: 5, d: 5 }])],
    connectors: [
        connector('stair-a', 'stair', [0, 1, 2, 3], [2.125, 5.125]),
        connector('lift-a', 'elevator', [0, 1, 2], [8.125, 8.125]),
    ],
    roofAccess: {
        floor: 3, elevation: 9, stair: 'stair-a',
        landing: [[1, 4], [4, 4], [4, 6.5], [1, 6.5]],
        door: { position: [4, 5.125], normal: [1, 0], width: 1, height: 2.1, thresholdElevation: 9 },
        entry: [5, 5.125],
    },
};

/** A stair whose entry moves along the plate from floor to floor, beside a straight one. */
const staggered: Nav = {
    cellSize: CELL,
    floors: [floor(0), floor(1), floor(2)],
    connectors: [
        { id: 'stair-l', kind: 'stair', floors: [0, 1, 2], entryByFloor: { 0: [8.125, 1.125], 1: [8.125, 3.125], 2: [8.125, 5.125] } },
        connector('stair-a', 'stair', [0, 1, 2], [1.125, 8.125]),
    ],
};

const route = (request: NavRouteRequest): NavRoute => {
    const result = findPath(request);
    if ('error' in result) throw new Error(result.error.message);
    return result;
};

const code = (request: unknown) => {
    const result = findPath(request as NavRouteRequest);
    return 'error' in result ? result.error.code : null;
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

it('climbs onto the roof access level by the stair that serves it', () => {
    const entry = roofed.roofAccess!.entry;
    const result = route({ nav: roofed, from: { floor: 0, x: 8, z: 7 }, to: { floor: roofed.roofAccess!.floor, x: entry[0], z: entry[1] } });
    expectJoined(roofed, result);
    expect(result.connectors.map(c => [c.id, c.fromFloor, c.toFloor])).toEqual([['lift-a', 0, 2], ['stair-a', 2, 3]]);
    expect(result.legs.at(-1)!.floor).toBe(roofed.roofAccess!.floor);
    expect(result.legs.at(-1)!.points.at(-1)).toEqual(entry);
});

it('joins the legs at each floor\'s own entry of a stair whose entry moves', () => {
    const result = route({ nav: staggered, from: { floor: 0, x: 9, z: 1 }, to: { floor: 2, x: 9, z: 6 } });
    expectJoined(staggered, result);
    expect(result.connectors).toEqual([{ id: 'stair-l', kind: 'stair', fromFloor: 0, toFloor: 2, from: [8.125, 1.125], to: [8.125, 5.125] }]);
    const back = route({ nav: staggered, from: { floor: 1, x: 9, z: 3 }, to: { floor: 0, x: 9, z: 1 } });
    expect(back.connectors).toEqual([{ id: 'stair-l', kind: 'stair', fromFloor: 1, toFloor: 0, from: [8.125, 3.125], to: [8.125, 1.125] }]);
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
    expect(code({ nav: split, from: { floor: 0, x: 1, z: 1 }, to: { floor: 7, x: 1, z: 1 } })).toBe('E_NAV_FLOOR');
    expect(code({ nav: split, from: { floor: 0, x: 1, z: 1 }, to: { floor: 1, x: 30, z: 1 } })).toBe('E_NAV_OFF_GRID');
    expect(code({ nav: closed, from: { floor: 0, x: 1, z: 1 }, to: { floor: 0, x: 9, z: 1 } })).toBe('E_NAV_UNREACHABLE');
    expect(code({ nav: split, from: { floor: 0, x: Number.NaN, z: 1 }, to: { floor: 0, x: 9, z: 1 } })).toBe('E_NAV_INPUT');
    expect(code({ nav: { floors: [] }, from: { floor: 0, x: 1, z: 1 }, to: { floor: 0, x: 9, z: 1 } })).toBe('E_NAV_INPUT');
});

it('names a malformed nav or request instead of throwing', () => {
    const [ground] = split.floors, [stair] = split.connectors, from = { floor: 0, x: 1, z: 1 }, to = { floor: 1, x: 9, z: 1 };
    expect(code(undefined)).toBe('E_NAV_INPUT');
    for (const nav of [
        5,
        { ...split, cellSize: 0 },
        { ...split, floors: [null] },
        { ...split, floors: [{ ...ground, walkable: undefined }] },
        { ...split, floors: [{ ...ground, walkable: ground!.walkable.slice(0, 8) }] },
        { ...split, floors: [{ ...ground, walkable: `${ground!.walkable.slice(1)}!` }] },
        { ...split, floors: [{ ...ground, origin: [0] }] },
        { ...split, floors: [{ ...ground, cols: 0 }] },
        { ...split, connectors: [{ ...stair, entryByFloor: undefined }] },
        { ...split, connectors: [{ ...stair, floors: null }] },
        { ...split, connectors: [{ ...stair, entryByFloor: { 0: 'door' } }] },
        { ...split, connectors: [{ ...stair, kind: 'ramp' }] },
    ]) expect(code({ nav, from, to }), JSON.stringify(nav).slice(0, 80)).toBe('E_NAV_INPUT');
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
        { nav: roofed, from: { floor: 0, x: 8, z: 7 }, to: { floor: 3, x: 5, z: 5.125 } },
        { nav: staggered, from: { floor: 0, x: 9, z: 1 }, to: { floor: 2, x: 9, z: 6 } },
    ]) {
        expect(request(input), JSON.stringify(request.errors)).toBe(true);
        expect(valid(findPath(input)), JSON.stringify(valid.errors)).toBe(true);
    }
});
