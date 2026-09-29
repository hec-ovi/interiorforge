import { expect, it } from 'vitest';
import * as THREE from 'three';
import { planDuplexSection } from '../src/layout/duplex/section.js';
import { duplexCapability } from '../src/layout/duplex/capability.js';
import { planDuplexProgram } from '../src/layout/duplex/program.js';
import { roomArea } from '../src/layout/room-shape.js';
import { Ajv2020 } from 'ajv/dist/2020.js';
import floorSchema from '../schemas/floor.schema.json';
import { moduleRecipes } from '../src/modules/recipes.js';
import { makeFrame, uvToWorld } from '../src/layout/uv.js';

const [{ floorBoxes }, { buildingFloors }, { interiorStoreys, cutPlate }, { Physics }, { PlayerBody }] = await Promise.all([
  import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
  import(new URL('../../engine/src/game/city/InteriorLayouts.js', import.meta.url).href),
  import(new URL('../../engine/src/game/city/StoreyPlates.js', import.meta.url).href),
  import(new URL('../../engine/src/game/physics/Physics.js', import.meta.url).href),
  import(new URL('../../engine/src/game/physics/PlayerBody.js', import.meta.url).href),
]);
const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const STEP = 1 / 60;

it('publishes schema-valid private slice metadata without suppressing a floor-wide core', () => {
  const valid = new Ajv2020({ strict: false }).compile(floorSchema);
  const source = duplexCapability(planDuplexSection({ pitch: 3.2 }), 37, [23, -12]);
  for (const layout of Object.values(source.layouts)) {
    expect(valid(layout.floor), JSON.stringify(valid.errors)).toBe(true);
    expect(layout.floor.mezzanineOf).toBeUndefined();
    expect(layout.floor.duplexes![0]!.unit).toBe('duplex-105');
  }
});

it('keeps the full two-level private program, one entrance and no independent upper home', () => {
  const section = planDuplexSection({ pitch: 3.2 });
  const program = planDuplexProgram(section, 'home-105');
  expect(new Set([...program.lower, ...program.upper].map(room => room.unit))).toEqual(new Set(['home-105']));
  expect(program.lower.reduce((sum, room) => sum + roomArea(room), 0)).toBeCloseTo(150);
  expect(program.upper.reduce((sum, room) => sum + roomArea(room), 0)).toBeCloseTo(100);
  expect(Object.values(program.roles)).toEqual(expect.arrayContaining(['guest', 'primary', 'kitchen', 'bathroom', 'utility', 'dressing', 'linen', 'study', 'living', 'gallery']));
  expect(program.entrance.width).toBe(1.6);
  expect(program.upper.flatMap(room => room.doors).every(door => program.upper.some(room => room.id === door.to))).toBe(true);
});

it('accounts for the authored type C as 150 lower + 100 upper, with separate 38 and 12 m² openings', () => {
  const section = planDuplexSection({ pitch: 3.2 });
  expect(section.lowerArea).toBe(150);
  expect(section.upperArea).toBeCloseTo(100);
  expect(section.grossArea).toBeCloseTo(250);
  expect(section.loungeVoids.reduce((sum, rect) => sum + rect.lu * rect.lv, 0)).toBeCloseTo(38);
  expect(section.stairOpening.lu * section.stairOpening.lv).toBeCloseTo(12);
  expect(section.stair.clearWidth).toBeGreaterThanOrEqual(1.3);
  expect(section.stair.rise).toBeGreaterThanOrEqual(.16);
  expect(section.stair.rise).toBeLessThanOrEqual(.18);
  expect(() => planDuplexSection({ pitch: 4.5 })).toThrow(/opening depth must be at least/);
});

it.each([0, 37])('the unchanged Engine removes the shell plate over both private upper voids at %s degrees', angle => {
  const source = duplexCapability(planDuplexSection({ pitch: 3.2 }), angle, [23, -12]);
  const storeys = interiorStoreys('duplex-capability', source);
  expect([...storeys.keys()]).toEqual([0, 1]);
  // The whole occupied envelope is handed to Interior; an upper polygon hole
  // must not make the original Exterior plate reappear inside that hole.
  const ring = source.layouts.crown!.floor.rooms[0]!.polygon;
  const [a, b, c, d] = ring;
  const geometry = new THREE.BufferGeometry();
  const positions = [a!, c!, b!, a!, d!, c!].flatMap(p => [p[0], 3.2, p[1]]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  expect(cutPlate(geometry, storeys.get(1)!.rect)).toBeNull();
  geometry.dispose();
});

it.each([[3, 0], [3.2, 0], [3.2, 37], [3.6, 37]])(
  'walks the real player up and down the private two-flight stair, pitch %s angle %s', async (pitch, angle) => {
    const section = planDuplexSection({ pitch: pitch! });
    const source = duplexCapability(section, angle!);
    const physics = await Physics.create();
    try {
      for (const floor of buildingFloors('duplex-capability', source))
        physics.addBoxes(floorBoxes(floor.placements, floor.elevation, (id: string) => catalog.get(id)));
      physics.step(STEP);
      const frame = makeFrame(angle!);
      for (const lateral of [-.27, .27]) {
        const route = section.stair.route.map(([u, y, v]) => {
          const [x, z] = uvToWorld([u + lateral, v], frame); return new THREE.Vector3(x, y, z);
        });
        const player = new PlayerBody(physics, route[0]!.clone().add(new THREE.Vector3(0, .025, 0)));
        for (const [index, target] of route.entries()) walk(physics, player, target, `up ${index} lateral ${lateral}`);
        for (const [index, target] of [...route].reverse().entries()) walk(physics, player, target, `down ${index} lateral ${lateral}`);
        physics.world.removeCollider(player.collider, true);
      }
    } finally { physics.world.free(); }
  }, 180_000);

function walk(physics: { step(dt: number): void }, player: { feet: THREE.Vector3; move(v: THREE.Vector3, dt: number): void },
  target: THREE.Vector3, label: string): void {
  for (let tick = 0; tick < 600; tick++) {
    const delta = target.clone().sub(player.feet); delta.y = 0;
    if (delta.length() < .025) break;
    delta.clampLength(0, 2 * STEP);
    physics.step(STEP); player.move(delta, STEP);
  }
  for (let tick = 0; tick < 5; tick++) { physics.step(STEP); player.move(new THREE.Vector3(), STEP); }
  expect(Math.hypot(player.feet.x - target.x, player.feet.z - target.z),
    `${label}: target ${target.toArray()} reached ${player.feet.toArray()}`).toBeLessThan(.045);
  expect(Math.abs(player.feet.y - target.y), `${label}: target ${target.toArray()} reached ${player.feet.toArray()}`).toBeLessThan(.21);
}
