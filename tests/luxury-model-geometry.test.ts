import { expect, it } from 'vitest';
import { MeshBuilder } from '../src/glb/mesh-builder.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { moduleRecipes } from '../src/modules/recipes.js';

it('keeps indexed surface triangles, smooth normals and physical UV scale', () => {
  const mesh = new MeshBuilder(undefined, null, () => [4, 2]);
  mesh.addSurface('test', {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    normals: [0, 0, 1, .6, 0, .8, 0, .6, .8],
    uvs: [0, 0, 1, 0, 0, 1], indices: [0, 1, 2],
  });
  const result = mesh.getGroup('test')!;
  expect(result.indices).toEqual([0, 1, 2]);
  expect(result.normals).toEqual([0, 0, 1, .6, 0, .8, 0, .6, .8]);
  expect(result.uvs).toEqual([0, 0, 4, 0, 0, 2]);
});

it('copies every authored triangle into placement clearance without reconstructing quads', () => {
  const source = moduleRecipes().find(recipe => recipe.id === 'fit-kitchen-run-luxury')!;
  const builder = new PlacementBuilder();
  builder.module(source.id, 'kitchen', [3, 2, 1], [1.2, .9, .8], Math.PI / 3);
  for (const slot of source.mesh.materials()) {
    const original = source.mesh.getGroup(slot)!, placed = builder.mesh.getGroup(slot)!;
    expect(Array.from(placed.indices)).toEqual(Array.from(original.indices));
    expect(placed.positions.length).toBe(original.positions.length);
    expect([...placed.positions, ...placed.normals].every(Number.isFinite)).toBe(true);
    for (let i = 0; i < placed.normals.length; i += 3) {
      expect(Math.hypot(...Array.from(placed.normals.slice(i, i + 3)))).toBeCloseTo(1, 5);
    }
  }
});
