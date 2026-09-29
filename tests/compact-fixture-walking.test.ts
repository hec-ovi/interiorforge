import { beforeAll, expect, it } from 'vitest';
import { Vector3 } from 'three';
import cases from './fixture-data/compact-failures.json' with { type: 'json' };
import { furnish } from '../src/layout/furnish.js';
import { fixtureAccessPaths, type CompactFixture } from '../src/layout/compact-fixtures.js';
import { createRng } from '../src/core/rng.js';
import { idGen } from '../src/layout/rooms.js';
import { props } from '../src/placements/props.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import type { FloorBounds } from '../src/layout/shell.js';
import type { FloorInterior } from '../src/core/types.js';
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

it.each([0, 1])('walks the unchanged actual PlayerBody from the doorway to every fixture in recorded compact room %s', async index => {
  const entry = cases[index]!, room = entry.room as PlanRoom;
  const furniture = furnish([room], 'apartment', createRng(19), idGen(1), entry.bounds as FloorBounds,
    [...entry.openingZones, ...entry.circulationZones], 'poor', [], 'damaged');
  const fixtures: CompactFixture[] = furniture.map(item => {
    const [lu, lv] = item.rotationDeg % 180 ? [item.size[1], item.size[0]] : item.size;
    const footprint = { u: item.at[0] - lu! / 2, v: item.at[1] - lv! / 2, lu: lu!, lv: lv! };
    return { kind: item.kind as CompactFixture['kind'], footprint, operation: footprint, rotationDeg: item.rotationDeg };
  });
  const paths = fixtureAccessPaths(room, fixtures)!;
  expect(paths).not.toBeNull();
  const floor = { furniture: furniture.map(({at, ...item}) => ({ ...item, position: at })), lights: [] } as unknown as FloorInterior;
  const uv = { rooms: [room], furniture } as unknown as UvFloorData, builder = new PlacementBuilder();
  props(builder, floor, uv, 'damaged', { present: new Set(), missing: new Set() });
  const physics = await Physics.create();
  try {
    physics.addHalfSpace(0);
    physics.addBoxes(floorBoxes(builder.placements, 0, (id: string) => catalog.get(id)));
    const start = paths[0]![0]!, body = new PlayerBody(physics, new Vector3(start[0], .025, start[1]));
    const walk = (path: readonly (readonly [number, number])[]) => {
      for (const [x, z] of path) {
        for (let frame = 0; frame < 90; frame++) {
          const direction = new Vector3(x - body.feet.x, 0, z - body.feet.z);
          if (direction.length() < .02) break;
          direction.setLength(Math.min(direction.length(), 1.2 / 60));
          physics.step(1 / 60); body.move(direction, 1 / 60);
        }
        expect(Math.hypot(body.feet.x - x, body.feet.z - z), `fixture approach at ${x},${z}`).toBeLessThan(.025);
      }
    };
    for (const path of paths) { walk(path); walk([...path].reverse()); }
  } finally { physics.world.free(); }
});
