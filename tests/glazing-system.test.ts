import { describe, expect, it } from 'vitest';
import { loadTheme } from '../src/materials/load.js';
import { GLASS, glazingPreset, mullionStations, placeGlazing, railOf, type GlazingPresetName } from '../src/styles/systems/glazing.js';
import { glbBytes, kits, local, placed, recordingFace, triangles } from './surface-system-helpers.js';

const NAMES: GlazingPresetName[] = ['B', 'B-bath', 'R', 'E6-frosted'];
const presets = new Map(NAMES.map(name => [name, glazingPreset(name, 'tg', ['meeting'], ['corridor'])]));
const catalog = kits(...[...presets.values()].map(p => p.recipes),
    add => add(GLASS, k => k.cbox('glass', [0, 0, .006], [.5, .5, .012], undefined, ['north', 'south'])));

describe('glazing', () => {
    it('stands mullions on the grid pitch with an end post at each cut, stretched in y only', () => {
        for (const angle of [0, 37, 90]) for (const side of [1, -1] as const) for (const [a, b] of [[.35, 4.1], [2, 7.7], [1.2, 2.3]]) {
            const spec = presets.get('B')!.system, face = recordingFace({ axis: 'V', side, angle, c: 2.5, height: 3, gridOrigin: .5 });
            placeGlazing(face, spec, a!, b!);
            const mullions = face.placements.filter(p => p.module === spec.mullion.module).map(p => face.t(p)).sort((x, y) => x - y);
            const w = spec.mullion.width;
            expect(mullions[0]).toBeCloseTo(a! + w / 2, 9); expect(mullions.at(-1)).toBeCloseTo(b! - w / 2, 9);
            for (const t of mullions.slice(1, -1)) {
                const n = (t - .5) / spec.pitch;
                expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9);
                expect(t - a!).toBeGreaterThan(w); expect(b! - t).toBeGreaterThan(w);
            }
            for (const p of face.placements.filter(p => p.module === spec.mullion.module)) { expect(p.scale[0]).toBe(1); expect(p.scale[2]).toBe(1); }
            const rails = face.placements.filter(p => p.module === railOf(spec.mullion.module));
            expect(rails.map(p => +p.position[1].toFixed(6)).sort((x, y) => x - y)).toEqual([0, 2.1 - w / 2, 3 - w].map(v => +v.toFixed(6)));
            for (const p of rails) { expect(p.scale[1]).toBe(1); expect(p.scale[2]).toBe(1); expect(p.scale[0] * .5).toBeCloseTo(b! - a!, 9); }
            const glass = face.placements.filter(p => p.module === GLASS);
            expect(glass).toHaveLength(1);
            for (const p of face.placements) for (const v of placed(p, catalog.get(p.module!)!)) {
                const [t, y] = local(face, v);
                expect(t).toBeGreaterThanOrEqual(a! - 1e-6); expect(t).toBeLessThanOrEqual(b! + 1e-6);
                expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeLessThanOrEqual(3 + 1e-6);
            }
        }
    });

    it('lifts the plate onto an opaque base and bands the frosting inside the face', () => {
        const office = presets.get('R')!.system, face = recordingFace({ axis: 'H', side: 1, height: 2.9 });
        placeGlazing(face, office, 0, 3.2);
        const glass = face.placements.find(p => p.module === GLASS)!;
        expect(glass.position[1]).toBeCloseTo(.1, 9); expect(glass.scale[1] * .5).toBeCloseTo(2.8, 9);
        expect(face.placements.filter(p => p.module === office.base!.module)).toHaveLength(1);
        // The 2.4 m transom stands, the head rail tops the face.
        const rails = face.placements.filter(p => p.module === railOf(office.mullion.module)).map(p => p.position[1]).sort();
        expect(rails).toEqual([.1, 2.4 - office.mullion.width / 2, 2.9 - office.mullion.width].sort());
        const bath = presets.get('B-bath')!.system, screen = recordingFace({ axis: 'H', side: -1, height: 2.6 });
        placeGlazing(screen, bath, 0, 1.4);
        const frost = screen.placements.find(p => p.module === bath.frosting!.module)!;
        expect(frost.position[1]).toBeCloseTo(.9, 9); expect(frost.scale[1] * .5).toBeCloseTo(.9, 9);
        const tall = presets.get('E6-frosted')!.system, low = recordingFace({ axis: 'H', side: 1, height: 2.0 });
        placeGlazing(low, tall, 0, 1);
        const band = low.placements.find(p => p.module === tall.frosting!.module)!;
        expect(band.position[1] + band.scale[1] * .5).toBeCloseTo(2, 9);
    });

    it('pairs the stock stile with the stock rail and never redraws them', () => {
        expect(railOf('wall-meridian-glass-stile')).toBe('wall-meridian-glass-rail');
        expect(railOf('wall-glazing-x-mullion')).toBe('wall-glazing-x-mullion-rail');
        expect(mullionStations(0, .04, 1, .05, 0)).toEqual([.02]);
    });

    it('draws small modules in theme materials', async () => {
        const library = loadTheme('cyberpunk')!.library;
        for (const [id, k] of catalog) {
            if (id === GLASS) continue;
            expect(triangles(k), id).toBeLessThanOrEqual(12);
            expect(await glbBytes(k), id).toBeLessThan(4000);
            for (const slot of k.mesh.materials()) {
                const [key, variant] = slot.split('#');
                expect(library.entry(key!)?.variants.some(v => v.id === variant), `${id} ${slot}`).toBe(true);
            }
        }
    });
});
