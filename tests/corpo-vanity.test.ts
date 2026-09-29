import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Kit } from '../src/modules/kit.js';
import { CORPO_BATH_DIVIDER_FIT, CORPO_VANITY_FIT, CORPO_VANITY_LIGHTS, corpoBathroomRecipes } from '../src/styles/luxury/corpo-bathroom.js';
import { FINISH } from '../src/modules/finishes.js';
import { LUXURY_BATHROOM_MATERIALS } from '../src/styles/luxury/bathroom.js';
import { loadTheme } from '../src/materials/load.js';

const kit = new Kit(() => [1, 1]);
corpoBathroomRecipes((id, draw) => { if (id === CORPO_VANITY_FIT.module) draw(kit); });
const meshes = kit.mesh.materials().map(slot => {
  const group = kit.mesh.getGroup(slot)!, geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(group.positions, 3));
  geometry.setIndex(Array.from(group.indices));
  return Object.assign(new Mesh(geometry, new MeshBasicMaterial()), { name: slot });
});
function ray(at: [number, number, number], direction: [number, number, number]) {
  return new Raycaster(new Vector3(...at), new Vector3(...direction)).intersectObjects(meshes)[0];
}

it('retains a genuine deep trough under both wall outlets and a solid thin rim', () => {
  for (const x of [-.73, -.56, 0, .56, .73]) {
    const hit = ray([x, 1.3, .06], [0, -1, 0]);
    expect(hit).toBeDefined();
    expect(hit!.point.y).toBeCloseTo(.697, 4);
  }
  expect(ray([1.073, 1.2, 0], [0, -1, 0])!.point.y).toBeCloseTo(.9, 5);
  expect(ray([0, 1.2, .272], [0, -1, 0])!.point.y).toBeCloseTo(.9, 5);
});

it('models two projecting wall spouts and three opaque mirror panels above the real basin', () => {
  for (const x of [-.56, .56]) expect(ray([x, 1.038, .4], [0, 0, -1])!.point.z).toBeGreaterThan(-.11);
  for (const x of [-.698, 0, .698]) {
    const hit = ray([x, 1.6, .4], [0, 0, -1])!;
    expect(hit.object.name).toBe(LUXURY_BATHROOM_MATERIALS.mirror);
    expect(hit.point.z).toBeCloseTo(-.240, 5);
  }
  expect(ray([.4, .35, .4], [0, 0, -1])).toBeUndefined();
});

it('keeps the complete assembly inside the unscaled 2.2m by .6m footprint with unit normals', () => {
  for (const slot of kit.mesh.materials()) {
    const group = kit.mesh.getGroup(slot)!;
    for (let index = 0; index < group.positions.length; index += 3) {
      expect(Math.abs(group.positions[index]!)).toBeLessThanOrEqual(CORPO_VANITY_FIT.size[0] / 2 + 1e-6);
      expect(Math.abs(group.positions[index + 2]!)).toBeLessThanOrEqual(CORPO_VANITY_FIT.size[1] / 2 + 1e-6);
      expect(group.positions[index + 1]!).toBeGreaterThan(0);
      expect(group.positions[index + 1]!).toBeLessThan(2.34);
      expect(Math.hypot(group.normals[index]!, group.normals[index + 1]!, group.normals[index + 2]!)).toBeCloseTo(1, 4);
    }
  }
  expect(CORPO_VANITY_LIGHTS.lenses.every(lens => lens.lumens > 0 && lens.length <= CORPO_VANITY_FIT.size[0])).toBe(true);
});

it('resolves every vanity finish to a published PBR variant', () => {
  const theme = loadTheme('cyberpunk');
  expect(theme).not.toBeNull();
  for (const slot of kit.mesh.materials()) {
    const [key, variant] = slot.split('#'), entry = theme!.library.entry(key!);
    expect(entry, slot).toBeDefined();
    expect(entry!.variants.some(value => value.id === variant), slot).toBe(true);
  }
});

it('keeps the planted divider inside its own reservation and models curved foliage above both soil beds', () => {
  const divider = new Kit(() => [1, 1]);
  corpoBathroomRecipes((id, draw) => { if (id === CORPO_BATH_DIVIDER_FIT.module) draw(divider); });
  const [width, depth, height] = CORPO_BATH_DIVIDER_FIT.size;
  for (const slot of divider.mesh.materials()) {
    const group = divider.mesh.getGroup(slot)!;
    for (let index = 0; index < group.positions.length; index += 3) {
      expect(Math.abs(group.positions[index]!)).toBeLessThanOrEqual(width / 2 + 1e-6);
      expect(Math.abs(group.positions[index + 2]!)).toBeLessThanOrEqual(depth / 2 + 1e-6);
      expect(group.positions[index + 1]!).toBeGreaterThanOrEqual(-1e-6);
      expect(group.positions[index + 1]!).toBeLessThanOrEqual(height + 1e-6);
      expect(Math.hypot(group.normals[index]!, group.normals[index + 1]!, group.normals[index + 2]!)).toBeCloseTo(1, 4);
    }
  }
  const leaves = divider.mesh.getGroup(FINISH.leaf)!, leafY = leaves.positions.filter((_v, index) => index % 3 === 1);
  expect(Math.min(...leafY)).toBeLessThan(.9);
  expect(Math.max(...leafY)).toBeGreaterThan(2.2);
  expect(divider.mesh.getGroup(FINISH.soil)).toBeDefined();
});
