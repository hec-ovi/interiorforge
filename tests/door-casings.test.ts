import { expect, it } from 'vitest';
import { moduleRecipes } from '../src/modules/recipes.js';

it('keeps every styled casing inside the same consumer collision envelope', () => {
  const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
  for (const family of ['luxury', 'capsule', 'damaged', 'industrial']) {
    const jamb = recipes.get(`door-jamb-${family}`)!;
    const header = recipes.get(`door-header-${family}`)!;
    expect(jamb.size).toEqual([.08, .5, .2]);
    expect(jamb.origin.map(n => n || 0)).toEqual([.04, 0, .1]);
    expect(header.size).toEqual([.5, .08, .2]);
    expect(header.origin.map(n => n || 0)).toEqual([.25, 0, .1]);
    // Both faces must carry finish geometry, not just a detailed front and black back.
    for (const recipe of [jamb, header]) {
      const slots = recipe.mesh.materials();
      expect(slots.length).toBeGreaterThan(1);
      for (const face of [-.1, .1]) expect(slots.slice(1).some(slot => {
        const p = recipe.mesh.getGroup(slot)!.positions;
        return p.some((n, i) => i % 3 === 2 && Math.abs(n - face) < 1e-6);
      })).toBe(true);
    }
    // Vary only straight lengths: width and height of the passage stay untouched,
    // including a broad lobby portal and a lower service-room door.
    for (const [width, height] of [[.9, 2.1], [1.5, 2.5], [4, 3.5]]) {
      for (const [recipe, x, y, sx, sy] of [
        [jamb, -width! / 2 - .04, 0, 1, height! / .5],
        [jamb, width! / 2 + .04, 0, 1, height! / .5],
        [header, 0, height!, (width! + .16) / .5, 1],
      ] as const) {
        for (const slot of recipe.mesh.materials()) {
          const p = recipe.mesh.getGroup(slot)!.positions;
          for (let i = 0; i < p.length; i += 3) {
            const px = p[i]! * sx + x, py = p[i + 1]! * sy + y;
            expect(Math.abs(px) >= width! / 2 - 1e-6 || py >= height! - 1e-6).toBe(true);
          }
        }
      }
    }
  }
});

it('preserves the named Exterior door-frame collider split and clear passage', () => {
  const frame = moduleRecipes().find(recipe => recipe.id === 'door-frame')!;
  expect(frame.size).toEqual([1.16, 2.58, .14]);
  expect(frame.origin.map(n => n || 0)).toEqual([.58, 0, .07]);
  for (const slot of frame.mesh.materials()) {
    const p = frame.mesh.getGroup(slot)!.positions;
    for (let i = 0; i < p.length; i += 3) {
      expect(Math.abs(p[i]!) >= .5 - 1e-6 || p[i + 1]! >= 2.5 - 1e-6).toBe(true);
    }
  }
});
