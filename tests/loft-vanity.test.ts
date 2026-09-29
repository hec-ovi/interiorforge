import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Kit } from '../src/modules/kit.js';
import { LOFT_VANITY_FIT, loftBathroomRecipes } from '../src/styles/luxury/loft-bathroom.js';
import { loadTheme } from '../src/materials/load.js';
const kit = new Kit(() => [1, 1]);
loftBathroomRecipes((_id, draw) => draw(kit));
const meshes = kit.mesh.materials().map(slot => {
  const group = kit.mesh.getGroup(slot)!, geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(group.positions, 3)); geometry.setIndex(Array.from(group.indices));
  return Object.assign(new Mesh(geometry, new MeshBasicMaterial()), { name: slot });
});
const down = (x: number, z: number) => new Raycaster(new Vector3(x, 1.2, z), new Vector3(0, -1, 0)).intersectObjects(meshes)[0]!.point.y;
it('has two independent open faceted bowls above the counter, with physical rims and a dry space between', () => {
  for (const x of [-.52, .52]) {
    expect(down(x, .045)).toBeLessThan(.79);
    expect(down(x, .045)).toBeGreaterThan(.76);
    expect(down(x, .205)).toBeGreaterThan(.89);
  }
  expect(down(0, .045)).toBeCloseTo(.748, 5);
  const front = new Raycaster(new Vector3(0, .40, 1), new Vector3(0, 0, -1)).intersectObjects(meshes)[0]!;
  expect(front.point.z).toBeGreaterThan(.28);
});
it('stays inside the same 2.2m by .6m reservation and resolves every material', () => {
  const theme = loadTheme('cyberpunk')!;
  for (const slot of kit.mesh.materials()) {
    const [key, variant] = slot.split('#'), entry = theme.library.entry(key!);
    expect(entry, slot).toBeDefined(); expect(entry!.variants.some(v => v.id === variant), slot).toBe(true);
    const group = kit.mesh.getGroup(slot)!;
    for (let i = 0; i < group.positions.length; i += 3) {
      expect(Math.abs(group.positions[i]!)).toBeLessThanOrEqual(LOFT_VANITY_FIT.size[0] / 2 + 1e-6);
      expect(Math.abs(group.positions[i + 2]!)).toBeLessThanOrEqual(LOFT_VANITY_FIT.size[1] / 2 + 1e-6);
      expect(Math.hypot(group.normals[i]!, group.normals[i + 1]!, group.normals[i + 2]!)).toBeCloseTo(1, 4);
    }
  }
});
