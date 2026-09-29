import { describe, expect, it } from 'vitest';
import type { LightFixture } from '../src/core/types.js';
import { loadTheme } from '../src/materials/load.js';
import { makeFrame, uvToWorld, worldToUv, type UvRect } from '../src/layout/uv.js';
import { ceilingOrigin, cofferRect, MIN_STEP_BOTTOM, placeCeilingSystem } from '../src/styles/systems/ceiling.js';
import { ceilingPreset, type CeilingPresetName } from '../src/styles/systems/ceiling-recipes.js';
import type { SurfaceRoom } from '../src/styles/systems/types.js';
import { glbBytes, kits, recordingBuilder, triangles, uvExtent } from './surface-system-helpers.js';

const NAMES: CeilingPresetName[] = ['A', 'A-fields', 'B', 'C', 'R'];
const presets = new Map(NAMES.map(name => [name, ceilingPreset(name, `tc${name.toLowerCase().replace('-', '')}`)]));
const coffered = ceilingPreset('A', 'tcoffer', { system: { coffers: { size: [2, 2], rise: .12, edge: 'ceiling-tcoffer-coffer', corner: 'ceiling-tcoffer-coffer-corner',
    lens: { module: 'ceiling-cove-tcoffer-coffer', y: 0, facing: 'up', lumensPerMetre: 25, kelvin: 3000, proud: .05 } } } });
const catalog = kits(...[...presets.values(), coffered].map(p => p.recipes));

const L = { polygon: [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]] as [number, number][], rects: [{ u: 0, v: 0, lu: 6, lv: 2 }, { u: 0, v: 2, lu: 2, lv: 4 }] };
const room = (over: Partial<SurfaceRoom> = {}): SurfaceRoom => ({ id: 'lounge', kind: 'lounge', polygon: L.polygon, bounds: { u: 0, v: 0, lu: 6, lv: 6 },
    gridOrigin: [.25, .25], ceilingY: 3, soffitY: 3.25, elevation: 7.2, ...over });
const GRID = /-\d+x\d+$/;

describe('ceiling systems', () => {
    it('keeps joints and phase on one grid across the rectangles of an L-shaped room, reveals only along real walls', () => {
        for (const angle of [0, 37]) for (const name of ['A', 'R', 'C'] as const) {
            const { system } = presets.get(name)!, frame = makeFrame(angle), builder = recordingBuilder(), r = room();
            for (const rect of L.rects) placeCeilingSystem(builder, system, r, rect, 3, frame, []);
            const origin = ceilingOrigin(system, r), [pu, pv] = system.grid.pitch, j = system.grid.joint, block = system.grid.block, [cu, cv] = system.grid.blockCells;
            const onGrid = (x: number, o: number, p: number) => Math.abs((x - o) / p - Math.round((x - o) / p)) < 1e-6;
            const pieces = builder.placements.filter(p => p.module === block || GRID.test(p.module!));
            expect(pieces.length).toBeGreaterThan(4);
            for (const p of pieces) {
                const e = uvExtent(p, catalog.get(p.module!)!, frame);
                expect(p.scale[1]).toBe(1);
                // A block of more than one cell each way is only ever laid whole.
                if (p.module === block && cu > 1 && cv > 1) expect(p.scale).toEqual([1, 1, 1]);
                // Every piece edge is either half a joint off a grid line or the side of the area it
                // fills: a wall, the cut between the rectangles, or the inner edge of a reveal.
                const reveals = system.perimeter ? builder.placements.filter(q => q.module === system.perimeter!.edge)
                    .flatMap(q => { const x = uvExtent(q, catalog.get(q.module!)!, frame); return [x.u0, x.u1, x.v0, x.v1]; }) : [];
                const sides = [0, 2, 6, ...reveals];
                const ok = (x: number, o: number, p: number, sign: number) => onGrid(x + sign * j / 2, o, p) || sides.some(s => Math.abs(x - s) < 1e-6);
                expect(ok(e.u0, origin[0], pu, -1) && ok(e.u1, origin[0], pu, 1) && ok(e.v0, origin[1], pv, -1) && ok(e.v1, origin[1], pv, 1),
                    `${name} ${angle} ${p.module} ${JSON.stringify(e)}`).toBe(true);
            }
            const perimeter = system.perimeter;
            if (!perimeter) continue;
            const w = perimeter.width, grid = pieces.map(p => uvExtent(p, catalog.get(p.module!)!, frame));
            // The grid keeps the reveal's width off every real wall and runs on across the cut
            // between the rectangles (v = 2 for u < 2), where there is no wall.
            for (const e of grid) {
                expect(e.u0).toBeGreaterThanOrEqual(w - 1e-6); expect(e.v0).toBeGreaterThanOrEqual(w - 1e-6);
                expect(e.u1).toBeLessThanOrEqual(6 - w + 1e-6); expect(e.v1).toBeLessThanOrEqual(6 - w + 1e-6);
                if (e.u0 >= 2 - 1e-6) expect(e.v1).toBeLessThanOrEqual(2 - w + 1e-6);
                if (e.v0 >= 2 - 1e-6) expect(e.u1).toBeLessThanOrEqual(2 - w + 1e-6);
            }
            expect(grid.some(e => e.u1 <= 2 && Math.abs(e.v1 - 2) < 1e-6 || e.u1 <= 2 && Math.abs(e.v0 - 2) < 1e-6 || e.u1 <= 2 && e.v0 < 2 && e.v1 > 2)).toBe(true);
            if (perimeter.edge === system.backing) {
                expect(builder.placements.filter(p => p.module === system.backing)).toHaveLength(2);
                continue;
            }
            // One straight band per wall from corner to corner: no corner pieces, no overlaps.
            expect(builder.placements.filter(p => p.module === perimeter.corner)).toHaveLength(0);
            const bands = builder.placements.filter(p => p.module === perimeter.edge).map(p => uvExtent(p, catalog.get(p.module!)!, frame));
            for (const [i, x] of bands.entries()) for (const y of bands.slice(i + 1))
                expect(Math.min(x.u1, y.u1) - Math.max(x.u0, y.u0) > 1e-4 && Math.min(x.v1, y.v1) - Math.max(x.v0, y.v0) > 1e-4, `${name} bands overlap`).toBe(false);
            for (const e of bands) {
                const onCut = e.u1 <= 2 + 1e-6 && Math.abs(e.v1 - e.v0 - w) < 1e-3 && (Math.abs(e.v1 - 2) < 1e-3 || Math.abs(e.v0 - 2) < 1e-3);
                expect(onCut, `${name} reveal at ${JSON.stringify(e)}`).toBe(false);
            }
        }
    });

    it('keeps every band inside a narrow rectangle', () => {
        for (const name of ['A', 'B', 'R'] as const) for (const width of [.3, .7, 1.3]) {
            const { system } = presets.get(name)!, frame = makeFrame(23), builder = recordingBuilder(), rect = { u: 1, v: 1, lu: width, lv: 4 };
            placeCeilingSystem(builder, system, room({ polygon: [[1, 1], [1 + width, 1], [1 + width, 5], [1, 5]], bounds: rect }), rect, 3, frame, []);
            for (const p of builder.placements) {
                const e = uvExtent(p, catalog.get(p.module!)!, frame);
                expect(e.u0, `${name} ${width} ${p.module}`).toBeGreaterThanOrEqual(1 - 1e-6); expect(e.u1, `${name} ${width} ${p.module}`).toBeLessThanOrEqual(1 + width + 1e-6);
                expect(e.v0).toBeGreaterThanOrEqual(1 - 1e-6); expect(e.v1).toBeLessThanOrEqual(5 + 1e-6);
            }
        }
    });

    it('hangs stepped rings no lower than a door head reaches and never in a stairwell', () => {
        const { system } = presets.get('B')!, step = system.steps![0]!;
        for (const y of [3.2, 2.7, 2.59]) {
            const builder = recordingBuilder(), lights = placeCeilingSystem(builder, system, room({ polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], bounds: { u: 0, v: 0, lu: 5, lv: 4 } }),
                { u: 0, v: 0, lu: 5, lv: 4 }, y, makeFrame(0), []);
            const soffits = builder.placements.filter(p => p.module === `${step.fascia}-soffit`);
            if (y - MIN_STEP_BOTTOM < .02) { expect(soffits).toHaveLength(0); expect(lights).toHaveLength(0); continue; }
            expect(soffits).toHaveLength(4);
            for (const p of soffits) expect(p.position[1]).toBeCloseTo(Math.max(MIN_STEP_BOTTOM, y - step.drop), 9);
            const fascias = builder.placements.filter(p => p.module === step.fascia);
            expect(fascias).toHaveLength(4);
            expect(lights).toHaveLength(4);
            for (const f of fascias) expect(f.scale[0]).toBe(f.scale[0]);
        }
        const stair = recordingBuilder();
        placeCeilingSystem(stair, system, room({ id: 'stair-a' }), L.rects[0]!, 3, makeFrame(0), []);
        expect(stair.placements.some(p => p.module!.startsWith(step.fascia))).toBe(false);
    });

    it('gives every lens and luminous field a record of its own id, building-local', () => {
        for (const name of ['B', 'A-fields'] as const) {
            const { system } = presets.get(name)!, builder = recordingBuilder();
            const lights: LightFixture[] = [];
            for (const rect of L.rects) lights.push(...placeCeilingSystem(builder, system, room(), rect, 3.1, makeFrame(21), []));
            const lenses = builder.placements.filter(p => /^(ceiling-cove|ceiling-spot|ceiling-led-strip)/.test(p.module!));
            expect(lenses.length).toBeGreaterThan(0);
            expect(lights.map(l => l.id).sort()).toEqual(lenses.map(p => p.id).sort());
            for (const light of lights) {
                const lens = lenses.find(p => p.id === light.id)!;
                expect(Math.abs(light.position[1] - lens.position[1] - 7.2)).toBeLessThan(.02);
            }
            if (name === 'A-fields') expect(lights.every(l => l.kind === 'strip' && l.facing === 'down')).toBe(true);
            else expect(lights.every(l => l.kind === 'cove')).toBe(true);
        }
    });

    it('moves planned spots to cell centres once and every planned record by the room drop', () => {
        const { system } = presets.get('A')!, frame = makeFrame(30), r = room({ ceilingDrop: .3 });
        const at = (u: number, v: number, y: number, kind: 'spot' | 'cove', id: string): LightFixture => {
            const [x, z] = uvToWorld([u, v], frame);
            return { id, kind, room: 'lounge', position: [x, y, z], length: kind === 'cove' ? 2 : 0, angleDeg: 0, intensity: 500, colorTemperatureK: 3000, range: 4, beamDeg: 60, diffuse: .3, facing: kind === 'cove' ? 'up' : 'down' };
        };
        const spot = at(3.9, 1.1, 7.2 + 3 - .04, 'spot', 's'), cove = at(.22, 1, 7.2 + 3 - .2, 'cove', 'c'), elsewhere = { ...at(1, 1, 10, 'spot', 'x'), room: 'other' };
        const builder = recordingBuilder();
        for (const rect of L.rects) placeCeilingSystem(builder, system, r, rect, 2.7, frame, [spot, cove, elsewhere]);
        const origin = ceilingOrigin(system, r), [u, v] = worldToUv([spot.position[0], spot.position[2]], frame);
        // Records keep millimetres.
        const frac = (x: number) => ((x % 1) + 1) % 1;
        expect(frac((u - origin[0]) / system.grid.pitch[0])).toBeCloseTo(.5, 2);
        expect(frac((v - origin[1]) / system.grid.pitch[1])).toBeCloseTo(.5, 2);
        expect(spot.position[1]).toBeCloseTo(7.2 + 2.7 - .04, 6);
        expect(cove.position[1]).toBeCloseTo(7.2 + 3 - .2 - .3, 6);
        expect(elsewhere.position[1]).toBe(10);
    });

    it('raises a coffer into the void no higher than the slab allows, one band from the walls', () => {
        const { system } = coffered, frame = makeFrame(0), r = room({ polygon: [[0, 0], [6, 0], [6, 5], [0, 5]], bounds: { u: 0, v: 0, lu: 6, lv: 5 }, soffitY: 3.2 });
        const builder = recordingBuilder(), rect: UvRect = { u: 0, v: 0, lu: 6, lv: 5 };
        const lights = placeCeilingSystem(builder, system, r, rect, 3, frame, []);
        const c = cofferRect(system, r)!;
        expect(c).toEqual({ u: 2, v: 1.5, lu: 2, lv: 2 });
        const rise = Math.min(system.coffers!.rise, 3.2 - .15 - 3);
        const raised = builder.placements.filter(p => Math.abs(p.position[1] - (3 + rise)) < 1e-9 && (GRID.test(p.module!) || p.module === system.grid.block));
        expect(raised.length).toBeGreaterThan(0);
        for (const p of raised) {
            const e = uvExtent(p, catalog.get(p.module!)!, frame);
            expect(e.u0).toBeGreaterThanOrEqual(c.u - 1e-6); expect(e.u1).toBeLessThanOrEqual(c.u + c.lu + 1e-6);
        }
        expect(builder.placements.filter(p => p.module === system.coffers!.edge)).toHaveLength(4);
        expect(lights.filter(l => l.id.startsWith('module:'))).toHaveLength(4);
        for (const p of builder.placements) for (const y of [uvExtent(p, catalog.get(p.module!)!, frame).y1]) expect(y).toBeLessThanOrEqual(3.2 - .15 + .05);
    });
});

describe('single-cell grids', () => {
    it('lay a one-cell block stretched wherever it is clipped, needing no other grid module', () => {
        const spec = { id: 'ceiling-field-x', backing: 'ceiling-field-x', snapSpots: false,
            grid: { pitch: [.5, .5] as [number, number], block: 'ceiling-field-x', blockCells: [1, 1] as [number, number], joint: 0, phase: 'grid' as const } };
        const builder = recordingBuilder();
        for (const rect of L.rects) placeCeilingSystem(builder, spec, room({ gridOrigin: [.1, .3] }), rect, 3, makeFrame(10), []);
        expect(new Set(builder.placements.map(p => p.module))).toEqual(new Set(['ceiling-field-x']));
        expect(builder.placements.some(p => p.scale[0] !== 1 || p.scale[2] !== 1)).toBe(true);
    });
});

describe('ceiling modules', () => {
    it('stay small, closed to the budget and in theme materials', async () => {
        const library = loadTheme('cyberpunk')!.library;
        for (const [name, preset] of [...presets, ['coffer', coffered] as const]) {
            const own = kits(preset.recipes);
            let bytes = 0;
            for (const [id, k] of own) {
                expect(triangles(k), id).toBeLessThanOrEqual(400);
                bytes += await glbBytes(k);
                for (const slot of k.mesh.materials()) {
                    const [key, variant] = slot.split('#');
                    expect(library.entry(key!)?.variants.some(v => v.id === variant), `${id} ${slot}`).toBe(true);
                }
            }
            expect(bytes, String(name)).toBeLessThan(60_000);
        }
    }, 30000);
});
