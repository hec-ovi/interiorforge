import { expect, it } from 'vitest';
import type { FloorInterior, Furniture } from '../src/core/types.js';
import type { UvFloorData } from '../src/layout/plan-floor.js';
import { loadAssetCatalog } from '../src/assets/catalog.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { props } from '../src/placements/props.js';
import { LUXURY_PLANT_FRAMES } from '../src/styles/luxury/accessories.js';
import { LUXURY_PLANT_ASSET, placeLuxuryPlants } from '../src/styles/luxury/catalog-fits.js';

const plant = loadAssetCatalog().assets.find(asset => asset.id === LUXURY_PLANT_ASSET)!;
const frames = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));

it('keeps frame and naturally scaled source plants inside each reservation at every rotation', () => {
  for (const [kind, frame] of Object.entries(LUXURY_PLANT_FRAMES)) for (const angle of [0, 37, 90, 180, 271]) {
    const item: Furniture = { id: kind, kind: kind as Furniture['kind'], room: 'lobby', position: [7, 13], rotationDeg: angle, size: [...frame.size] };
    const builder = new PlacementBuilder(), presence = { present: new Set([plant.id]), missing: new Set<string>() };
    expect(placeLuxuryPlants(builder, item, presence)).toBe(true);
    expect(builder.placements[0]!.id).toBe(item.id);
    const module=kind==='room_divider'?'fit-bamboo-screen-corpo':kind==='ornament_wall'?'fit-bamboo-wall-corpo':frame.module;
    expect(builder.placements[0]!.module).toBe(module);
    expect(builder.placements.filter(p => p.prop)).toHaveLength(kind==='plant'?frame.plants.length:0);
    const radians = angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
    for (const slot of builder.mesh.materials()) {
      const group = builder.mesh.getGroup(slot)!;
      for (let i = 0; i < group.positions.length; i += 3) {
        const x = group.positions[i]! - 7, z = group.positions[i + 2]! - 13;
        expect(Math.abs(x * c - z * s)).toBeLessThanOrEqual(item.size[0] / 2 + 1e-5);
        expect(Math.abs(x * s + z * c)).toBeLessThanOrEqual(item.size[1] / 2 + 1e-5);
        expect(group.positions[i + 1]!).toBeGreaterThanOrEqual(-1e-6);
        expect(group.positions[i + 1]!).toBeLessThanOrEqual(item.size[2] + 1e-5);
      }
    }
    expect(frames.get(module)!.mesh.materials().some(slot => slot.includes('/light-fixture/'))).toBe(true);
    expect(presence.missing.size).toBe(0);
    for (const placement of builder.placements.filter(p => p.prop)) expect(new Set(placement.scale).size).toBe(1);
  }
});

function fixture(present: string[]) {
  const furniture: Furniture[] = [
    { id: 'plant', kind: 'plant', room: 'office', position: [0, 0], size: [.5, .5, 1.3], rotationDeg: 0 },
    { id: 'chair', kind: 'office_chair', room: 'office', position: [2, 0], size: [.65, .65, 1.15], rotationDeg: 180 },
    { id: 'desk', kind: 'desk', room: 'office', position: [4, 0], size: [1.6, .8, .75], rotationDeg: 0 },
    { id: 'books', kind: 'shelf', room: 'office', position: [6, 0], size: [1.8, .5, 2], rotationDeg: 0 },
    { id: 'parts', kind: 'shelf', room: 'service', position: [8, 0], size: [1.8, .5, 2], rotationDeg: 0 },
  ];
  const floor = { furniture: structuredClone(furniture), lights: [{ id: 'plant-light', furniture: 'plant' }, { id: 'books-light', furniture: 'books' }, { id: 'parts-light', furniture: 'parts' }] } as unknown as FloorInterior;
  const uv = { outline: [], rooms: [{ id: 'office', kind: 'office_private', rect: { u: 0, v: 0, lu: 10, lv: 10 }, doors: [] },
    { id: 'service', kind: 'mechanical_room', rect: { u: 10, v: 0, lu: 10, lv: 10 }, doors: [] }], sealed: [], carpets: [],
    furniture: furniture.map(f => ({ ...f, at: f.position })) } as UvFloorData;
  const builder = new PlacementBuilder(), presence = { present: new Set(present), missing: new Set<string>() };
  props(builder, floor, uv, 'luxury', presence);
  return { floor, builder, presence };
}

it('uses only reviewed present props, keeps furniture identities and modeled light records', () => {
  const ids = [plant.id, 'sketchfab-office-chair', 'sketchfab-elegant-black-office-desk'];
  const { floor, builder, presence } = fixture(ids);
  expect(builder.placements.find(p => p.id === 'chair')!.prop).toBe(ids[1]);
  expect(builder.placements.find(p => p.id === 'desk')!.prop).toBe(ids[2]);
  expect(builder.placements.find(p => p.id === 'books')!.module).toBe('fit-bookcase-luxury');
  expect(builder.placements.find(p => p.id === 'parts')!.module).toBe('fit-service-shelf-luxury');
  expect(floor.furniture).toHaveLength(5);
  expect(floor.lights).toHaveLength(3);
  expect([...presence.missing]).toEqual([]);
  for (const placement of builder.placements.filter(p => p.prop)) expect(ids).toContain(placement.prop);
});

it('retains built-in furniture when optional catalog models are absent', () => {
  const { floor, builder, presence } = fixture([]);
  expect(builder.placements.find(p => p.id === 'plant')!.module).toBe('fit-planter');
  expect(builder.placements.find(p => p.id === 'chair')!.module).toBe('fit-office-chair');
  expect(builder.placements.find(p => p.id === 'desk')!.module).toBe('fit-desk');
  expect(builder.placements.every(p => !p.prop)).toBe(true);
  expect(floor.furniture).toHaveLength(5);
  expect([...presence.missing]).toEqual([]);
});
