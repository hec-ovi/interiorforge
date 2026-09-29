import { beforeAll, expect, it } from 'vitest';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { moduleRecipes } from '../src/modules/recipes.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { props } from '../src/placements/props.js';
import { CAPSULE_SHOWER_PARTS } from '../src/styles/capsule/shower.js';
import { LUXURY_SHOWER_PARTS } from '../src/styles/luxury/bathroom.js';
import type { FloorInterior, Furniture } from '../src/core/types.js';
import type { UvFloorData } from '../src/layout/plan-floor.js';
import type { Family } from '../src/placements/finish.js';
import { DAMAGED_SHOWER_PARTS } from '../src/styles/damaged/bathroom.js';
import { DAMAGED_QUALITY_IDS } from '../src/styles/damaged/quality-recipes.js';
import { loadTheme } from '../src/materials/load.js';

const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const model = (id: string) => catalog.get(id)!;
function ray(id: string, from: [number, number, number], direction: [number, number, number]) {
  const source = model(id).mesh;
  const meshes = source.materials().map(slot => {
    const group = source.getGroup(slot)!, geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(group.positions, 3));
    geometry.setIndex(Array.from(group.indices));
    return new Mesh(geometry, new MeshBasicMaterial());
  });
  const hit = new Raycaster(new Vector3(...from), new Vector3(...direction)).intersectObjects(meshes)[0];
  for (const mesh of meshes) mesh.geometry.dispose();
  expect(hit, id).toBeDefined();
  return hit!.point;
}

it('keeps useful objects physically open and seats at their actual support height', () => {
  // A real open pressed bowl instead of a flat countertop covering the drain.
  expect(ray('fit-damaged-kitchen', [-.51, 1.3, 0], [0, -1, 0]).y).toBeLessThan(.77);
  expect(ray('fit-damaged-kitchen', [-1, 1.3, 0], [0, -1, 0]).y).toBeCloseTo(.906, 3);
  expect(ray('fit-damaged-kitchen', [-.766, 1.3, .211], [0, -1, 0]).y).toBeGreaterThan(.88);
  expect(ray('fit-damaged-kitchen', [-.3, 1.3, 0], [0, -1, 0]).y).toBeLessThan(.875);
  expect(ray('fit-damaged-sofa', [0.409, 1.4, .02], [0, -1, 0]).y).toBeCloseTo(.49, 3);
  expect(ray('fit-damaged-chair', [0, 1.4, .012], [0, -1, 0]).y).toBeCloseTo(.49, 3);
  expect(ray('fit-damaged-office-chair', [0, 1.4, .01], [0, -1, 0]).y).toBeCloseTo(.49, 3);
  // The blanket has real underside/edge thickness; it is not a single billboard.
  const bed = model('fit-damaged-bed').mesh;
  expect(bed.materials().some(slot => slot.includes('upholstery'))).toBe(true);
});

it('publishes finite smooth surfaces with real material variants and controlled geometry budgets', () => {
  const theme = loadTheme('cyberpunk')!;
  for (const id of [...DAMAGED_QUALITY_IDS, ...DAMAGED_SHOWER_PARTS]) {
    let triangles = 0;
    for (const slot of model(id).mesh.materials()) {
      const g = model(id).mesh.getGroup(slot)!;
      expect(g.positions.length).toBe(g.normals.length);
      expect(g.uvs.length).toBe(g.positions.length / 3 * 2);
      expect([...g.positions, ...g.normals, ...g.uvs].every(Number.isFinite), id).toBe(true);
      for (let i = 0; i < g.normals.length; i += 3) expect(Math.hypot(g.normals[i]!, g.normals[i + 1]!, g.normals[i + 2]!), id).toBeCloseTo(1, 4);
      const [key, variant] = slot.split('#'), entry = theme.library.entry(key!);
      expect(entry?.variants.some(v => v.id === variant), slot).toBe(true);
      triangles += g.indices.length / 3;
    }
    expect(triangles, id).toBeLessThan(16_000);
  }
});

let Physics: any, PlayerBody: any, floorBoxes: any;
beforeAll(async () => {
  [{ Physics }, { PlayerBody }, { floorBoxes }] = await Promise.all([
    import(new URL('../../engine/src/game/physics/Physics.js', import.meta.url).href),
    import(new URL('../../engine/src/game/physics/PlayerBody.js', import.meta.url).href),
    import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
  ]);
});
function walk(physics: any, body: any, target: Vector3): number {
  const delta = 1 / 60;
  for (let frame = 0; frame < 160; frame++) {
    const direction = target.clone().sub(body.feet); direction.y = 0;
    if (direction.length() < .025) return direction.length();
    direction.setLength(Math.min(direction.length(), 1.1 * delta));
    physics.step(delta); body.move(direction, delta);
  }
  return Math.hypot(body.feet.x - target.x, body.feet.z - target.z);
}
function placedShower(family: Family, size: [number, number, number], degrees: number) {
  const item: Furniture = { id: 'bathroom-shower', kind: 'shower', room: 'bath', position: [4, -3], size, rotationDeg: degrees };
  const floor = { furniture: [item], lights: [] } as unknown as FloorInterior;
  const uv = { rooms: [], furniture: [{ ...item, at: item.position }] } as unknown as UvFloorData;
  const builder = new PlacementBuilder();
  props(builder, floor, uv, family, { present: new Set(), missing: new Set() });
  return { builder, floor, uv };
}
it.each([
  ['damaged', [.9, .9, 2], DAMAGED_SHOWER_PARTS],
  ['capsule', [1.3, 1.1, 2.2], CAPSULE_SHOWER_PARTS],
  ['luxury', [1.3, 1.1, 2.2], LUXURY_SHOWER_PARTS],
] as const)('publishes the%s shower as real components with the original identity on its tray', (family, size, parts) => {
  const { builder, floor, uv } = placedShower(family, [...size], 37);
  expect(builder.placements.map(placement => placement.module)).toEqual(parts);
  expect(builder.placements[0]!.id).toBe('bathroom-shower');
  expect(builder.placements[0]!.module).toContain('tray');
  expect(new Set(builder.placements.map(placement => placement.id)).size).toBe(parts.length);
  expect(builder.placements.every(placement => placement.scale.every(scale => scale === 1))).toBe(true);
  expect(floor.furniture).toHaveLength(1);
  expect(uv.furniture).toHaveLength(1);
});

it.each([0, 37, 90, 143])('keeps the worn shower entry physically usable at%s degrees', async degrees => {
  const { builder } = placedShower('damaged', [.9, .9, 2], degrees);
  const yaw = degrees * Math.PI / 180;
  const world = (x: number, y: number, z: number) => new Vector3(x, y, z).applyAxisAngle(new Vector3(0, 1, 0), yaw).add(new Vector3(4, 0, -3));
  const local = (point: Vector3) => point.clone().sub(new Vector3(4, 0, -3)).applyAxisAngle(new Vector3(0, 1, 0), -yaw);
  const physics = await Physics.create();
  try {
    physics.addHalfSpace(0);
    physics.addBoxes(floorBoxes(builder.placements, 0, (id: string) => model(id)));
    const body = new PlayerBody(physics, world(0, .025, 1.25));
    expect(walk(physics, body, world(0, .035, .08))).toBeLessThan(.025);
    expect(body.canStand()).toBe(true);
    walk(physics, body, world(.9, .035, .08));
    expect(local(body.feet).x).toBeLessThan(.14);
    expect(walk(physics, body, world(0, .035, .08))).toBeLessThan(.025);
    expect(walk(physics, body, world(0, 0, 1.25))).toBeLessThan(.025);
  } finally { physics.world.free(); }
});
