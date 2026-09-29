import { beforeAll, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { PlacementBuilder } from '../src/placements/builder.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { CAPSULE_SHOWER_PARTS } from '../src/styles/capsule/shower.js';

let Physics: any, PlayerBody: any, floorBoxes: any;
beforeAll(async () => {
  [{ Physics }, { PlayerBody }, { floorBoxes }] = await Promise.all([
    import(new URL('../../engine/src/game/physics/Physics.js', import.meta.url).href),
    import(new URL('../../engine/src/game/physics/PlayerBody.js', import.meta.url).href),
    import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
  ]);
});
const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const up = new Vector3(0, 1, 0), dt = 1 / 60;
function walk(physics: any, body: any, target: Vector3): number {
  for (let tick = 0; tick < 180; tick++) {
    const move = target.clone().sub(body.feet); move.y = 0;
    if (move.length() < 0.025) return move.length();
    move.setLength(Math.min(move.length(), 1.1 * dt));
    physics.step(dt); body.move(move, dt);
  }
  return Math.hypot(body.feet.x - target.x, body.feet.z - target.z);
}

it.each([0, 37, 90, 143])('capsule shower components admit a real standing PlayerBody at %s degrees', async degrees => {
  const builder = new PlacementBuilder(), yaw = degrees * Math.PI / 180, elevation = 4.5;
  for (const [index, module] of CAPSULE_SHOWER_PARTS.entries()) builder.module(module, 'bath', [4, 0, -3], [1, 1, 1], yaw,
    { id: index === 0 ? 'shower' : `shower/${module}` });
  expect(builder.placements.some(p => p.module === 'fit-capsule-shower')).toBe(false);
  const origin = new Vector3(4, elevation, -3);
  const world = (x: number, y: number, z: number) => new Vector3(x, y, z).applyAxisAngle(up, yaw).add(origin);
  const local = (point: Vector3) => point.clone().sub(origin).applyAxisAngle(up, -yaw);
  const physics = await Physics.create();
  try {
    physics.addHalfSpace(elevation);
    physics.addBoxes(floorBoxes(builder.placements, elevation, (id: string) => catalog.get(id)));
    const body = new PlayerBody(physics, world(0.20, 0.025, 1.25));
    expect(walk(physics, body, world(0.20, 0.067, 0.06))).toBeLessThan(0.025);
    expect(local(body.feet).y).toBeGreaterThan(0.065);
    expect(body.canStand()).toBe(true);
    walk(physics, body, world(1.1, 0.067, 0.06));
    expect(local(body.feet).x).toBeLessThan(0.32);
    expect(walk(physics, body, world(0.20, 0.067, 0.06))).toBeLessThan(0.025);
    expect(walk(physics, body, world(0.20, 0.025, 1.25))).toBeLessThan(0.025);
  } finally { physics.world.free(); }
});
