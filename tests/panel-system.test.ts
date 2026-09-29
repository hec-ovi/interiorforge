import { describe, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, FrontSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { loadTheme } from '../src/materials/load.js';
import { panelCells, panelIntervals, placePanelSystem } from '../src/styles/systems/panel.js';
import { EDGE_HALF, groupOf, panelIds, panelPreset, pairOf, type PanelPresetName } from '../src/styles/systems/panel-recipes.js';
import { bounds, glbBytes, kits, local, placed, recordingFace, triangles, type RecordingFace } from './surface-system-helpers.js';

const PRESETS: PanelPresetName[] = ['A', 'A-bed', 'B', 'B-stone', 'C', 'C-capsule', 'R'];
const presets = new Map(PRESETS.map(name => [name, panelPreset(name, `t${name.toLowerCase().replace('-', '')}`)]));
const edged = panelPreset('C', 'tce', { system: { edge: panelIds('tce').edge } });
const catalog = kits(...[...presets.values(), edged].map(p => p.recipes), add => add('wall-field-meridian-backing', k => k.cbox('x', [0, 0, .044], [.5, .5, .088])));
const SKIN = /^wall-panel-[a-z0-9-]+-(col|top|fill|edge)/;

/** The t-extent of every skin piece of a face, sorted along the run. */
function skins(face: RecordingFace): [number, number][] {
    return face.placements.filter(p => SKIN.test(p.module!) && !p.module!.endsWith('-edge')).map(p => {
        const ts = placed(p, catalog.get(p.module!)!).map(v => local(face, v)[0]);
        return [Math.min(...ts), Math.max(...ts)] as [number, number];
    }).sort((a, b) => a[0] - b[0]);
}

describe('panel intervals', () => {
    it('keeps the pitch phase from the grid origin and clips only at the run ends', () => {
        const cells = panelIntervals(.3, 4.1, [1], 0, .006);
        expect(cells.map(c => [c.a, c.b, c.full])).toEqual([[.3, 1, false], [1, 2, true], [2, 3, true], [3, 4, true], [4, 4.1, false]]);
        const mixed = panelIntervals(0, 4.4, [.5, 1, .7], 0);
        expect(mixed.filter(c => c.full).map(c => c.width)).toEqual([.5, 1, .7, .5, 1, .7]);
        // An end within half a seam of a boundary keeps its whole cell.
        const snapped = panelIntervals(1.002, 2.998, [1], 0, .006);
        expect(snapped).toEqual([{ a: 1, b: 2, width: 1, full: true }, { a: 2, b: 3, width: 1, full: true }]);
    });

    it('merges clipped slivers below the minimum column into their neighbour', () => {
        const cells = panelCells({ pitch: [1], phase: 'grid', minColumn: .3, seam: .006 }, .9, 3.2, 0);
        expect(cells.map(c => [c.a, c.b, c.full])).toEqual([[.9, 2, false], [2, 3.2, false]]);
        const centred = panelCells({ pitch: [1], phase: 'centred', minColumn: .3, seam: .006 }, 0, 4.2, 0);
        expect(centred.map(c => +(c.b - c.a).toFixed(6))).toEqual([.6, 1, 1, 1, .6]);
    });
});

describe('panel walls', () => {
    it('keeps column pitch and phase for run lengths, rotations and both sides, never scaling a column across the run', () => {
        for (const name of ['A', 'C', 'R'] as const) {
            const spec = presets.get(name)!.system, pitch = spec.pitch[0]!;
            for (const length of [2.3, 5, 7.7]) for (const angle of [0, 37, 90]) for (const side of [1, -1] as const) for (const axis of ['H', 'V'] as const) {
                const face = recordingFace({ axis, side, angle, c: 3.25, height: 3, gridOrigin: .25 });
                const a = 1.1, b = a + length;
                placePanelSystem(face, spec, a, b, 0, 3);
                const columns = face.placements.filter(p => /-col\d+(x\d)?$/.test(p.module!));
                // A 2.3 m run can be all fill once its slivers merge; longer runs keep columns.
                if (length >= 5) expect(columns.length, `${name} ${length} ${angle}`).toBeGreaterThan(0);
                for (const p of columns) {
                    expect(p.scale).toEqual([1, 1, 1]);
                    const n = Number(/x(\d)$/.exec(p.module!)?.[1] ?? 1);
                    // A group of n cells is centred on a seam when n is even, on a cell centre when odd.
                    const phase = ((face.t(p) - .25 - (n % 2 ? pitch / 2 : 0)) / pitch);
                    expect(Math.abs(phase - Math.round(phase)), `${p.module} at ${face.t(p)}`).toBeLessThan(1e-6);
                }
                for (const p of face.placements.filter(p => /-top\d+(x\d)?$/.test(p.module!))) {
                    expect(p.scale[0]).toBe(1); expect(p.scale[2]).toBe(1);
                }
                // Skin reaches both run ends; between pieces only the seam shows.
                const extents = skins(face);
                expect(extents[0]![0]).toBeLessThanOrEqual(a + spec.seam / 2 + 1e-6);
                expect(extents.at(-1)![1]).toBeGreaterThanOrEqual(b - spec.seam / 2 - 1e-6);
                for (let i = 1; i < extents.length; i++) {
                    const gap = extents[i]![0] - extents[i - 1]![1];
                    if (gap > 1e-6) expect(gap).toBeLessThanOrEqual(spec.seam + 1e-6);
                }
                // Every vertex stays on the fragment and inside the wall depth.
                for (const p of face.placements) for (const v of placed(p, catalog.get(p.module!)!)) {
                    const [t, y, z] = local(face, v);
                    expect(t).toBeGreaterThanOrEqual(a - 1e-6); expect(t).toBeLessThanOrEqual(b + 1e-6);
                    expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeLessThanOrEqual(3 + 1e-6);
                    expect(z).toBeGreaterThanOrEqual(-1e-6); expect(z).toBeLessThanOrEqual(.12);
                }
            }
        }
    });

    it('groups up to four equal whole cells into one column and one top placement', () => {
        const spec = presets.get('A')!.system, face = recordingFace({ axis: 'H', side: 1, height: 3 });
        placePanelSystem(face, spec, 0, 6, 0, 3);
        const modules = face.placements.map(p => p.module);
        expect(modules).toEqual([spec.backing, groupOf(spec.column(1), 4), groupOf(spec.top(1), 4), pairOf(spec.column(1)), pairOf(spec.top(1))]);
        // The head band is the bare backing: nothing more stands on the run.
        const top = face.placements.find(p => p.module === pairOf(spec.top(1)))!;
        expect(top.position[1]).toBeCloseTo(spec.rows, 9);
        expect(top.scale[1] * .5).toBeCloseTo(3 - spec.rows - spec.head!.height, 9);
    });

    it('fills and edges the cells a hole cuts, fills the lintel whole and keeps the foot on the floor only', () => {
        const spec = edged.system, face = recordingFace({ axis: 'V', side: -1, angle: 37, height: 3 });
        // A door from 2.2 to 3.3 cut with its casing: two full-height fragments and a lintel.
        placePanelSystem(face, spec, 0, 2.2, 0, 3);
        placePanelSystem(face, spec, 2.2, 3.3, 2.58, 3);
        placePanelSystem(face, spec, 3.3, 7, 0, 3);
        const edges = face.placements.filter(p => p.module === spec.edge);
        // Cut cells at the door and the clipped cell at the far corner; the whole cell at 0 keeps its column's bevel.
        expect(edges.map(p => +face.t(p).toFixed(6)).sort()).toEqual([2.2 - EDGE_HALF, 3.3 + EDGE_HALF, 7 - EDGE_HALF].map(v => +v.toFixed(6)));
        const lintel = face.placements.filter(p => p.position[1] >= 2.58 - 1e-9 && p.module === spec.fill);
        expect(lintel).toHaveLength(1);
        const ts = placed(lintel[0]!, catalog.get(spec.fill)!).map(v => local(face, v)[0]);
        expect(Math.min(...ts)).toBeCloseTo(2.2, 9); expect(Math.max(...ts)).toBeCloseTo(3.3, 9);
        const feet = face.placements.filter(p => p.module === spec.foot!.module);
        expect(feet).toHaveLength(2);
        expect(feet.every(p => p.position[1] === 0)).toBe(true);
    });

    it('publishes one cove record per lens with the same id, building-local and colour-matched', () => {
        const spec = presets.get('R')!.system;
        const face = recordingFace({ axis: 'H', side: 1, angle: 12, height: 3.1, elevation: 7.2 });
        placePanelSystem(face, spec, 0, 4.4, 0, 3.1);
        placePanelSystem(face, spec, 5.3, 6.1, 0, 3.1);
        placePanelSystem(face, spec, 4.4, 5.3, 2.58, 3.1);
        const lenses = face.placements.filter(p => p.module!.startsWith('wall-light-line-'));
        expect(lenses).toHaveLength(2);
        expect(face.lights.map(l => l.id)).toEqual(lenses.map(p => p.id));
        for (const [i, light] of face.lights.entries()) {
            const lens = lenses[i]!, joint = spec.litJoints![0]!;
            expect(light.position[1]).toBeCloseTo(7.2 + spec.foot!.height, 6);
            expect(light.intensity).toBe(Math.round(light.length * joint.lumensPerMetre));
            expect(light.color).toEqual(joint.color);
            expect(lens.scale[0] * .5).toBeCloseTo(light.length, 3);
        }
        expect(catalog.get(spec.litJoints![0]!.module)!.mesh.materials()).toEqual(['cyberpunk/light-fixture/rich#loft-red']);
    });

    it('keeps sill and lintel fragments free of columns and skirting, heads only at the ceiling', () => {
        const spec = presets.get('A')!.system, face = recordingFace({ axis: 'H', side: 1, height: 3 });
        placePanelSystem(face, spec, 0, 2, 0, .9);
        expect(face.placements.map(p => p.module)).toEqual([spec.backing, spec.fill]);
        const lintel = recordingFace({ axis: 'H', side: 1, height: 3 });
        placePanelSystem(lintel, spec, 0, 2, 2.2, 3);
        expect(lintel.placements.map(p => p.module)).toEqual([spec.backing, spec.fill]);
        const fill = lintel.placements[1]!;
        expect(fill.position[1]).toBeCloseTo(2.2, 9); expect(fill.scale[1] * .5).toBeCloseTo(.8 - spec.head!.height, 9);
        // A stair wall runs past the ceiling: columns and tops, no head band.
        const stair = recordingFace({ axis: 'H', side: 1, height: 3.6, ceilingY: 3 });
        placePanelSystem(stair, spec, 0, 2, 0, 3.6);
        // No head band: the tops run on to the storey.
        for (const p of stair.placements.filter(p => p.module === pairOf(spec.top(1)))) expect(p.scale[1] * .5).toBeCloseTo(3.6 - spec.rows, 9);
        expect(stair.placements.some(p => p.module === pairOf(spec.column(1)))).toBe(true);
    });

    it('names every piece for pocket carving and numberplates, and keeps lenses on the fixture prefix', () => {
        for (const { system } of presets.values()) {
            const face = recordingFace({ axis: 'H', side: 1, height: 3 });
            placePanelSystem(face, system, 0, 4.3, 0, 3);
            for (const p of face.placements) {
                if (p.module!.startsWith('wall-light-line-')) continue;
                expect(p.module).toMatch(/^wall-(field|panel|meridian)/);
            }
            const mounts = face.placements.filter(p => SKIN.test(p.module!) && !/glass|mirror|backing|skirting|line|light/.test(p.module!));
            expect(mounts.some(p => p.position[1] <= 1.59 && p.position[1] + bounds(catalog.get(p.module!)!).max[1] * p.scale[1] >= 1.73)).toBe(true);
        }
    });
});

describe('panel modules', () => {
    it('faces every column surface outward: the front, the rounded edge and the seam gaps read from the room', () => {
        const spec = presets.get('A')!.system, k = catalog.get(spec.column(1))!, meshes: Mesh[] = [];
        for (const slot of k.mesh.materials()) {
            const g = k.mesh.getGroup(slot)!, geometry = new BufferGeometry();
            geometry.setAttribute('position', new Float32BufferAttribute(g.positions, 3)); geometry.setIndex(Array.from(g.indices));
            const material = new MeshBasicMaterial({ side: FrontSide }); material.name = slot; meshes.push(new Mesh(geometry, material));
        }
        const hit = (from: number[], to: number[]) => new Raycaster(new Vector3(...from), new Vector3(...to).sub(new Vector3(...from)).normalize())
            .intersectObjects(meshes, false)[0];
        const half = (1 - spec.seam) / 2;
        // Straight on: the panel face at the front datum.
        expect(hit([.1, .6, 1], [.1, .6, 0])!.point.z).toBeCloseTo(.095, 6);
        // Grazing from the side: the vertical edge, inside the cell.
        const side = hit([2, .6, .088], [0, .6, .088])!;
        expect(side.point.x).toBeLessThanOrEqual(half + 1e-6); expect(side.point.x).toBeGreaterThan(half - .011);
        // Into the 1.2 m seam: the recessed seam strip, not a hole.
        const seam = hit([.1, 1.2, 1], [.1, 1.2, 0])!;
        expect(seam.point.z).toBeLessThan(.093);
        expect(((seam.object as Mesh).material as MeshBasicMaterial).name).toBe(presets.get('A')!.profile.seams[0]!.slot);
    });

    it('resolves every material slot in the theme', () => {
        const library = loadTheme('cyberpunk')!.library;
        for (const [id, k] of catalog) if (id !== 'wall-field-meridian-backing')
            for (const slot of k.mesh.materials()) {
                const [key, variant] = slot.split('#');
                expect(library.entry(key!)?.variants.some(v => v.id === variant), `${id} ${slot}`).toBe(true);
            }
    });

    it('stays inside the triangle and byte budget per column and per kind', async () => {
        for (const [name, preset] of presets) {
            const own = kits(preset.recipes);
            let bytes = 0;
            for (const [id, k] of own) {
                // At most 400 triangles per column cell a module holds.
                const limit = 400 * Number(/x(\d)$/.exec(id)?.[1] ?? 1);
                expect(triangles(k), id).toBeLessThanOrEqual(limit);
                bytes += await glbBytes(k);
            }
            // Every module of a panel system together, per style.
            expect(bytes, name).toBeLessThan(80_000);
            const column = own.get(preset.system.column(preset.system.pitch[0]!))!;
            const box = bounds(column);
            expect(box.max[0] - box.min[0]).toBeCloseTo(preset.system.pitch[0]! - preset.system.seam, 6);
            expect(box.max[1]).toBeLessThanOrEqual(preset.system.rows + .1);
            expect(box.min[2]).toBeGreaterThanOrEqual(0); expect(box.max[2]).toBeLessThanOrEqual(.1);
        }
    }, 30000);
});
