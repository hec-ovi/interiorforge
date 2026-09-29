import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Kit } from '../src/modules/kit.js';
import { luxuryBathroomRecipes, LUXURY_BATHROOM_SIZES, LUXURY_BATHROOM_MATERIALS } from '../src/styles/luxury/bathroom.js';
import { fitBathroomRecipe, overlaps } from '../src/layout/bathroom-recipe.js';
import { loadTheme } from '../src/materials/load.js';
import { createRng } from '../src/core/rng.js';
import { roomCoversRect } from '../src/layout/room-shape.js';
import type { PlanRoom } from '../src/layout/plan-types.js';

const recipes = new Map<string, Kit>();
luxuryBathroomRecipes((id, draw) => { const k = new Kit(() => [1, 1]); draw(k); recipes.set(id, k); });
function meshes(id: string, exclude: string[] = []): Mesh[] {
  const mesh = recipes.get(id)!.mesh;
  return mesh.materials().filter(key => !exclude.includes(key)).map(key => {
    const group = mesh.getGroup(key)!;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(group.positions, 3));
    geo.setIndex(Array.from(group.indices));
    return new Mesh(geo, new MeshBasicMaterial());
  });
}
function down(id: string, x: number, z: number): number {
  const hits = new Raycaster(new Vector3(x, 2.5, z), new Vector3(0, -1, 0)).intersectObjects(meshes(id));
  expect(hits.length).toBeGreaterThan(0);
  return hits[0]!.point.y;
}
it('has a real deep open vanity cutout, ceramic bowl and open toilet, without countertop filler', () => {
  expect(down('fit-basin-luxury', -.15, .035)).toBeLessThan(.725);
  expect(down('fit-basin-luxury', -.16, .19)).toBeGreaterThan(.87);
  expect(down('fit-basin-luxury', -.63, .05)).toBeCloseTo(.88, 5);
  expect(down('fit-toilet-luxury', .018, .07)).toBeLessThan(.30);
  expect(down('fit-toilet-luxury', .174, .064)).toBeGreaterThan(.45);
  expect(down('fit-toilet-luxury', .045, -.225)).toBeGreaterThan(.73);
  const lid = new Raycaster(new Vector3(0, .62, .3), new Vector3(0, 0, -1)).intersectObjects(meshes('fit-toilet-luxury'))[0]!;
  expect(lid.point.z).toBeCloseTo(-.118, 4);
});
it('has visible glass side walls and a usable 0.82m open shower entry', () => {
  const all = meshes('fit-shower-luxury');
  const entering = (x: number) => new Raycaster(new Vector3(x, 1.1, .8), new Vector3(0, 0, -1), 0, .35).intersectObjects(all);
  for (const x of [-.15, 0, .3, .57]) expect(entering(x)).toHaveLength(0);
  expect(entering(-.4).length).toBeGreaterThan(0);
  const glass = recipes.get('fit-shower-luxury')!.mesh.getGroup(LUXURY_BATHROOM_MATERIALS.glass)!;
  expect(glass.positions.length).toBeGreaterThan(100);
});
it('keeps every authored fixture inside its declared metric footprint with finite unit normals', () => {
  for (const [kind, id] of [['sink', 'fit-basin-luxury'], ['toilet', 'fit-toilet-luxury'], ['shower', 'fit-shower-luxury']] as const) {
    const k = recipes.get(id)!, size = LUXURY_BATHROOM_SIZES[kind];
    for (const key of k.mesh.materials()) {
      const g = k.mesh.getGroup(key)!;
      for (let i = 0; i < g.positions.length; i += 3) {
        expect(Math.abs(g.positions[i]!)).toBeLessThanOrEqual(size[0] / 2 + 1e-6);
        expect(Math.abs(g.positions[i + 2]!)).toBeLessThanOrEqual(size[1] / 2 + 1e-6);
        expect(Math.hypot(g.normals[i]!, g.normals[i + 1]!, g.normals[i + 2]!)).toBeCloseTo(1, 4);
      }
    }
  }
});
it.each([[3.5, 3.5], [3, 3.5]])('fits a complete usable bathroom inside %sm x %sm gross shell', (width, depth) => {
  const room: PlanRoom = { id: 'bath', kind: 'bathroom', rect: { u: 0, v: 0, lu: width, lv: depth }, doors: [] };
  const sizes = Object.fromEntries(Object.entries(LUXURY_BATHROOM_SIZES).map(([k, v]) => [k, [...v]])) as Record<'sink' | 'shower' | 'toilet', [number, number, number]>;
  const result = fitBathroomRecipe(room, sizes, createRng(14), fp => roomCoversRect(room, fp), fp => roomCoversRect(room, fp));
  expect(result).not.toBeNull();
  expect(result).toHaveLength(3);
  for (const a of result!) for (const b of result!) if (a !== b) expect(overlaps(a.operation, b.footprint)).toBe(false);
});

it('publishes every bathroom finish with a real catalog variant and restrained transparent glass', () => {
  const theme = loadTheme('cyberpunk');
  if (!theme) return;
  for (const k of recipes.values()) for (const slot of k.mesh.materials()) {
    const [key, variant] = slot.split('#'), entry = theme.library.entry(key!);
    expect(entry, slot).toBeDefined();
    expect(entry!.variants.some(v => v.id === variant), slot).toBe(true);
  }
  const glass = theme.library.entry(LUXURY_BATHROOM_MATERIALS.glass.split('#')[0]!)!;
  const mirror = theme.library.entry(LUXURY_BATHROOM_MATERIALS.mirror.split('#')[0]!)!;
  // The vanity and shower share the Corpo Plaza optics: clear glass and a polished,
  // opaque metal-backed mirror.
  expect(glass.physical!.transmission).toBe(1);
  expect(glass.physical!.roughnessFactor).toBeLessThanOrEqual(.05);
  expect(mirror.physical!.alphaMode).toBe('OPAQUE');
  expect(mirror.physical!.metallicFactor).toBe(1);
  expect(mirror.physical!.roughnessFactor).toBeLessThanOrEqual(.05);
});
