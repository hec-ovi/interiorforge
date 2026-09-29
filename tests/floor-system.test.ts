import { describe, expect, it } from 'vitest';
import { loadTheme } from '../src/materials/load.js';
import { makeFrame, worldToUv, type UvRect } from '../src/layout/uv.js';
import { floorOrigin, pitIds, pitRect, placeFloorSystem } from '../src/styles/systems/floor.js';
import { floorPreset, type FloorPresetName } from '../src/styles/systems/floor-recipes.js';
import { gridIds } from '../src/styles/systems/surface-grid.js';
import type { SurfaceRoom } from '../src/styles/systems/types.js';
import type { Placement } from '../src/placements/types.js';
import { glbBytes, kits, recordingBuilder, triangles, uvExtent } from './surface-system-helpers.js';

const NAMES: FloorPresetName[] = ['A', 'A-pit', 'B', 'B-plank', 'C', 'C-hex', 'R'];
const presets = new Map(NAMES.map(name => [name, floorPreset(name, `tf${name.toLowerCase().replace('-', '')}`)]));
const catalog = kits(...[...presets.values()].map(p => p.recipes));
const L = { polygon: [[0, 0], [7, 0], [7, 3], [2, 3], [2, 6], [0, 6]] as [number, number][], rects: [{ u: 0, v: 0, lu: 7, lv: 3 }, { u: 0, v: 3, lu: 2, lv: 3 }] };
const room = (over: Partial<SurfaceRoom> = {}): SurfaceRoom => ({ id: 'lounge', kind: 'living', polygon: L.polygon, bounds: { u: 0, v: 0, lu: 7, lv: 6 },
    gridOrigin: [.25, .25], ceilingY: 3, soffitY: 3.3, elevation: 10.8, ...over });
const box = (lu: number, lv: number): Partial<SurfaceRoom> => ({ polygon: [[0, 0], [lu, 0], [lu, lv], [0, lv]], bounds: { u: 0, v: 0, lu, lv } });

/** What `walkingSlabs` sees: every `floor-slab-*` at y = 0 as its scale footprint. */
function walking(placements: Placement[], frame: ReturnType<typeof makeFrame>): UvRect[] {
    return placements.filter(p => p.module!.startsWith('floor-slab-') && Math.abs(p.position[1]) < 1e-6).map(p => {
        const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY), w = p.scale[0] * .25, d = p.scale[2] * .25;
        const pts = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => worldToUv([p.position[0] + x! * c + z! * s, p.position[2] - x! * s + z! * c], frame));
        const u = Math.min(...pts.map(q => q[0])), v = Math.min(...pts.map(q => q[1]));
        return { u, v, lu: Math.max(...pts.map(q => q[0])) - u, lv: Math.max(...pts.map(q => q[1])) - v };
    });
}
const covers = (rects: UvRect[], u: number, v: number) => rects.filter(r => u > r.u + 1e-6 && u < r.u + r.lu - 1e-6 && v > r.v + 1e-6 && v < r.v + r.lv - 1e-6).length;

describe('floor systems', () => {
    it('keeps Y0 walkable: one support per rectangle part, nothing floor-named above Y0, tiles flush on it', () => {
        for (const name of NAMES) for (const angle of [0, 37]) {
            const { system } = presets.get(name)!, frame = makeFrame(angle), builder = recordingBuilder();
            for (const rect of L.rects) placeFloorSystem(builder, system, room(), rect, 0, frame);
            for (const p of builder.placements) {
                const e = uvExtent(p, catalog.get(p.module!)!, frame);
                expect(e.y1, `${name} ${p.module}`).toBeLessThanOrEqual(1e-6);
            }
            // Walking slabs cover the room exactly once: supports and pit glass, never twice.
            const slabs = walking(builder.placements.filter(p => !/-pit-(straight|end)$/.test(p.module!)), frame);
            for (let u = .05; u < 7; u += .3) for (let v = .05; v < 6; v += .3) {
                const inRoom = v < 3 || u < 2;
                if (inRoom) expect(covers(slabs, u, v), `${name} ${u} ${v}`).toBe(1);
            }
            const supports = builder.placements.filter(p => p.module === system.support);
            for (const p of supports) expect(p.position[1]).toBe(0);
            expect(uvExtent(supports[0]!, catalog.get(system.support)!, frame).y1).toBeCloseTo(-.002, 6);
        }
    });

    it('keeps the tile joints on one grid across the cut between rectangles and lays blocks at scale 1', () => {
        for (const name of ['A', 'B', 'R', 'C'] as const) {
            const { system } = presets.get(name)!, frame = makeFrame(12), builder = recordingBuilder(), r = room();
            for (const rect of L.rects) placeFloorSystem(builder, system, r, rect, 0, frame);
            const ids = gridIds(system.tile.block), origin = floorOrigin(system, r), [pu, pv] = system.tile.size, j = system.tile.joint;
            const onGrid = (x: number, o: number, p: number) => Math.abs((x - o) / p - Math.round((x - o) / p)) < 1e-6;
            const band = system.border ? [0, system.border.width, system.border.width + (system.border.inlay?.width ?? 0)] : [0];
            const sides = [0, 2, 3, 6, 7].flatMap(s => band.flatMap(d => [s + d, s - d]));
            const ok = (x: number, o: number, p: number, sign: number) => onGrid(x + sign * j / 2, o, p) || sides.some(s => Math.abs(x - s) < 1e-6);
            const pieces = builder.placements.filter(p => p.module === ids.block || /-(row|col|cell)$/.test(p.module!));
            expect(pieces.length).toBeGreaterThan(3);
            for (const p of pieces) {
                if (p.module === ids.block) expect(p.scale).toEqual([1, 1, 1]);
                const e = uvExtent(p, catalog.get(p.module!)!, frame);
                expect(ok(e.u0, origin[0], pu, -1) && ok(e.u1, origin[0], pu, 1) && ok(e.v0, origin[1], pv, -1) && ok(e.v1, origin[1], pv, 1),
                    `${name} ${p.module} ${JSON.stringify(e)}`).toBe(true);
            }
        }
    });

    it('lays the border and inlay only along real walls', () => {
        const { system } = presets.get('B')!, frame = makeFrame(0), builder = recordingBuilder();
        for (const rect of L.rects) placeFloorSystem(builder, system, room(), rect, 0, frame);
        const border = system.border!;
        for (const p of builder.placements.filter(p => p.module === border.module || p.module === border.inlay!.module)) {
            const e = uvExtent(p, catalog.get(p.module!)!, frame);
            // Nothing along the internal cut v = 3 for u < 2.
            const onCut = e.u1 <= 2 + 1e-6 && e.v0 > 3 - border.width - .1 && e.v1 < 3 + border.width + .1 && e.v1 - e.v0 < border.width + 1e-6 && e.u1 - e.u0 > border.width + 1e-6;
            expect(onCut, JSON.stringify(e)).toBe(false);
        }
        const area = builder.placements.filter(p => p.module === border.module).reduce((a, p) => a + p.scale[0] * p.scale[2] * .25, 0);
        // Perimeter of the L (26 m) less the cut, times the band, less the corner overlaps.
        expect(area).toBeGreaterThan(8); expect(area).toBeLessThan(11);
    });

    it('sets a walk-on glass pit flush at Y0 over a lit tray with one lens record of the same id', () => {
        const { system } = presets.get('A-pit')!, pit = system.pit!, ids = pitIds(system);
        for (const angle of [0, 90, 37]) for (const [lu, lv] of [[7, 5], [5, 7.5]]) {
            const frame = makeFrame(angle), builder = recordingBuilder(), r = room(box(lu!, lv!)), rect: UvRect = { u: 0, v: 0, lu: lu!, lv: lv! };
            const lights = placeFloorSystem(builder, system, r, rect, 0, frame);
            const hole = pitRect(pit, r)!;
            expect(hole.lu * hole.lv).toBeCloseTo(pit.size[0] * pit.size[1], 9);
            expect(Math.max(hole.lu, hole.lv) === pit.size[1] && (hole.alongU === (lu! >= lv!))).toBe(true);
            const lens = builder.placements.filter(p => p.module === ids.lens);
            expect(lens).toHaveLength(1);
            expect(lights).toHaveLength(1);
            expect(lights[0]!.id).toBe(lens[0]!.id);
            expect(lights[0]!.position[1]).toBeCloseTo(10.8 - pit.depth + .05, 6);
            expect(lights[0]!.color).toEqual(pit.lens.color);
            expect(lights[0]!.facing).toBe('up');
            // The glass is the only pit piece reaching Y0; the rest lies under it, down to the tray.
            for (const p of builder.placements.filter(p => p.module!.includes('-pit'))) {
                const e = uvExtent(p, catalog.get(p.module!)!, frame);
                if (p.module === ids.glass) { expect(e.y1).toBeCloseTo(0, 9); expect(e.y0).toBeGreaterThanOrEqual(-.012 - 1e-9); continue; }
                expect(e.y1, p.module).toBeLessThanOrEqual(-.012);
                expect(e.y0, p.module).toBeGreaterThanOrEqual(-pit.depth - 1e-6);
                expect(e.u0).toBeGreaterThanOrEqual(hole.u - 1e-6); expect(e.u1).toBeLessThanOrEqual(hole.u + hole.lu + 1e-6);
                expect(e.v0).toBeGreaterThanOrEqual(hole.v - 1e-6); expect(e.v1).toBeLessThanOrEqual(hole.v + hole.lv + 1e-6);
            }
            for (const p of builder.placements.filter(p => p.module === ids.end)) expect(p.scale).toEqual([1, 1, 1]);
            // No tile or support over the pit.
            for (const p of builder.placements.filter(p => !p.module!.includes('-pit') && !p.module!.startsWith('ceiling-cove'))) {
                const e = uvExtent(p, catalog.get(p.module!)!, frame);
                const overlap = Math.min(e.u1, hole.u + hole.lu) - Math.max(e.u0, hole.u) > 1e-6 && Math.min(e.v1, hole.v + hole.lv) - Math.max(e.v0, hole.v) > 1e-6;
                expect(overlap, p.module).toBe(false);
            }
        }
        // A room that cannot keep a metre round the pit gets none.
        expect(pitRect(pit, room(box(4, 5)))).toBeUndefined();
    });

    it('keeps the pit ends and every floor module in budget and in theme materials', async () => {
        const library = loadTheme('cyberpunk')!.library, ids = pitIds(presets.get('A-pit')!.system);
        expect(triangles(catalog.get(ids.end)!)).toBeLessThanOrEqual(1000);
        for (const [name, preset] of presets) {
            let bytes = 0;
            for (const [id, k] of kits(preset.recipes)) {
                expect(triangles(k), id).toBeLessThanOrEqual(1000);
                bytes += await glbBytes(k);
                for (const slot of k.mesh.materials()) {
                    const [key, variant] = slot.split('#');
                    expect(library.entry(key!)?.variants.some(v => v.id === variant), `${id} ${slot}`).toBe(true);
                }
            }
            expect(bytes, name).toBeLessThan(80_000);
        }
    }, 30000);
});
