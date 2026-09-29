import { beforeAll, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { moduleRecipes } from '../src/modules/recipes.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { props } from '../src/placements/props.js';
import { LUXURY_SHOWER_PARTS } from '../src/styles/luxury/bathroom.js';
import type { FloorInterior, Furniture } from '../src/core/types.js';
import type { UvFloorData } from '../src/layout/plan-floor.js';

let Physics: any, PlayerBody: any, floorBoxes: any;
beforeAll(async () => {
  [{ Physics }, { PlayerBody }, { floorBoxes }] = await Promise.all([
    import(new URL('../../engine/src/game/physics/Physics.js', import.meta.url).href),
    import(new URL('../../engine/src/game/physics/PlayerBody.js', import.meta.url).href),
    import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
  ]);
});
const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const bounds = (id: string) => catalog.get(id);
const up = new Vector3(0, 1, 0), delta = 1 / 60;

function shower(degrees: number) {
  const item: Furniture = { id: 'bathroom-shower', kind: 'shower', room: 'bath', position: [4, -3], size: [1.3, 1.1, 2.2], rotationDeg: degrees };
  const floor = { furniture: [item], lights: [] } as unknown as FloorInterior;
  const uv = { rooms: [], furniture: [{ ...item, at: item.position, rotationDeg: 0 }] } as unknown as UvFloorData;
  const builder = new PlacementBuilder();
  props(builder, floor, uv, 'luxury', { present: new Set(), missing: new Set() });
  return { builder, floor, uv, yaw: degrees * Math.PI / 180 };
}
function walk(physics: any, body: any, target: Vector3): number {
  for (let frame = 0; frame < 160; frame++) {
    const direction = target.clone().sub(body.feet); direction.y = 0;
    if (direction.length() < .025) return direction.length();
    direction.setLength(Math.min(direction.length(), 1.1 * delta));
    physics.step(delta); body.move(direction, delta);
  }
  return Math.hypot(body.feet.x - target.x, body.feet.z - target.z);
}

it('publishes only bounded physical components and keeps the shower furniture identity on its tray', () => {
  const { builder, floor, uv } = shower(37);
  expect(builder.placements.map(p => p.module)).toEqual(LUXURY_SHOWER_PARTS);
  expect(builder.placements[0]!.id).toBe('bathroom-shower');
  expect(builder.placements[0]!.module).toBe('fit-shower-luxury-tray');
  expect(new Set(builder.placements.map(p => p.id)).size).toBe(LUXURY_SHOWER_PARTS.length);
  expect(floor.furniture).toHaveLength(1);
  expect(uv.furniture).toHaveLength(1);
  expect(builder.placements.every(p => p.module !== 'fit-shower-luxury')).toBe(true);
});

it.each([0, 37, 90, 143])('walks a standing real PlayerBody into and out of the published shower at %s degrees', async degrees => {
  const { builder, yaw } = shower(degrees), elevation = 3.6;
  const origin = new Vector3(4, elevation, -3);
  const world = (x: number, y: number, z: number) => new Vector3(x, y, z).applyAxisAngle(up, yaw).add(origin);
  const local = (at: Vector3) => at.clone().sub(origin).applyAxisAngle(up, -yaw);
  const physics = await Physics.create();
  try {
    physics.addHalfSpace(elevation);
    physics.addBoxes(floorBoxes(builder.placements, elevation, bounds));
    const body = new PlayerBody(physics, world(.21, .025, 1.25));
    expect(walk(physics, body, world(.21, .066, .06))).toBeLessThan(.025);
    expect(local(body.feet).z).toBeLessThan(.1);
    expect(local(body.feet).y).toBeGreaterThan(.065);
    expect(body.canStand()).toBe(true);
    // Side glass remains genuinely solid, even though the usable entry is open.
    walk(physics, body, world(1.1, .066, .06));
    expect(local(body.feet).x).toBeLessThan(.31);
    expect(walk(physics, body, world(.21, .066, .06))).toBeLessThan(.025);
    expect(walk(physics, body, world(.21, 0, 1.25))).toBeLessThan(.025);
    expect(local(body.feet).z).toBeGreaterThan(1.22);
  } finally { physics.world.free(); }
});

it('demonstrates why the combined preview module must never be a placed shower collider', async () => {
  const physics = await Physics.create();
  try {
    physics.addHalfSpace(0);
    physics.addBoxes(floorBoxes([{ module: 'fit-shower-luxury', position: [0, 0, 0], rotationY: 0, scale: [1, 1, 1] }], 0, bounds));
    const body = new PlayerBody(physics, new Vector3(.21, .025, 1.25));
    expect(walk(physics, body, new Vector3(.21, .066, .06))).toBeGreaterThan(.75);
    expect(body.feet.z).toBeGreaterThan(.87);
  } finally { physics.world.free(); }
});
