import { describe, expect, it } from 'vitest';
import { loadAssetCatalog } from '../src/assets/catalog.js';
import type { FloorInterior, Furniture } from '../src/core/types.js';
import { placementRecipe } from '../src/placements/builder.js';
import { dressFloor } from '../src/placements/dressing.js';
import type { Placement } from '../src/placements/types.js';
import { ASSEMBLIES } from '../src/styles/reference/registry.js';
import { placeAssembly } from '../src/styles/systems/assembly.js';
import { FreeBuilder } from './built-ins-harness.js';

const ALL_MODELS = { present: new Set(loadAssetCatalog().assets.map(asset => asset.id)), missing: new Set<string>() };

function kitchen(extra: Furniture[] = [], polygon: [number, number][] = [[-4, -3], [4, -3], [4, 3], [-4, 3]]) {
  const floor = { floor: 3, kind: 'apartment', elevation: 0, height: 3.6, ceilingElevation: 3, coreAngleDeg: 0, core: {}, openingReservations: [],
    rooms: [{ id: 'room', kind: 'kitchen', polygon, doors: [] }], furniture: [], lights: [] } as unknown as FloorInterior;
  const builder = new FreeBuilder();
  const records: Furniture[] = [
    { id: 'wall', kind: 'kitchen_block', room: 'room', position: [0, -2.675], rotationDeg: 0, size: [3.6, .65, 3], fit: 'asm-e1-kitchen' },
    { id: 'island', kind: 'bar_counter', room: 'room', position: [0, 0], rotationDeg: 0, size: [2.2, .9, .95], fit: 'asm-e1-island' },
    ...extra,
  ];
  for (const record of records) {
    floor.furniture.push(record);
    if (record.fit?.startsWith('asm-')) placeAssembly(builder, floor, record, ASSEMBLIES.get(record.fit)!, 3);
    else builder.module(record.fit!, 'room', [record.position[0], 0, record.position[1]], [1, 1, 1], record.rotationDeg * Math.PI / 180, { id: record.id });
  }
  return { floor, builder };
}

const size = (p: Placement): [number, number, number] => {
  if (p.module) { const r = placementRecipe(p.module)!; return [r.size[0], r.size[2], r.size[1]]; }
  return loadAssetCatalog().assets.find(a => a.id === p.prop)!.dimensionsMeters!;
};

describe('dressing pass', () => {
  it('stands things on the worktop between the cut-outs, a coffee machine once, and stools at the island front', () => {
    const { floor, builder } = kitchen();
    const before = builder.placements.length;
    const added = dressFloor(builder, floor, { seed: 'test', models: ALL_MODELS, tier: 'high_rich' });
    expect(builder.placements.length).toBe(before + added.length);
    const onWorktop = added.filter(p => p.position[2] < -2.3);
    expect(onWorktop.length).toBeGreaterThanOrEqual(2);
    // Everything on the wall stands on the worktop, never on the hob or in the bowl.
    const cuts = builder.placements.filter(p => /kitchen-top-(sink|hob)$/.test(p.module ?? ''));
    for (const p of onWorktop) {
      expect(p.position[1]).toBeCloseTo(.9, 3);
      const [w] = size(p);
      for (const cut of cuts) expect(Math.abs(p.position[0] - cut.position[0]) >= .3 + w / 2 - 1e-6 - .06).toBe(true);
    }
    expect(added.filter(p => p.module === 'decor-coffee-machine')).toHaveLength(1);
    // The island top takes something, and stools stand at its front, clear of it.
    const onIsland = added.filter(p => Math.abs(p.position[2]) < .45 && p.position[1] > .9);
    expect(onIsland.length).toBeGreaterThanOrEqual(1);
    const stools = added.filter(p => p.module === 'fit-bar-stool-e1');
    expect(stools.length).toBe(3);
    for (const stool of stools) expect(stool.position[2]).toBeGreaterThan(.45 + .1);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const run = (seed: string) => { const { floor, builder } = kitchen(); return dressFloor(builder, floor, { seed, models: ALL_MODELS, tier: 'high_rich' }); };
    const pick = (list: Placement[]) => list.map(p => `${p.module ?? p.prop}@${p.position.join(',')}`);
    expect(pick(run('a'))).toEqual(pick(run('a')));
    expect(pick(run('a'))).not.toEqual(pick(run('b')));
  });

  it('keeps stools out of a room too narrow for them and off other furniture', () => {
    const tight = kitchen([], [[-4, -3], [4, -3], [4, .8], [-4, .8]]);
    expect(dressFloor(tight.builder, tight.floor, { seed: 'test', models: ALL_MODELS }).filter(p => p.module?.startsWith('fit-bar-stool'))).toHaveLength(0);
    const blocked = kitchen([{ id: 'sofa', kind: 'sofa', room: 'room', position: [0, 1.2], rotationDeg: 0, size: [2.8, 1, .9], fit: 'fit-sofa-corpo' }]);
    expect(dressFloor(blocked.builder, blocked.floor, { seed: 'test', models: ALL_MODELS }).filter(p => p.module?.startsWith('fit-bar-stool'))).toHaveLength(0);
  });

  it('leaves a shelf\'s baked books alone and stands nothing inside another piece', () => {
    const { floor, builder } = kitchen([{ id: 'books', kind: 'shelf', room: 'room', position: [3.7, 1], rotationDeg: 270, size: [1.8, .5, 2], fit: 'fit-bookcase-luxury' }]);
    const added = dressFloor(builder, floor, { seed: 'shelf', models: ALL_MODELS, tier: 'rich' });
    const shelf = builder.placements.find(p => p.id === 'books')!;
    const recipe = placementRecipe('fit-bookcase-luxury')!;
    const onShelf = added.filter(p => p.id.startsWith('books/'));
    for (const p of onShelf) {
      // Local position on the bookcase, and the piece's own box: no bookcase triangle crosses it.
      const dx = p.position[0] - shelf.position[0], dz = p.position[2] - shelf.position[2], c = Math.cos(shelf.rotationY), s = Math.sin(shelf.rotationY);
      const x = dx * c - dz * s, z = dx * s + dz * c, y = p.position[1], [w, d, h] = size(p);
      for (const slot of recipe.mesh.materials()) {
        const g = recipe.mesh.getGroup(slot)!;
        for (let t = 0; t < g.indices.length; t += 3) {
          const v = [0, 1, 2].map(k => g.indices[t + k]!).map(i => [g.positions[3 * i]!, g.positions[3 * i + 1]!, g.positions[3 * i + 2]!]);
          const min = [0, 1, 2].map(a => Math.min(...v.map(q => q[a]!))), max = [0, 1, 2].map(a => Math.max(...v.map(q => q[a]!)));
          const hit = max[1]! > y + .003 && min[1]! < y + h && max[0]! > x - w / 2 && min[0]! < x + w / 2 && max[2]! > z - d / 2 && min[2]! < z + d / 2;
          expect(hit, `${p.module ?? p.prop} at ${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`).toBe(false);
        }
      }
    }
  });

  it('stands nothing behind a bookcase\'s baked books, where it would show over them and never be reached', () => {
    const { floor, builder } = kitchen([{ id: 'case', kind: 'shelf', room: 'room', position: [-3.7, 1], rotationDeg: 90, size: [1.8, .5, 2], fit: 'fit-sandra-bookcase' }]);
    const added = dressFloor(builder, floor, { seed: 'case', models: ALL_MODELS, tier: 'rich' });
    const shelf = builder.placements.find(p => p.id === 'case')!, recipe = placementRecipe('fit-sandra-bookcase')!;
    const onShelf = added.filter(p => p.id.startsWith('case/'));
    expect(onShelf.length).toBeGreaterThan(0);
    for (const p of onShelf) {
      const dx = p.position[0] - shelf.position[0], dz = p.position[2] - shelf.position[2], c = Math.cos(shelf.rotationY), s = Math.sin(shelf.rotationY);
      const x = dx * c - dz * s, z = dx * s + dz * c, y = p.position[1], [w, d, h] = size(p);
      for (const slot of recipe.mesh.materials()) {
        const g = recipe.mesh.getGroup(slot)!;
        for (let t = 0; t < g.indices.length; t += 3) {
          const v = [0, 1, 2].map(k => g.indices[t + k]!).map(i => [g.positions[3 * i]!, g.positions[3 * i + 1]!, g.positions[3 * i + 2]!]);
          const min = [0, 1, 2].map(a => Math.min(...v.map(q => q[a]!))), max = [0, 1, 2].map(a => Math.max(...v.map(q => q[a]!)));
          // Nothing of the bookcase between the piece and the front, at the piece's height.
          const hidden = max[1]! > y + .003 && min[1]! < y + h && max[0]! > x - w / 2 && min[0]! < x + w / 2 && max[2]! > z - d / 2;
          expect(hidden, `${p.module ?? p.prop} at ${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`).toBe(false);
        }
      }
    }
  });

  it('dresses a poor home from the plain list and holds a floor to its cap', () => {
    const { floor, builder } = kitchen();
    const plain = dressFloor(builder, floor, { seed: 'poor', models: ALL_MODELS, tier: 'poor' });
    const rich = new Set(['decor-coffee-machine', 'polyhaven-marble-bust-01', 'polyhaven-horse-head', 'decor-knife-block']);
    expect(plain.some(p => rich.has(p.module ?? p.prop ?? ''))).toBe(false);
    const many = kitchen(Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, kind: 'low_table', room: 'room', position: [-3.5 + (i % 10) * .75, -1.2 + Math.floor(i / 10) * .5], rotationDeg: 0, size: [1.6, .9, .4], fit: 'fit-low-table-luxury' }) as Furniture));
    expect(dressFloor(many.builder, many.floor, { seed: 'cap', models: ALL_MODELS }).length).toBeLessThanOrEqual(140);
  });
});
