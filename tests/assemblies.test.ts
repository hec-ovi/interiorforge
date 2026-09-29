import { describe, expect, it } from 'vitest';
import { Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import type { FloorInterior, Furniture, Room } from '../src/core/types.js';
import { createDocument } from '../src/glb/io.js';
import { makeFrame } from '../src/layout/uv.js';
import { loadTheme } from '../src/materials/load.js';
import { placeAssembly } from '../src/styles/systems/assembly.js';
import { placeHousings } from '../src/styles/systems/housing.js';
import { kitchenBayRoles, kitchenLayout } from '../src/styles/systems/kitchen-wall.js';
import { plantedBays } from '../src/styles/systems/planter.js';
import {
  BUILT_INS_A, BUILT_INS_A_EXTRA, BUILT_INS_B, BUILT_INS_C, BUILT_INS_R, B3_BAR, C4_STALLS, E1_BAMBOO, E1_HOUSING_DOORS, E1_KITCHEN, R1_LIBRARY, C2_DUCT,
  assemblyRecipesA, assemblyRecipesAExtra, assemblyRecipesB, assemblyRecipesC, assemblyRecipesR,
} from '../src/styles/systems/reference-assemblies.js';
import { runLayout } from '../src/styles/systems/run.js';
import type { AssemblySpec, DressContext } from '../src/styles/systems/types.js';
import { FreeBuilder, buildSet, vertices, worldBox, type V3 } from './built-ins-harness.js';

const SETS = { A: assemblyRecipesA, 'A extra': assemblyRecipesAExtra, B: assemblyRecipesB, C: assemblyRecipesC, R: assemblyRecipesR };
const meshes = buildSet(...Object.values(SETS));
const ALL: Record<string, AssemblySpec> = { ...BUILT_INS_A.assemblies, ...BUILT_INS_A_EXTRA.assemblies, ...BUILT_INS_B.assemblies, ...BUILT_INS_C.assemblies, ...BUILT_INS_R.assemblies };
const ELEVATION = 7.2;

function floorOf(ceiling: number, extra: Partial<FloorInterior> = {}): FloorInterior {
  return { floor: 2, kind: 'apartment', elevation: ELEVATION, height: 3.6, ceilingElevation: ELEVATION + ceiling, coreAngleDeg: 0,
    core: {} as FloorInterior['core'], openingReservations: [], rooms: [], furniture: [], lights: [], ...extra } as FloorInterior;
}
function record(fit: string, size: V3, rotationDeg = 0, position: [number, number] = [0, 0], elevation?: number): Furniture {
  return { id: 'item-1', kind: 'kitchen_block', room: 'room-a', position, rotationDeg, size, fit, ...(elevation ? { elevation } : {}) } as Furniture;
}
function place(fit: string, size: V3, ceiling: number, rotationDeg = 0, floor = floorOf(ceiling)) {
  const builder = new FreeBuilder(), item = record(fit, size, rotationDeg);
  const lights = placeAssembly(builder, floor, item, ALL[fit]!, ceiling);
  return { builder, lights, item };
}
const tris = (placements: { module?: string }[]) => placements.reduce((s, p) => s + meshes.get(p.module!)!.triangles, 0);

describe('kitchen wall assembly', () => {
  it.each([[2.4, 3, .52, false], [3, 3, .26, true], [3.6, 4, .26, true], [4.2, 5, .26, true]])('fills a %s m run with %s fixed bays and a %s m filler (column: %s)', (w, n, fill, column) => {
    const layout = kitchenLayout(E1_KITCHEN, w);
    expect(layout.bays).toHaveLength(n);
    expect(layout.filler![1] - layout.filler![0]).toBeCloseTo(fill, 6);
    if (column) expect(layout.column![1] - layout.column![0]).toBeCloseTo(.9, 9);
    else expect(layout.column).toBeUndefined();
    expect(layout.bays.map(b => b.role)).toContain('sink');
    const { builder } = place('asm-e1-kitchen', [w, .65, 3], 3);
    const bays = builder.placements.filter(p => /kitchen-(door|drawers|display|sink-base)$/.test(p.module!));
    expect(bays).toHaveLength(n);
    // No bay, cut-out, tier, end, stack piece or screen is ever scaled.
    for (const p of builder.placements) {
      if (/-(door|drawers|display|end|top-sink|top-hob|upper-[ab]-\w+|column-(base|mid|step))$|wall-screen-/.test(p.module!))
        expect(p.scale, p.module).toEqual([1, 1, 1]);
      else expect(p.scale[2], p.module).toBe(1);
      if (/-(toe|filler|lens|upper-[ab])$|kitchen-top$/.test(p.module!)) expect(p.scale[1], p.module).toBe(1);
      if (/-column-top$/.test(p.module!)) expect(p.scale[0], p.module).toBe(1);
    }
  });

  it.each([2.6, 3, 3.4])('fits a %s m ceiling through the bulkhead and column top, never scaling a housing', ceiling => {
    const { builder } = place('asm-e1-kitchen', [3.6, .65, ceiling], ceiling);
    let top = -Infinity;
    for (const { v } of vertices(builder.placements, meshes)) top = Math.max(top, v[1]);
    expect(top).toBeCloseTo(ceiling, 6);
    const tiers = builder.placements.filter(p => /-upper-[ab]/.test(p.module!));
    expect(tiers.every(p => p.scale[1] === 1 && p.scale[2] === 1)).toBe(true);
    expect(tiers.filter(p => /-upper-[ab]-/.test(p.module!)).every(p => p.scale[0] === 1)).toBe(true);
    expect(new Set(tiers.map(p => p.module!.includes('upper-b')))).toEqual(new Set([false, true]));
    // The bulkhead closes whatever the tiers leave; a 2.6 m ceiling lowers the tiers to meet it.
    const bulkhead = builder.placements.find(p => p.module === 'fit-e1-kitchen-bulkhead');
    if (bulkhead) expect(worldBox(bulkhead, meshes).max[1]).toBeCloseTo(ceiling, 6);
    else expect(Math.max(...tiers.map(p => worldBox(p, meshes).max[1]))).toBeCloseTo(ceiling, 6);
  });

  it('stops under a room whose finished ceiling hangs lower than the floor ceiling', () => {
    const floor = floorOf(3.1, { rooms: [{ id: 'room-a', kind: 'kitchen', polygon: [[-3, -1], [3, -1], [3, 3], [-3, 3]], doors: [], ceilingDrop: .3 } as Room] });
    const { builder } = place('asm-e1-kitchen', [3.6, .65, 3.1], 3.1, 0, floor);
    let top = -Infinity;
    for (const { v } of vertices(builder.placements, meshes)) top = Math.max(top, v[1]);
    expect(top).toBeCloseTo(2.8, 6);
  });

  it('keeps a counter-height reservation under its top: no uppers, bulkhead or column', () => {
    const { builder, lights } = place('asm-b3-bar', [3.2, .7, 1.1], 3.1);
    let top = -Infinity, tap = -Infinity;
    for (const { p, v } of vertices(builder.placements, meshes)) {
      if (/top-sink$/.test(p.module!)) tap = Math.max(tap, v[1]); else top = Math.max(top, v[1]);
    }
    expect(top).toBeLessThanOrEqual(1.1 + 1e-6);
    // Only the tap stands over the worktop.
    expect(tap).toBeLessThanOrEqual(1.2);
    expect(lights).toHaveLength(0);
    expect(builder.placements.some(p => /upper|bulkhead|column/.test(p.module!))).toBe(false);
  });

  it('drops the set-back tier under a low ceiling and keeps the worktop clear', () => {
    const { builder } = place('asm-e1-kitchen', [3, .65, 2.4], 2.4);
    expect(builder.placements.some(p => p.module!.includes('upper-b'))).toBe(false);
    const lower = builder.placements.filter(p => p.module!.includes('upper-a'));
    expect(lower.length).toBeGreaterThan(0);
    for (const p of lower) expect(p.position[1]).toBeGreaterThanOrEqual(.9 + .45 - 1e-9);
  });

  it('publishes one cyan under-cabinet lens record per straight stretch, owned by the item', () => {
    const { builder, lights, item } = place('asm-e1-kitchen', [3.6, .65, 3], 3, 90);
    expect(lights).toHaveLength(1);
    expect(lights[0]).toMatchObject({ id: 'item-1-lens-0', furniture: item.id, kind: 'strip', facing: 'down', color: [.08, .78, 1] });
    expect(lights[0]!.position[1]).toBeCloseTo(ELEVATION + 1.9, 3);
    const lens = builder.placements.filter(p => p.module === E1_KITCHEN.uppers.underLens);
    expect(lens).toHaveLength(1);
    expect(lens[0]!.scale[0] * .5).toBeCloseTo(lights[0]!.length, 3);
  });

  it('turns the bay pattern so the sink stands under the window behind the run', () => {
    const w = 3.6, anchorX = -.3;
    const floor = floorOf(3, { openingReservations: [{ opening: 'w1', kind: 'window', position: [anchorX, -.33 - .2], angleDeg: 0, inward: [0, 1], width: 1.2, sill: .9, height: 1.4, depth: .2 }] });
    const { builder } = place('asm-e1-kitchen', [w, .65, 3], 3, 0, floor);
    const cut = builder.placements.find(p => p.module === 'fit-e1-kitchen-top-sink')!;
    expect(Math.abs(cut.position[0] - anchorX)).toBeLessThanOrEqual(E1_KITCHEN.bay / 2 + 1e-9);
    // The sink bay below it stands on door fronts.
    expect(builder.placements.some(p => p.module === E1_KITCHEN.base.bays.sink && Math.abs(p.position[0] - cut.position[0]) < 1e-9)).toBe(true);
    // The window stays open: no splash panel stands in front of it.
    const window = floor.openingReservations[0]!;
    for (const p of builder.placements.filter(p => p.module === E1_KITCHEN.backsplash.module)) {
      const half = p.scale[0] * .25;
      expect(p.position[0] + half <= anchorX - window.width / 2 + 1e-6 || p.position[0] - half >= anchorX + window.width / 2 - 1e-6).toBe(true);
    }
    expect(kitchenBayRoles(['drawers', 'door', 'sink', 'hob'], 2)).toEqual(['sink', 'hob']);
    expect(kitchenBayRoles(['sink', 'door', 'hob'], 3, 2)).toEqual(['door', 'hob', 'sink']);
  });

  it('stays inside its reservation: nothing behind the back edge, nothing over 5 mm past the front', () => {
    for (const [fit, size] of [['asm-e1-kitchen', [3.6, .65, 3]], ['asm-b3-bar', [3, .65, 3]], ['asm-e1-wardrobe', [2.7, .6, 3]], ['asm-e1-display', [1.4, .4, 3]],
      ['asm-e1-planter', [3, .4, .8]], ['asm-e1-island', [2.4, 1, 1.02]], ['asm-e1-bamboo', [1.2, .7, 3]], ['asm-r1-library', [2.4, .3, .9]],
      ['asm-c1-niche', [1.8, .38, 2.2]], ['asm-c4-stall', [2.7, 1.5, 2]], ['asm-b3-media', [3, .45, .6]], ['asm-e5-bar', [3.6, .45, 1.1]]] as const) {
      const { builder } = place(fit, [...size] as V3, 3);
      for (const { p, v } of vertices(builder.placements, meshes)) {
        expect(Math.abs(v[0]), `${fit} ${p.module} x`).toBeLessThanOrEqual(size[0] / 2 + 1e-6);
        expect(v[2], `${fit} ${p.module} back`).toBeGreaterThanOrEqual(-size[1] / 2 - 1e-6);
        // Foliage may lean a little over the trough front; nothing else passes the front edge.
        const spill = /-bay$/.test(p.module!) && /planter|bamboo/.test(p.module!) ? .12 : .005;
        expect(v[2], `${fit} ${p.module} front`).toBeLessThanOrEqual(size[1] / 2 + spill + 1e-6);
        expect(v[1], `${fit} ${p.module} floor`).toBeGreaterThanOrEqual(-1e-6);
      }
    }
  });

  it('keeps a 3.6 m kitchen wall under 16 k triangles and every part inside its budget', () => {
    const { builder } = place('asm-e1-kitchen', [3.6, .65, 3], 3);
    expect(tris(builder.placements)).toBeLessThanOrEqual(16000);
    for (const [id, built] of meshes) {
      if (/kitchen-(door|drawers|display|sink-base)$/.test(id)) expect(built.triangles, id).toBeLessThanOrEqual(1000);
      if (/kitchen-upper/.test(id)) expect(built.triangles, id).toBeLessThanOrEqual(4000);
      if (/kitchen-top(-ledge)?$/.test(id)) expect(built.triangles, id).toBeLessThanOrEqual(100);
      if (/kitchen-top-(sink|hob)(-ledge)?$/.test(id)) expect(built.triangles, id).toBeLessThanOrEqual(2000);
    }
    const leg = place('asm-e1-kitchen-window', [2.4, .65, 3], 3).builder;
    expect(leg.placements.some(p => /column/.test(p.module!))).toBe(false);
    expect(leg.placements.filter(p => /kitchen-(door|drawers|display|sink-base)$/.test(p.module!))).toHaveLength(3);
    const bar = place('asm-b3-bar', [4.2, .65, 3], 3).builder;
    expect(tris(bar.placements)).toBeLessThanOrEqual(16000);
    expect(bar.placements.some(p => p.module === B3_BAR.column!.modules.screen)).toBe(true);
  });
});

describe('the E6 kitchen wall', () => {
  it('stands its whole wall on a counter-height record, and keeps under a window', async () => {
    const { E6_STYLE } = await import('../src/styles/ref-a/e6.js');
    const record = { id: 'k', kind: 'kitchen_block', room: 'room-a', position: [0, 0], rotationDeg: 0, size: [2.4, .75, 1.17] } as Furniture;
    expect(E6_STYLE.fit!(record, { id: 'room-a', kind: 'kitchen' } as Room)).toBe('asm-e6-kitchen');
    expect(E6_STYLE.fit!({ ...record, kind: 'fridge' }, { id: 'room-a', kind: 'kitchen' } as Room)).toBe('fit-e6-fridge');
    const builder = new FreeBuilder();
    placeAssembly(builder, floorOf(3.1), { ...record, fit: 'asm-e6-kitchen' }, ALL['asm-e6-kitchen']!, 3.1);
    expect(builder.placements.some(p => /^fit-e6-kitchen-upper-a/.test(p.module!))).toBe(true);
    expect(builder.placements.some(p => p.module === 'fit-e6-kitchen-bulkhead')).toBe(true);
    // It stands off the record's back by its inset, clear of the suite's wall bays.
    for (const { v } of vertices(builder.placements, meshes)) expect(v[2]).toBeGreaterThanOrEqual(-.375 + .1 - 1e-6);
    const windowed = floorOf(3.1, { openingReservations: [{ opening: 'w', kind: 'window', position: [0, -.375 - .2], angleDeg: 0, inward: [0, 1], width: 1.2, sill: .9, height: 1.4, depth: .2 }] as FloorInterior['openingReservations'] });
    const under = new FreeBuilder();
    placeAssembly(under, windowed, { ...record, fit: 'asm-e6-kitchen' }, ALL['asm-e6-kitchen']!, 3.1);
    expect(under.placements.some(p => /upper|bulkhead|column/.test(p.module!))).toBe(false);
  });
});

describe('runs, planters and enclosures', () => {
  it('lays runs at a fixed pitch with one stretched filler and fixed ends', () => {
    expect(runLayout(R1_LIBRARY, 2).bays).toHaveLength(2);
    expect(runLayout(R1_LIBRARY, 2).fillers[0]![1] - runLayout(R1_LIBRARY, 2).fillers[0]![0]).toBeCloseTo(.2, 9);
    const stalls = runLayout(C4_STALLS, 3);
    expect(stalls.bays).toHaveLength(3);
    expect(stalls.start![1] - stalls.start![0]).toBeCloseTo(.03, 6);
    const centred = runLayout(R1_LIBRARY, 2, 'centre');
    expect(centred.fillers).toHaveLength(2);
    const { builder } = place('asm-c4-stall', [3, 1.5, 2], 3);
    for (const p of builder.placements) {
      if (/-(stall-bay|stall-end)$/.test(p.module!)) expect(p.scale).toEqual([1, 1, 1]);
      else expect([p.scale[1], p.scale[2]]).toEqual([1, 1]);
    }
    // The run's back stands on the record's back edge.
    for (const { v } of vertices(builder.placements, meshes)) expect(v[2]).toBeGreaterThanOrEqual(-.75 - 1e-6);
  });

  it('builds the wardrobe and display shelving up to any ceiling with a bulkhead, the wardrobe with its red line', () => {
    for (const ceiling of [2.6, 3.1]) {
      const { builder, lights } = place('asm-e1-wardrobe', [2.7, .6, ceiling], ceiling);
      let top = -Infinity;
      for (const { v } of vertices(builder.placements, meshes)) top = Math.max(top, v[1]);
      expect(top).toBeCloseTo(ceiling, 6);
      expect(lights).toHaveLength(1);
      expect(lights[0]!.color).toEqual([1, .035, .022]);
      expect(builder.placements.filter(p => p.module === 'fit-e1-wardrobe-bay').every(p => p.scale.every(s => s === 1))).toBe(true);
      const display = place('asm-e1-display', [1.4, .4, ceiling], ceiling).builder;
      expect(display.placements.filter(p => p.module === 'fit-e1-display-bay')).toHaveLength(2);
    }
  });

  it('plants troughs in whole 1 m bays between fixed end caps', () => {
    expect(plantedBays(3)).toEqual([-1, 0, 1]);
    expect(plantedBays(2.92)).toEqual([-.5, .5]);
    expect(plantedBays(.7)).toEqual([0]);
    expect(plantedBays(.4)).toEqual([]);
    const { builder } = place('asm-e1-planter', [3, .4, .8], 3);
    expect(builder.placements.filter(p => p.module === 'fit-e1-planter-end')).toHaveLength(2);
    expect(builder.placements.filter(p => p.module === 'fit-e1-planter-bay').every(p => p.scale.every(s => s === 1))).toBe(true);
    // Planting is baked leaf blades now, not bent quads: a metre stays under 5 k triangles.
    expect(tris(builder.placements)).toBeLessThan(12000);
  });

  it('closes the bamboo enclosure with glass to the ceiling and records every LED frame lens', () => {
    const ceiling = 3, { builder, lights } = place('asm-e1-bamboo', [1.2, .7, ceiling], ceiling);
    const lenses = builder.placements.filter(p => p.module === E1_BAMBOO.frame!.lens);
    expect(lenses).toHaveLength(4);
    expect(lights.map(l => l.id).sort()).toEqual(lenses.map(p => p.id).sort());
    expect(lights.every(l => !l.furniture && l.kind === 'strip')).toBe(true);
    expect(E1_BAMBOO.frame!.lens).toMatch(/^ceiling-cove-/);
    const panes = builder.placements.filter(p => p.module === E1_BAMBOO.pane);
    expect(panes).toHaveLength(4);
    for (const pane of panes) expect(worldBox(pane, meshes).max[1]).toBeCloseTo(ceiling - .005, 6);
    const low = place('asm-b3-bamboo', [1.6, .5, 1.1], 3);
    expect(low.lights).toHaveLength(0);
    for (const pane of low.builder.placements.filter(p => p.module === E1_BAMBOO.pane)) expect(worldBox(pane, meshes).max[1]).toBeCloseTo(1.05, 6);
  });

  it('stands the island top at the record height over its caustic block with a glow record per long side', () => {
    const { builder, lights } = place('asm-e1-island', [2.4, 1, .95], 3);
    const top = builder.placements.find(p => p.module === 'fit-e1-island-top')!;
    expect(worldBox(top, meshes).max[1]).toBeCloseTo(.95, 6);
    expect(lights).toHaveLength(2);
    expect(lights.every(l => l.furniture === 'item-1')).toBe(true);
    // The slab's rounded ends stand at scale 1 along the run, one at each end, and with the
    // stretched middle they span the record exactly.
    const ends = builder.placements.filter(p => p.module === 'fit-e1-island-top-end');
    expect(ends).toHaveLength(2);
    expect(ends.every(p => p.scale[0] === 1)).toBe(true);
    const span = [top, ...ends].map(p => worldBox(p, meshes));
    expect(Math.min(...span.map(b => b.min[0]))).toBeCloseTo(-1.2, 6);
    expect(Math.max(...span.map(b => b.max[0]))).toBeCloseTo(1.2, 6);
    expect(span.every(b => Math.abs(b.min[2] + .5) < 1e-6 && Math.abs(b.max[2] - .5) < 1e-6)).toBe(true);
  });
});

describe('service housings', () => {
  const room = (id: string, x0: number, z0: number, x1: number, z1: number, kind: Room['kind'] = 'living'): Room =>
    ({ id, kind, polygon: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], doors: [] }) as Room;
  function ctx(rooms: Room[], styled: Room[], builder = new FreeBuilder(), ceilingY = 3.1): DressContext {
    return { builder, floor: floorOf(ceilingY, { rooms }), rooms: styled, ceilingY, frame: makeFrame(0) } as unknown as DressContext;
  }

  it('hangs a case over a door on the styled side only, clear of the casing head', () => {
    const living = room('living', -3, 0, 3, 4), corridor = room('corridor', -3, -2, 3, 0, 'corridor');
    const builder = new FreeBuilder();
    builder.module('door-header-e1', 'living', [.5, 2.1, 0], [(.9 + .16) / .5, 1, 1], 0);
    const lights = placeHousings(ctx([living, corridor], [living], builder), E1_HOUSING_DOORS);
    expect(lights).toHaveLength(0);
    const bodies = builder.placements.filter(p => p.module === E1_HOUSING_DOORS.body);
    expect(bodies).toHaveLength(1);
    const box = worldBox(bodies[0]!, meshes);
    expect(box.min[1]).toBeCloseTo(3.1 - .35, 6);
    expect(box.min[1]).toBeGreaterThanOrEqual(2.1 + .08 + .02);
    expect(box.min[2]).toBeGreaterThan(0);
    expect(builder.placements.filter(p => p.module === E1_HOUSING_DOORS.cap)).toHaveLength(2);
    expect(builder.placements.filter(p => p.module === E1_HOUSING_DOORS.cap).every(p => p.scale.every(s => s === 1))).toBe(true);
  });

  it('refuses a case that would hang below 2.1 m or over a header it cannot clear', () => {
    const living = room('living', -3, 0, 3, 4), builder = new FreeBuilder();
    builder.module('door-header-e1', 'living', [0, 2.5, 0], [2, 1, 1], 0);
    placeHousings(ctx([living], [living], builder, 2.9), E1_HOUSING_DOORS);
    expect(builder.placements.some(p => p.module === E1_HOUSING_DOORS.body)).toBe(false);
    placeHousings(ctx([living], [living], builder, 2.4), E1_HOUSING_DOORS);
    expect(builder.placements.some(p => p.module === E1_HOUSING_DOORS.body)).toBe(false);
    const stair = room('stair-a', -3, 0, 3, 4, 'corridor');
    placeHousings(ctx([stair], [stair], builder, 3.1), E1_HOUSING_DOORS);
    expect(builder.placements.some(p => p.module === E1_HOUSING_DOORS.body)).toBe(false);
  });

  it('runs ducts along partitions only, one run owning each corner', () => {
    const corridor = room('corridor', 0, 0, 4, 4, 'corridor');
    const rooms = [corridor, room('east', 4, 0, 8, 4), room('north', 0, 4, 4, 8)];
    const builder = new FreeBuilder();
    placeHousings(ctx(rooms, [corridor], builder, 3), C2_DUCT);
    const bodies = builder.placements.filter(p => p.module === C2_DUCT.body);
    expect(bodies).toHaveLength(2);
    const boxes = bodies.map(p => worldBox(p, meshes));
    const overlap = (a: typeof boxes[0], b: typeof boxes[0]) => [0, 2].every(i => a.min[i]! < b.max[i]! - 1e-6 && b.min[i]! < a.max[i]! - 1e-6);
    expect(overlap(boxes[0]!, boxes[1]!)).toBe(false);
    for (const b of boxes) expect(b.min[1]).toBeCloseTo(3 - .28, 6);
    // Ribs are baked bays at a metre, never one placement per rib pitch below 0.5 m.
    expect(builder.placements.filter(p => p.module === C2_DUCT.insert!.module).length).toBeLessThanOrEqual(8);
  });
});

describe('modules and budgets', () => {
  it('draws every module a reference assembly or housing names', () => {
    const named = new Set<string>();
    const walk = (value: unknown): void => {
      if (typeof value === 'string' && /^(fit|housing|wall-screen|ceiling-cove)-/.test(value)) named.add(value);
      else if (value && typeof value === 'object') Object.entries(value).forEach(([key, v]) => { if (key !== 'id') walk(v); });
    };
    for (const kind of [BUILT_INS_A, BUILT_INS_A_EXTRA, BUILT_INS_B, BUILT_INS_C, BUILT_INS_R]) walk({ assemblies: kind.assemblies, housings: kind.housings });
    walk([E1_KITCHEN, B3_BAR, E1_BAMBOO]);
    for (const id of named) expect(meshes.has(id), id).toBe(true);
    for (const fit of Object.keys(ALL)) expect(fit).toMatch(/^asm-(e1|e2|e5|e6|b1|b2|b3|b4|c1|c2|c3|c4|c5|c6|c7|r1)-[a-z0-9-]+$/);
  });

  it('wears only material slots the theme publishes', () => {
    const library = loadTheme('cyberpunk')!.library;
    for (const built of meshes.values()) for (const slot of built.kit.mesh.materials()) {
      const [key, variant] = slot.split('#');
      expect(library.entry(key!)?.variants.some(v => v.id === variant), `${built.id}: ${slot}`).toBe(true);
    }
  });

  it('keeps every module under 10 k triangles and each kind under 400 KB of kit', async () => {
    await MeshoptEncoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
    const report: string[] = [];
    for (const [kind, set] of Object.entries(SETS)) {
      let bytes = 0, triangles = 0;
      for (const built of buildSet(set).values()) {
        expect(built.triangles, built.id).toBeLessThanOrEqual(10000);
        triangles += built.triangles;
        const doc = createDocument(built.kit.mesh).setLogger(new Logger(Logger.Verbosity.SILENT));
        await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16 }));
        bytes += (await io.writeBinary(doc)).byteLength;
      }
      // The kind's whole kit growth (panels, ceilings, floors too) has its own gate in the
      // reference budget; the built-ins, drawn as rounded joinery rather than boxes, keep
      // under 400 KB of it, kind A under 512 KB with its E1 and E6 kitchen walls.
      report.push(`${kind}: ${(bytes / 1024).toFixed(0)} KB, ${triangles} triangles`);
      expect(bytes, `kind ${kind}: ${bytes} bytes, ${triangles} triangles`).toBeLessThanOrEqual((kind === 'A' ? 512 : 400) * 1024);
    }
    console.log(`built-in kit per kind: ${report.join('; ')}`);
  }, 60000);
});
