import { expect, it } from 'vitest';
import { PlacementBuilder } from '../src/placements/builder.js';
import { slabs } from '../src/placements/surfaces.js';
import { makeFrame } from '../src/layout/uv.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { roomFinish } from '../src/placements/finish.js';
import { architectureFinish } from '../src/architecture/recipes.js';
import { makePlacementFixture } from '../src/index.js';
import { tileScale } from '../src/modules/index.js';
import { loadTheme } from '../src/materials/load.js';
import { MERIDIAN_STONE, MERIDIAN_MINERAL, MERIDIAN_IVORY } from '../src/styles/luxury/surfaces.js';

it('lays large metric slabs at the true floor with physical joints over continuous support', () => {
  const b = new PlacementBuilder();
  slabs(b, 'floor-slab-meridian-stone', 'lobby', {u: 0, v: 0, lu: 8, lv: 6}, 0, makeFrame(0));
  const support = b.placements.filter(p => p.module === 'floor-slab-meridian-support');
  const pieces = b.placements.filter(p => p.module === 'floor-finish-meridian-stone');
  expect(support).toHaveLength(1);
  expect(support[0]!.scale).toEqual([16, 1, 12]);
  expect(pieces).toHaveLength(16);
  for (const p of pieces) {
    expect(p.position[1]).toBe(0);
    expect(p.scale[0] * .5).toBeCloseTo(1.997, 6);
    expect(p.scale[2] * .5).toBeCloseTo(1.497, 6);
    expect(p.uvRepeat).toEqual([p.scale[0], p.scale[2]]);
  }
  const modules = new Map(moduleRecipes().map(r => [r.id, r]));
  const backing = modules.get('floor-slab-meridian-support')!;
  expect(backing.origin[1]).toBe(.15);
  expect(backing.size[1]).toBe(.148);
  expect(modules.get('floor-finish-meridian-stone')!.origin[1]).toBe(.018);
  expect(modules.get('floor-finish-meridian-stone')!.size[1]).toBe(.018);
  const library = loadTheme('cyberpunk')!.library;
  const [ivoryKey, ivoryVariant] = MERIDIAN_IVORY.split('#');
  expect(library.entry(ivoryKey!)?.variants.some(v => v.id === ivoryVariant)).toBe(true);
  const scale = tileScale(library.themeIndex);
  expect(scale(MERIDIAN_STONE)).toEqual([.5, .5]);
  expect(scale(MERIDIAN_MINERAL)).toEqual([.5, .5]);
  expect(scale(MERIDIAN_IVORY)).toEqual([1, 1]);
});

it('keeps balcony public stone, private timber and wet-room finishes without glowing wall frames', () => {
  const request = makePlacementFixture({width: 40, depth: 40, floors: 3, type: 'residential', tier: 'high_rich'});
  request.blueprint.assembly = {architecture: 'balcony-grid'};
  for (const [room, floor] of [['reception', 'floor-slab-meridian-stone'], ['bedroom', 'floor-slab-plank'], ['bathroom', 'floor-slab-marble'], ['elevator_lobby', 'floor-slab-meridian-stone'], ['mechanical_room', 'floor-slab-industrial']] as const) {
    const finish = architectureFinish(request, 'luxury', room, roomFinish('luxury', room, 'apartment'));
    expect(finish.floor).toBe(floor);
    expect(finish.frame).toBeUndefined();
    expect(finish.field).toBe(room === 'bathroom' ? 'wall-field-slate' : ['elevator_lobby', 'mechanical_room'].includes(room) ? 'wall-field-meridian-mineral' : 'wall-field-meridian-ivory');
  }
});
