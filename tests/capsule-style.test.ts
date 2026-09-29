import { describe, expect, it } from 'vitest';
import { Kit } from '../src/modules/kit.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { loadTheme } from '../src/materials/load.js';
import { CAPSULE_FURNITURE, capsuleFurnitureFor } from '../src/styles/capsule/furniture.js';
import { capsuleRecipes } from '../src/styles/capsule/recipes.js';
import { capsuleRoomFinish } from '../src/styles/capsule/finish.js';
import { generate, makePlacementFixture } from '../src/index.js';
import { assembly } from './fixtures.js';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';

const meshes = new Map<string, Kit>();
capsuleRecipes((id, draw) => { const kit = new Kit(() => [1, 1]); draw(kit); kit.mesh.seal(); meshes.set(id, kit); });

describe('reference-led capsule furniture', () => {
  it('keeps every modeled surface inside its navigation reservation, including trim and handles', () => {
    const fits = [...Object.values(CAPSULE_FURNITURE), ...(['h10', 'japantown'] as const).flatMap(profile =>
      (['wardrobe', 'sleeping_pod', 'kitchen_block', 'sofa'] as const).map(kind => capsuleFurnitureFor(kind, profile)!))];
    for (const fit of fits) {
      const kit = meshes.get(fit.module);
      if (!kit) continue; // existing shared fixture, tested by the shared module suite
      const [w, d, h] = fit.size;
      const bounds = [[-w / 2, w / 2], [0, h], [-d / 2, d / 2]];
      for (const slot of kit.mesh.materials()) {
        const positions = kit.mesh.getGroup(slot)!.positions;
        for (let i = 0; i < positions.length; i++) {
          expect(positions[i], `${fit.module}/${slot} axis ${i % 3}`).toBeGreaterThanOrEqual(bounds[i % 3]![0]! - 1e-6);
          expect(positions[i], `${fit.module}/${slot} axis ${i % 3}`).toBeLessThanOrEqual(bounds[i % 3]![1]! + 1e-6);
        }
      }
    }
  });

  it('keeps the two wardrobe identities physically open behind their separate sliding or shelf fronts', () => {
    for (const id of ['fit-capsule-wardrobe', 'fit-capsule-h10-wardrobe']) {
      const positions: number[] = [], indices: number[] = [];
      for (const slot of meshes.get(id)!.mesh.materials()) {
        const group = meshes.get(id)!.mesh.getGroup(slot)!, base = positions.length / 3;
        positions.push(...group.positions); indices.push(...Array.from(group.indices, i => i + base));
      }
      const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setIndex(indices);
      const material = new MeshBasicMaterial({ side: DoubleSide }), object = new Mesh(geometry, material);
      object.updateMatrixWorld();
      try {
        const hit = new Raycaster(new Vector3(.55, 1, .8), new Vector3(0, 0, -1), 0, 1.2).intersectObject(object)[0];
        expect(hit, id).toBeDefined();
        expect(hit!.point.z, `${id}: wardrobe cavity filled by a solid carcass`).toBeLessThan(-.20);
      } finally { geometry.dispose(); material.dispose(); }
    }
  });

  it('uses published materials and resolves every finish and furniture module', () => {
    const known = new Set([...moduleRecipes().map(r => r.id), ...meshes.keys()]);
    const theme = loadTheme('cyberpunk');
    expect(theme).not.toBeNull();
    for (const kit of meshes.values()) for (const slot of kit.mesh.materials()) {
      const [key, variant] = slot.split('#');
      const entry = theme!.library.entry(key!);
      expect(entry, slot).toBeDefined();
      expect(entry?.variants.some(v => v.id === variant), slot).toBe(true);
    }
    for (const fit of Object.values(CAPSULE_FURNITURE)) expect(known.has(fit.module), fit.module).toBe(true);
    for (const room of ['reception', 'corridor', 'bedroom', 'living', 'bathroom', 'mechanical_room'] as const) {
      const finish = capsuleRoomFinish(room, 'apartment');
      const { family: _family, frame, ...pieces } = finish;
      for (const id of Object.values(pieces)) if (typeof id === 'string') expect(known.has(id), `${room}/${id}`).toBe(true);
      if (frame) for (const id of [frame.corner, frame.rail, frame.stile, frame.field, frame.line]) expect(known.has(id), `${room}/${id}`).toBe(true);
    }
  });

  it('keeps real sink cavities open through the countertop and underlying cabinetry', () => {
    for (const [id, center, top] of [['fit-capsule-kitchen', 0.65, 0.935], ['fit-capsule-basin', 0, 0.85]] as const) {
      const kit = meshes.get(id)!, positions: number[] = [], indices: number[] = [];
      for (const slot of kit.mesh.materials()) {
        const group = kit.mesh.getGroup(slot)!, base = positions.length / 3;
        positions.push(...group.positions); indices.push(...Array.from(group.indices, index => index + base));
      }
      const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
      geometry.setIndex(indices);
      const material = new MeshBasicMaterial({ side: DoubleSide }), object = new Mesh(geometry, material);
      object.updateMatrixWorld();
      try {
        for (const offset of [-0.07, 0, 0.07]) {
          const hit = new Raycaster(new Vector3(center + offset, top - 0.005, 0.02), new Vector3(0, -1, 0), 0, 0.35).intersectObject(object)[0];
          expect(hit, id).toBeDefined();
          expect(hit!.point.y, `${id}: cabinet or worktop plugs the bowl`).toBeLessThan(top - 0.08);
          expect(hit!.point.y, `${id}: bowl has no floor`).toBeGreaterThan(0.70);
        }
        if (id === 'fit-capsule-kitchen') for (const x of [-0.248, 0.248]) for (const z of [-0.188, 0.188]) {
          const corner = new Raycaster(new Vector3(center + x, top + 0.008, z), new Vector3(0, -1, 0), 0, 0.02).intersectObject(object)[0];
          expect(corner, `open gap between rounded sink rim and square worktop at ${x}/${z}`).toBeDefined();
        }
      } finally { geometry.dispose(); material.dispose(); }
    }
  });

  it('keeps custom seat contact at the unchanged consumer default of 0.49 m', () => {
    for (const id of ['fit-capsule-sofa', 'fit-capsule-curved-sofa', 'fit-capsule-chair']) {
      const mesh = meshes.get(id)!.mesh.getGroup('cyberpunk/fabric/high_rich#1')!;
      const geometry = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(mesh.positions), 3));
      geometry.setIndex(Array.from(mesh.indices));
      const material = new MeshBasicMaterial({ side: DoubleSide }), object = new Mesh(geometry, material);
      object.updateMatrixWorld();
      try {
        // Curved sewn cushions need contact at the occupied area, not a perfectly flat
        // triangle somewhere else on the seat. The runtime anchor must not float.
        for (const x of id.includes('sofa') ? [-0.39, 0.39] : [0]) {
          const hit = new Raycaster(new Vector3(x, 0.6, 0), new Vector3(0, -1, 0), 0, 0.2).intersectObject(object)[0];
          expect(hit, id).toBeDefined();
          expect(hit!.point.y, id).toBeGreaterThanOrEqual(0.484);
          expect(hit!.point.y, id).toBeLessThanOrEqual(0.49 + 1e-6);
        }
      } finally {
        geometry.dispose(); material.dispose();
      }
    }
  });

  it('models continuously shaded molded shells and sewn upholstery instead of flat block faces', () => {
    for (const id of ['fit-capsule-sofa', 'fit-capsule-bed', 'fit-capsule-sleeping-niche']) {
      const kit = meshes.get(id)!;
      for (const slot of ['cyberpunk/interior-capsule-enamel/mid#ivory', 'cyberpunk/fabric/high_rich#1']) {
        const group = kit.mesh.getGroup(slot)!;
        let curved = 0;
        for (let i = 0; i < group.normals.length; i += 3) {
          const normal = Array.from(group.normals.slice(i, i + 3));
          expect(Math.hypot(...normal), `${id}/${slot}`).toBeCloseTo(1, 4);
          if (normal.filter(v => Math.abs(v) > 0.02).length > 1) curved++;
        }
        expect(curved, `${id}/${slot}`).toBeGreaterThan(100);
      }
    }
  });

  it.each([40, 60])('keeps complete built-in residential furniture when external props are absent at %im', async width => {
    const request = makePlacementFixture({ seed: 'capsule-reference', width, depth: width, floors: 4, type: 'residential', tier: 'mid' });
    request.assignments = request.blueprint.floors.map(floor => ({ floor: floor.index, kind: floor.index === 0 ? 'lobby' : 'apartment' }));
    const result = await generate(request, { models: new Set() });
    const layouts = Object.values(result.layouts);
    const ground = layouts.find(layout => layout.sourceFloor === 0)!;
    expect(ground.placements.some(p => p.module === 'fit-capsule-reception')).toBe(true);
    const upper = layouts.filter(layout => layout.sourceFloor > 0);
    expect(upper.length).toBeGreaterThan(0);
    for (const layout of upper) {
      expect(layout.placements.some(p => p.module === 'fit-capsule-kitchen')).toBe(true);
      expect(layout.placements.some(p => p.module === 'fit-capsule-bed' || /fit-capsule-(sleeping|h10|japantown)-niche/.test(p.module ?? ''))).toBe(true);
      const ids = new Set(layout.placements.map(p => p.id));
      for (const item of layout.floor.furniture) expect(ids.has(item.id), item.id).toBe(true);
    }
  }, 180_000);

  it('fits the actual 40 m exterior kit shell with furnished repeat floors and a distinct reception', async () => {
    const request = await assembly('mirror-frame', { width: 40, depth: 40, floors: 4 });
    request.assignments = request.blueprint.floors.map(floor => ({ floor: floor.index, kind: floor.index === 0 ? 'lobby' : 'apartment' }));
    const result = await generate(request, { models: new Set() });
    expect(result.building.reservationCrossing).toBeUndefined();
    expect(result.building.floors).toHaveLength(4);
    expect(result.layouts.ground!.placements.some(p => p.module === 'fit-capsule-reception')).toBe(true);
    for (const id of ['middle', 'crown'] as const) {
      const layout = result.layouts[id]!;
      expect(layout.placements.filter(p => p.module === 'fit-capsule-kitchen').length).toBeGreaterThan(0);
      expect(layout.placements.filter(p => /fit-capsule-(sleeping|h10|japantown)-niche/.test(p.module ?? '') || p.module === 'fit-capsule-bed').length).toBeGreaterThan(0);
    }
  }, 180_000);
});
