import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Kit } from '../src/modules/kit.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { loadTheme } from '../src/materials/load.js';
import { SANDRA_FURNITURE, sandraFurnitureFor, sandraRecipes, sandraRoomFinish } from '../src/styles/sandra/index.js';
import { generate } from '../src/index.js';
import { SANDRA_BUILDING_SETS, sandraExteriorRequest, sandraInteriorRequest } from '../src/styles/sandra/sets.js';

const kits = new Map<string, Kit>();
sandraRecipes((id, draw) => { const k = new Kit(() => [1, 1]); draw(k); k.mesh.seal(); kits.set(id, k); });

function withMesh<T>(id: string, check: (mesh: Mesh) => T): T {
  const positions: number[] = [], indices: number[] = [];
  const k = kits.get(id)!;
  for (const slot of k.mesh.materials()) {
    const group = k.mesh.getGroup(slot)!, base = positions.length / 3;
    positions.push(...group.positions); indices.push(...Array.from(group.indices, index => base + index));
  }
  const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setIndex(indices);
  const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(geometry, material);
  mesh.updateMatrixWorld();
  try { return check(mesh); } finally { geometry.dispose(); material.dispose(); }
}
const ray = (mesh: Mesh, at: [number, number, number], direction: [number, number, number]) =>
  new Raycaster(new Vector3(...at), new Vector3(...direction), 0, 3).intersectObject(mesh)[0];

it('keeps every Sandra fitting within the existing furniture reservations', () => {
  for (const fit of Object.values(SANDRA_FURNITURE)) {
    const [w, d, h] = fit.size, min = [-w / 2, 0, -d / 2], max = [w / 2, h, d / 2];
    const k = kits.get(fit.module)!;
    expect(k, fit.module).toBeDefined();
    for (const slot of k.mesh.materials()) {
      const group = k.mesh.getGroup(slot)!;
      for (let i = 0; i < group.positions.length; i++) {
        expect(group.positions[i], `${fit.module} axis ${i % 3}`).toBeGreaterThanOrEqual(min[i % 3]! - 1e-6);
        expect(group.positions[i], `${fit.module} axis ${i % 3}`).toBeLessThanOrEqual(max[i % 3]! + 1e-6);
      }
    }
  }
  expect(sandraFurnitureFor('sleeping_pod')).toBeUndefined();
});

it('uses published materials and resolvable room finish modules', () => {
  const theme = loadTheme('cyberpunk')!.library;
  for (const k of kits.values()) for (const slot of k.mesh.materials()) {
    const [key, id] = slot.split('#'), entry = theme.entry(key!);
    expect(entry, slot).toBeDefined();
    expect(entry?.variants.some(v => v.id === id), slot).toBe(true);
  }
  const known = new Set([...kits.keys(), ...moduleRecipes().map(r => r.id)]);
  for (const room of ['reception', 'corridor', 'bedroom', 'living', 'kitchen', 'bathroom'] as const) {
    const { family: _family, frame: _frame, ...finish } = sandraRoomFinish(room, 'apartment');
    for (const id of Object.values(finish)) expect(known.has(id), `${room}/${id}`).toBe(true);
  }
});

it('models actual layered lattice and recessed storage instead of painted patterns', () => {
  withMesh('fit-sandra-lattice-screen', mesh => {
    const strip = ray(mesh, [0, 1.1, 0.5], [0, 0, -1]);
    const infill = ray(mesh, [0.04, 1.1, 0.5], [0, 0, -1]);
    expect(strip).toBeDefined(); expect(infill).toBeDefined();
    expect(infill!.distance - strip!.distance).toBeGreaterThan(0.025);
  });
  withMesh('fit-sandra-wardrobe', mesh => {
    const open = ray(mesh, [0, 0.25, 0.5], [0, 0, -1]);
    const leaf = ray(mesh, [-0.535, 1.05, 0.5], [0, 0, -1]);
    expect(open!.distance).toBeGreaterThan(0.65);
    expect(leaf!.distance).toBeLessThan(0.30);
  });
});

it('preserves real desk knee space and the curved front cutout', () => {
  withMesh('fit-sandra-writing-desk', mesh => {
    expect(ray(mesh, [0, 1, 0.35], [0, -1, 0])).toBeUndefined();
    expect(ray(mesh, [0, 1, 0], [0, -1, 0])!.point.y).toBeCloseTo(0.75, 5);
    expect(ray(mesh, [0, 0.48, 0.55], [0, 0, -1])).toBeUndefined();
  });
});

it('keeps the consumer seat support at 0.49 m and the bed within its declared height', () => {
  for (const id of ['fit-sandra-sofa', 'fit-sandra-chair']) withMesh(id, mesh => {
    const x = id.endsWith('sofa') ? 0.405 : 0;
    const seat = ray(mesh, [x, 0.6, 0], [0, -1, 0]);
    expect(seat!.point.y).toBeGreaterThanOrEqual(0.484);
    expect(seat!.point.y).toBeLessThanOrEqual(0.490001);
  });
});

it('selects a distinct Sandra interior on the same dynamic shell without changing its core', async () => {
  const exterior = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const set = SANDRA_BUILDING_SETS[0];
  const { blueprint } = await exterior.generate(sandraExteriorRequest(set), { textures: { mode: 'keys' } });
  const shell = sandraInteriorRequest(set, blueprint);
  const h10 = await generate({ ...shell, building: { ...shell.building, interiorStyle: 'h10' } }, { models: new Set() });
  const sandra = await generate({ ...shell, building: { ...shell.building, interiorStyle: 'sandra-dorsett' } }, { models: new Set() });
  expect(sandra.building.corePlacement).toEqual(h10.building.corePlacement);
  expect(sandra.building.floors.map(f => [f.index, f.elevation])).toEqual(h10.building.floors.map(f => [f.index, f.elevation]));
  expect(sandra.building.interiorStyle).toBe('sandra-dorsett');
  const all = Object.values(sandra.layouts);
  expect(all.flatMap(l => l.floor.furniture).some(f => f.kind === 'sleeping_pod')).toBe(false);
  expect(all.flatMap(l => l.placements).some(p => p.module === 'fit-sandra-bed')).toBe(true);
  expect(all.flatMap(l => l.placements).some(p => p.module === 'floor-slab-sandra-mat')).toBe(true);
  expect(h10.layouts.ground!.placements.some(p => p.module === 'floor-slab-sandra-mat')).toBe(false);
  for (const layout of all) {
    const ownFurniture = new Set(layout.placements.filter(p => p.module?.startsWith('fit-sandra-')).map(p => p.id));
    expect(layout.floor.lights.filter(light => light.furniture && ownFurniture.has(light.furniture))).toEqual([]);
    for (const item of layout.floor.furniture.filter(f => f.kind === 'bed_double' || f.kind === 'bed_single')) {
      expect(item.size[0]).toBeGreaterThanOrEqual(1);
      expect(item.size[1]).toBeGreaterThanOrEqual(2.05);
      expect(layout.placements.find(p => p.id === item.id)?.module).toBe(item.kind === 'bed_single' ? 'fit-sandra-bed-single' : 'fit-sandra-bed');
    }
    for (const room of layout.floor.rooms.filter(r => r.kind === 'bedroom' || r.kind === 'studio_main')) {
      expect(layout.floor.furniture.some(f => f.room === room.id && (f.kind === 'bed_double' || f.kind === 'bed_single')),
        `${layout.id}/${room.id}: conventional bed must be fitted, never silently omitted`).toBe(true);
    }
  }
}, 120000);
