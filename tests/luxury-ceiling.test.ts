import { expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { Kit } from '../src/modules/kit.js';
import { lightRecipes } from '../src/modules/recipes/lights.js';
import { FINISH } from '../src/modules/finishes.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { placeLuxuryCeiling } from '../src/styles/luxury/ceiling.js';
import { makeFrame } from '../src/layout/uv.js';

it('keeps real shadow joints at 12 mm while fitting broad ceiling panels to different rooms', () => {
  for (const width of [6.2, 10.8, 15.1]) {
    const builder = new PlacementBuilder();
    placeLuxuryCeiling(builder, 'room', { u: 0, v: 0, lu: width, lv: 7.4 }, 3.4, makeFrame(0));
    const panels = builder.placements.filter(p => p.module === 'ceiling-luxury-panel');
    const firstRow = panels.filter(p => Math.abs(p.position[2] - panels[0]!.position[2]) < 1e-6)
      .sort((a, b) => a.position[0] - b.position[0]);
    expect(firstRow.length).toBeGreaterThan(1);
    for (let i = 0; i < firstRow.length; i++) {
      const panel = firstRow[i]!;
      expect(panel.scale[0] * .5).toBeGreaterThan(1.5);
      expect(panel.scale[0] * .5).toBeLessThan(3);
      if (!i) continue;
      const previous = firstRow[i - 1]!;
      const gap = panel.position[0] - panel.scale[0] * .25 - previous.position[0] - previous.scale[0] * .25;
      expect(gap).toBeCloseTo(.012, 6);
    }
    expect(builder.placements.filter(p => p.module === 'ceiling-luxury-backing')).toHaveLength(1);
    expect(builder.placements.some(p => p.module === 'ceiling-luxury-vent')).toBe(true);
  }
});

it('exposes the spotlight optic inside a real annular bezel with front-facing exterior surfaces', () => {
  let kit: Kit | undefined;
  lightRecipes((id, draw) => { if (id === 'ceiling-spot') { kit = new Kit(() => [1, 1]); draw(kit); } });
  const meshes: Mesh[] = [];
  for (const slot of kit!.mesh.materials()) {
    const group = kit!.mesh.getGroup(slot)!;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(group.positions, 3));
    geometry.setIndex(Array.from(group.indices));
    const mesh = new Mesh(geometry, new MeshBasicMaterial());
    mesh.name = slot;
    mesh.updateMatrixWorld();
    meshes.push(mesh);
  }
  const hit = (x: number) => new Raycaster(new Vector3(x, -1, 0), new Vector3(0, 1, 0)).intersectObjects(meshes)[0];
  expect(hit(0)?.object.name).toBe(FINISH.lensWarm);
  expect(hit(.025)?.object.name).toBe(FINISH.lensWarm);
  expect(hit(.105)?.object.name).toBe(FINISH.zinc);
  expect(hit(.08)?.object.name).toBe(FINISH.black);
  expect(hit(.06)?.object.name).toBe(FINISH.chrome);
  expect(hit(0)!.point.y).toBeCloseTo(0, 6);
  expect(hit(.105)!.point.y).toBeLessThan(-.02);
});
