import { describe, expect, it } from 'vitest';
import type { Point } from '../src/core/geom.js';
import type { LevelZone } from '../src/core/types.js';
import { admissibleLevels, levelAt, raisedZoneRects, walkableZone } from '../src/layout/levels.js';
import { makeFrame, uvRectCorners, worldToUv, type UvRect } from '../src/layout/uv.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { walkingSlabs } from '../src/placements/thresholds.js';
import { floorDoorways } from '../src/geometry/door-clear.js';
import { kind as kindB } from '../src/styles/ref-b/index.js';
import { GUARD_HEIGHT, RISE_MAX, TREAD, levelFloorRects, levelIds, levelPlan, placeLevels, riserCount } from '../src/styles/systems/levels.js';
import type { SurfaceRoom } from '../src/styles/systems/types.js';

void kindB; // registers the kind B level looks

const ROOM: UvRect = { u: 0, v: 0, lu: 12, lv: 8 };
const rings: Point[][] = [uvRectCorners(ROOM)];
const zone = (rect: UvRect, delta: number, edge: LevelZone['edge'], stair?: LevelZone['stair']): LevelZone =>
    ({ polygon: uvRectCorners(rect), delta, edge, ...(stair ? { stair } : {}) });
const surface = (levels: LevelZone[], style = 'b3'): SurfaceRoom => ({
    id: 'r', kind: 'living', style: style as SurfaceRoom['style'], polygon: rings[0]!, bounds: ROOM, gridOrigin: [0, 0],
    ceilingY: 3.1, soffitY: 3.6, elevation: 10, levels,
});

describe('level zones', () => {
    it('steps a corner platform down along its two open sides, every rise under the body step', () => {
        const bar = zone({ u: 8, v: 4, lu: 4, lv: 4 }, .45, 'step');
        const plan = levelPlan(bar, rings);
        const n = riserCount(.45);
        expect(n).toBe(3);
        expect(.45 / n).toBeLessThanOrEqual(RISE_MAX + 1e-9);
        expect(plan.slabs.map(s => +s.top.toFixed(3))).toEqual([.15, .3, .45]);
        // Nested: each slab a going inside the one below on the two open sides (u0, v0) only.
        for (let k = 1; k < plan.slabs.length; k++) {
            const lower = plan.slabs[k - 1]!.rect, upper = plan.slabs[k]!.rect;
            expect(upper.u - lower.u).toBeCloseTo(TREAD);
            expect(upper.v - lower.v).toBeCloseTo(TREAD);
            expect(upper.u + upper.lu).toBeCloseTo(12);
            expect(upper.v + upper.lv).toBeCloseTo(8);
        }
        expect(plan.slabs.at(-1)!.module).toBe('platform');
        expect(plan.guards).toHaveLength(0);
        // No nosing runs along the room's own walls.
        expect(plan.nosings.every(e => e.out[0] < 0 || e.out[1] < 0)).toBe(true);
    });

    it('guards a raised lounge on its open sides and cuts one flight at its stair', () => {
        const lounge = zone({ u: 0, v: 3, lu: 7, lv: 5 }, 1.2, 'guard', { at: [3.5, 3], axis: 'u', width: 1.4 });
        const plan = levelPlan(lounge, rings);
        const n = riserCount(1.2);
        expect(1.2 / n).toBeLessThanOrEqual(RISE_MAX + 1e-9);
        const treads = plan.slabs.filter(s => s.module === 'tread');
        expect(treads).toHaveLength(n - 1);
        for (const t of treads) expect(t.rect.lu).toBeCloseTo(1.4);
        // Guards along v0 (broken by the flight's mouth) and u1, plus the two cheeks.
        const lengths = plan.guards.map(g => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]));
        expect(lengths.reduce((a, b) => a + b, 0)).toBeCloseTo(7 - 1.4 + 5 + 2 * (n - 1) * TREAD, 5);
        expect(plan.guards.every(g => g.y === 1.2)).toBe(true);
    });

    it('leaves the floor system the rest of the rectangle', () => {
        const parts = levelFloorRects(ROOM, [zone({ u: 8, v: 4, lu: 4, lv: 4 }, .45, 'step')]);
        expect(parts.reduce((a, r) => a + r.lu * r.lv, 0)).toBeCloseTo(96 - 16);
        expect(levelFloorRects(ROOM, [zone({ u: 8, v: 4, lu: 4, lv: 4 }, 0, 'step')])).toEqual([ROOM]);
    });

    it('places slabs that count as walking floor, lit nosings with records of their id, and 1 m guards', () => {
        const builder = new PlacementBuilder(), frame = makeFrame(37);
        const bar = zone({ u: 8, v: 4, lu: 4, lv: 4 }, .45, 'step');
        const guarded = zone({ u: 0, v: 5, lu: 5, lv: 3 }, .9, 'guard', { at: [2.5, 5], axis: 'u', width: 1.2 });
        const lights = placeLevels(builder, 'b3', surface([bar, guarded]), ROOM, frame);
        const ids = levelIds('b3');
        const slabs = builder.placements.filter(p => p.module === ids.platform || p.module === ids.tread);
        expect(slabs.every(p => Math.abs(p.position[1]) < 1e-9)).toBe(true);
        const walked = walkingSlabs(builder, frame);
        const covered = (point: Point) => walked.some(r => point[0] > r.u - 1e-6 && point[0] < r.u + r.lu + 1e-6 && point[1] > r.v - 1e-6 && point[1] < r.v + r.lv + 1e-6);
        expect(covered([10, 6])).toBe(true);
        expect(covered([2.5, 7])).toBe(true);
        const lenses = builder.placements.filter(p => p.module === ids.lens);
        expect(lenses.length).toBeGreaterThan(0);
        expect(lights.map(l => l.id).sort()).toEqual(lenses.map(p => p.id).sort());
        expect(lights.every(l => l.position[1] > 10)).toBe(true);
        const guards = builder.placements.filter(p => p.module === ids.guard);
        expect(guards.length).toBeGreaterThan(0);
        for (const g of guards) expect(g.position[1]).toBeCloseTo(.9);
        expect(GUARD_HEIGHT).toBe(1);
        // A style without its own level look wears the shared one.
        const other = new PlacementBuilder();
        placeLevels(other, 'zz', surface([bar], 'e1'), ROOM, frame);
        expect(other.placements.every(p => p.module!.includes('-ref-'))).toBe(true);
    });

    it('splits a zone across the floor rectangles of its room without doubling a piece', () => {
        const frame = makeFrame(0), bar = zone({ u: 8, v: 4, lu: 4, lv: 4 }, .45, 'step');
        const whole = new PlacementBuilder(), split = new PlacementBuilder();
        placeLevels(whole, 'b3', surface([bar]), ROOM, frame);
        for (const rect of [{ u: 0, v: 0, lu: 10, lv: 8 }, { u: 10, v: 0, lu: 2, lv: 8 }])
            placeLevels(split, 'b3', surface([bar]), rect, frame);
        const area = (b: PlacementBuilder, module: string) => b.placements.filter(p => p.module === module)
            .reduce((a, p) => a + p.scale[0] * p.scale[2] * .25, 0);
        expect(area(split, levelIds('b3').platform)).toBeCloseTo(area(whole, levelIds('b3').platform));
        const length = (b: PlacementBuilder) => b.placements.filter(p => p.module === levelIds('b3').lens).reduce((a, p) => a + p.scale[0] * .5, 0);
        expect(length(split)).toBeCloseTo(length(whole));
    });

    it('closes raised zones to the nav grid, keeps door approaches and lifts furniture onto them', () => {
        const room = { id: 'r', kind: 'living' as const, rect: ROOM, polygon: rings[0]!, levels: [zone({ u: 8, v: 4, lu: 4, lv: 4 }, .45, 'step')],
            doors: [{ id: 'd', to: 'c', edge: 'v0' as const, at: 2, width: 1.6, leaves: 2 as const }] };
        expect(raisedZoneRects(room)).toHaveLength(1);
        expect(levelAt(room, [10, 6])).toBeCloseTo(.45);
        expect(levelAt(room, [2, 2])).toBe(0);
        expect(admissibleLevels(room)).toHaveLength(1);
        const blocked = { ...room, doors: [{ ...room.doors[0]!, at: 9 }], levels: [zone({ u: 8, v: 0, lu: 4, lv: 4 }, .45, 'step')] };
        expect(admissibleLevels(blocked)).toHaveLength(0);
        void worldToUv;
    });

    it('walks onto a one-riser platform: open to routes, meeting a doorway whose threshold takes its nosing', () => {
        // a kitchen alcove raised 0.10 m wall to wall, its 4.1 m mouth in the u1 wall
        const alcove: UvRect = { u: 0, v: 0, lu: 2.85, lv: 6.5 };
        const lip = zone(alcove, .1, 'step');
        expect(walkableZone(lip)).toBe(true);
        expect(walkableZone(zone(alcove, .3, 'step'))).toBe(false);
        expect(walkableZone(zone(alcove, .15, 'guard'))).toBe(false);
        expect(walkableZone(zone(alcove, -.15, 'step'))).toBe(false);
        const room = { id: 'k', kind: 'kitchen' as const, rect: alcove, polygon: uvRectCorners(alcove), levels: [lip],
            doors: [{ id: 'd', to: 'l', edge: 'u1' as const, at: 2.2, width: 4.1, leaves: 2 as const }] };
        expect(raisedZoneRects(room)).toHaveLength(0);
        expect(admissibleLevels(room)).toHaveLength(1);
        expect(levelAt(room, [1, 3])).toBeCloseTo(.1);
        // walled on every side, it takes a nosing across the doorway alone
        const plan = levelPlan(lip, [uvRectCorners(alcove)], [[[2.85, .15], [2.85, 4.25]]]);
        expect(plan.slabs.map(slab => [slab.module, slab.top])).toEqual([['platform', .1]]);
        expect(plan.nosings).toHaveLength(1);
        const [nosing] = plan.nosings;
        expect(nosing!.y).toBeCloseTo(.1);
        expect(nosing!.out).toEqual([1, 0]);
        expect(Math.hypot(nosing!.b[0] - nosing!.a[0], nosing!.b[1] - nosing!.a[1])).toBeCloseTo(4.1);
        // a deeper platform never marks a threshold, and a doorway off its sides takes none
        expect(levelPlan(zone(alcove, .45, 'step'), [uvRectCorners(alcove)], [[[2.85, .15], [2.85, 4.25]]]).nosings).toHaveLength(0);
        expect(levelPlan(lip, [uvRectCorners(alcove)], [[[4, .15], [4, 4.25]]]).nosings).toHaveLength(0);
        // the doorway's clear volume starts on the platform, not through it
        const living = { id: 'l', kind: 'living' as const, rect: { u: 2.85, v: 0, lu: 6, lv: 6.5 }, polygon: uvRectCorners({ u: 2.85, v: 0, lu: 6, lv: 6.5 }), doors: [] };
        const frame = makeFrame(0);
        const [raised] = floorDoorways([room, living], frame, 0, 3);
        const [flat] = floorDoorways([{ ...room, levels: [] }, living], frame, 0, 3);
        expect(raised!.center[1] - raised!.half[1]).toBeCloseTo(flat!.center[1] - flat!.half[1] + .1);
        expect(raised!.center[1] + raised!.half[1]).toBeCloseTo(flat!.center[1] + flat!.half[1]);
    });
});
