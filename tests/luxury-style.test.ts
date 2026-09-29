import { expect, it } from 'vitest';
import { createRng } from '../src/core/rng.js';
import { fitLuxuryGroup } from '../src/layout/luxury/fit.js';
import recipes from '../src/layout/luxury/recipes.json' with { type: 'json' };
import type { LuxuryGroup } from '../src/layout/luxury/schema.js';
import { Kit } from '../src/modules/kit.js';
import { luxuryFurnitureRecipes } from '../src/styles/luxury/modules.js';
import { LUXURY_REFERENCE_FITS } from '../src/styles/luxury/profile.js';
import { generate, makePlacementFixture, type PlacementResult } from '../src/index.js';
import { templateSwitch } from '../src/layout/templates/registry.js';
import { assembly } from './fixtures.js';

it('keeps authored luxury furniture geometry inside the reserved width/depth and on the floor', () => {
  const fits = new Map(Object.values(LUXURY_REFERENCE_FITS).map(f => [f.module, f]));
  luxuryFurnitureRecipes((id, draw) => {
    const k = new Kit(() => [1, 1]); draw(k); k.mesh.seal();
    const [w, d] = fits.get(id)!.size;
    let floor = Infinity, ceiling = -Infinity;
    for (const slot of k.mesh.materials()) {
      const group = k.mesh.getGroup(slot)!;
      for (let i = 0; i < group.positions.length; i += 3) {
        const [x, y, z] = group.positions.slice(i, i + 3) as [number, number, number];
        expect(Math.abs(x), `${id} ${slot} x`).toBeLessThanOrEqual(w / 2 + 1e-6);
        expect(Math.abs(z), `${id} ${slot} z`).toBeLessThanOrEqual(d / 2 + 1e-6);
        expect(Number.isFinite(y), id).toBe(true);
        floor = Math.min(floor, y); ceiling = Math.max(ceiling, y);
      }
    }
    expect(floor, id).toBeCloseTo(0, 6);
    expect(ceiling, id).toBeGreaterThan(0.35);
  });
});

it('keeps whole luxury groups out of the main circulation aisle at every quarter turn', () => {
  const bounds = { u: 0, v: 0, lu: 18.3, lv: 16.7 };
  const aisle = { u: 7.8, v: 0, lu: 2.7, lv: 16.7 };
  const overlaps = (a: typeof bounds, b: typeof bounds) => a.u < b.u + b.lu && a.u + a.lu > b.u && a.v < b.v + b.lv && a.v + a.lv > b.v;
  for (const kind of Object.keys(recipes) as LuxuryGroup[]) for (let seed = 0; seed < 16; seed++) {
    const input = { kind, bounds, rng: createRng(seed), accepts: (rect: typeof bounds) => !overlaps(rect, aisle) };
    const group = fitLuxuryGroup(input)!;
    expect(group, `${kind}/${seed}`).not.toBeNull();
    expect(overlaps(group.reservation, aisle)).toBe(false);
    expect(group).toEqual(fitLuxuryGroup({ ...input, rng: createRng(seed) }));
    for (const piece of group.pieces) {
      const [w, d] = piece.rotationDeg % 180 ? [piece.size[1], piece.size[0]] : piece.size;
      expect(piece.at[0] - w! / 2).toBeGreaterThanOrEqual(group.reservation.u - 1e-8);
      expect(piece.at[0] + w! / 2).toBeLessThanOrEqual(group.reservation.u + group.reservation.lu + 1e-8);
      expect(piece.at[1] - d! / 2).toBeGreaterThanOrEqual(group.reservation.v - 1e-8);
      expect(piece.at[1] + d! / 2).toBeLessThanOrEqual(group.reservation.v + group.reservation.lv + 1e-8);
    }
  }
});

it.each([40, 64])('generates a complete luxury shell at %im with a furnished lobby and real vertical connectors', async width => {
  const request = await assembly('mirror-frame', { width, depth: width, floors: 5 });
  request.building.tier = 'high_rich';
  const result = await generate(request);
  expect(result.building.floors).toHaveLength(5);
  expect(result.layouts.ground!.floor.furniture.some(p => p.kind === 'reception_desk')).toBe(true);
  expect(result.layouts.ground!.floor.core.stairs.length).toBeGreaterThan(0);
  expect(result.layouts.ground!.floor.core.elevators.length).toBeGreaterThan(0);
  expect(result.layouts.ground!.placements.some(p => p.module === 'fit-reception-desk-luxury')).toBe(true);
  const modules = Object.values(result.layouts).flatMap(l => l.placements.map(p => p.module));
  expect(modules).toContain('fit-bed-luxury');
}, 120000);

it('adapts the same luxury groups to a dynamic 60m interior plate', async () => {
  const result = await generate(makePlacementFixture({ width: 60, depth: 60, floors: 4, type: 'residential', tier: 'high_rich', seed: 'luxury-sixty' }));
  expect(result.building.floors).toHaveLength(4);
  expect(result.layouts.ground!.placements.some(p => p.module === 'fit-reception-desk-luxury')).toBe(true);
  expect(Object.values(result.layouts).some(l => l.placements.some(p => p.module === 'fit-bed-luxury'))).toBe(true);
}, 120000);


it('furnishes every bedroom in the six-floor translated luxury review shell', async () => {
  const { generate: generateExterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = await generateExterior({ buildingId: 'p0', seed: 'luxury-reference-review',
    parcel: { footprint: [[81.5, 34], [121.5, 34], [121.5, 74], [81.5, 74]],
      accessPoint: [101.5, 34], maxHeight: 31.5,
      buildingGrid: { origin: [81.5, 34], angle: 0, spacing: 0.5 } },
    building: { type: 'residential', tier: 'high_rich', floors: 6 },
    theme: 'cyberpunk', options: { architecture: 'mirror-frame', glb: 'merged' } }, { textures: { mode: 'keys' } });
  // Kind A homes now take the reference apartments with their own beds; the full luxury bed is the generic program they fall back to.
  templateSwitch.enabled = false;
  let result: PlacementResult;
  try {
    result = await generate({ seed: 'luxury-reference-review', building: { id: 'p0', type: 'residential', tier: 'high_rich' },
      blueprint, materialTheme: 'cyberpunk' });
  } finally {
    templateSwitch.enabled = true;
  }
  // The residential arrival seats its waiting bays in the lounges beside the reception.
  const arrival = new Set(result.layouts.ground!.floor.rooms.filter(room => room.kind === 'reception' || room.kind === 'lounge').map(room => room.id));
  const receptionFurniture = result.layouts.ground!.floor.furniture.filter(piece => arrival.has(piece.room));
  // A few waiting bays leave the arrival/core routes readable; floor area alone
  // must not turn the narrow arms of the lobby into repeated sofa islands.
  expect(receptionFurniture.filter(piece => piece.kind === 'sofa').length).toBeGreaterThanOrEqual(2);
  expect(receptionFurniture.filter(piece => piece.kind === 'sofa').length).toBeLessThanOrEqual(4);
  expect(receptionFurniture.filter(piece => piece.kind === 'reception_desk')).toHaveLength(1);
  let bedrooms = 0;
  for (const [layoutId, layout] of Object.entries(result.layouts)) {
    if (layout.floor.kind === 'apartment' || layout.floor.kind === 'residence_studio') {
      expect(layout.floor.rooms.some(room => room.kind === 'bedroom'), `${layoutId} keeps its residential bedrooms`).toBe(true);
    }
    for (const room of layout.floor.rooms.filter(room => room.kind === 'bedroom')) {
      bedrooms++;
      const beds = layout.floor.furniture.filter(piece => piece.room === room.id && piece.kind === 'bed_double');
      expect(beds, `${layoutId}/${room.id} needs its full-size bed`).toHaveLength(1);
      expect(beds[0]!.size.slice(0, 2)).toEqual([2, 2.3]);
      expect(layout.placements.find(piece => piece.id === beds[0]!.id)?.module).toBe('fit-bed-luxury');
      expect(layout.npc.anchors.some(anchor => anchor.room === room.id && anchor.kind === 'bed')).toBe(true);
    }
  }
  // Larger lift/stair cores can change dwelling count; every bedroom that the
  // resulting dynamic floor actually contains must still receive its full bed.
  expect(bedrooms).toBeGreaterThan(0);
}, 120000);
