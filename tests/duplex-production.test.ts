import { expect, it } from 'vitest';
import * as THREE from 'three';
import { generate, expandBuilding, findPath } from '../src/index.js';
import type { InteriorRequest } from '../src/core/types.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { planDuplexSection } from '../src/layout/duplex/section.js';
import { RigidFrame2D } from '../src/core/rigid-frame.js';
import { roomFootprintContains } from '../src/core/room-footprint.js';

const [{ generate: exterior }, { floorBoxes }, { buildingFloors, floorPlacements }, { BuildingsLoader },
  { cityGltfLoader }, { Physics }, { PlayerBody }] = await Promise.all([
  import(new URL('../../exterior/src/index.ts', import.meta.url).href),
  import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
  import(new URL('../../engine/src/game/city/InteriorLayouts.js', import.meta.url).href),
  import(new URL('../../engine/src/game/city/BuildingsLoader.js', import.meta.url).href),
  import(new URL('../../engine/src/game/data/CityGltfLoader.js', import.meta.url).href),
  import(new URL('../../engine/src/game/physics/Physics.js', import.meta.url).href),
  import(new URL('../../engine/src/game/physics/PlayerBody.js', import.meta.url).href),
]);
const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const STEP = 1 / 60;
const factory = { resolver: { resolve: () => null }, build: () => new THREE.MeshBasicMaterial(), variant: () => new THREE.MeshBasicMaterial() };

it.each([[40, 0], [60, 37]])('publishes and walks private duplex pairs in the real %s m shell at %s degrees', async (width, angle) => {
  const frame = new RigidFrame2D(angle!, [19, -11]);
  const shellRequest = { buildingId: `duplex-${width}-${angle}`, seed: 'duplex-1702', theme: 'cyberpunk',
    parcel: { footprint: [[0, 0], [width!, 0], [width!, 40], [0, 40]].map(p => frame.toWorld(p as [number, number])),
      accessPoint: frame.toWorld([width! / 2, 0]), maxHeight: 28 },
    building: { type: 'residential', tier: 'high_rich', floors: 5 },
    options: { architecture: 'balcony-grid', glb: 'named', roofArtifacts: 'off', facadeServices: 'off' } };
  const shell = await exterior(shellRequest, { textures: { mode: 'keys' } });
  const request: InteriorRequest = { seed: shellRequest.seed,
    building: { id: shellRequest.buildingId, type: 'residential', tier: 'high_rich', interiorStyle: 'apartment-1702' },
    blueprint: shell.blueprint, materialTheme: 'cyberpunk',
    assignments: [{ floor: 0, kind: 'lobby' }, { floor: 1, kind: 'apartment', spans: 2 }, { floor: 3, kind: 'apartment', spans: 2 }] };
  const started = performance.now();
  const source = await generate(request, { models: new Set() });
  console.info(`duplex ${width}/${angle} producer ${(performance.now() - started).toFixed(0)} ms`);
  expect(source.building.interiorStyle).toBe('apartment-1702');
  const refs = source.building.floors;
  const privateConnectors = source.building.connectors.filter(c => c.id.endsWith('-duplex'));
  expect(privateConnectors.length).toBeGreaterThanOrEqual(4);
  for (const connector of privateConnectors) expect([[1, 2], [3, 4]]).toContainEqual(connector.floors);
  for (const connector of source.building.connectors.filter(c => c.kind === 'elevator')) expect(connector.floors).toEqual([0, 1, 2, 3, 4]);
  for (const ref of refs.filter(ref => ref.index < 5)) {
    const floor = source.layouts[ref.layout]!.floor;
    expect(floor.mezzanineOf).toBeUndefined();
    expect(floor.core.stairs.length).toBeGreaterThan(0);
    expect(floor.core.elevators.length).toBe(2);
    const upperUnits = new Set((floor.duplexes ?? []).filter(slice => slice.level === 'upper').map(slice => slice.unit));
    expect((ref.apartmentEntrances ?? []).every(entry => !upperUnits.has(entry.unit))).toBe(true);
    const ids = floor.furniture.map(piece => piece.id);
    expect(new Set(ids).size).toBe(ids.length);
  }
  const loader = { loadAsync: async (url: string) => {
    if (url !== '/duplex-shell.glb') throw new Error('Decorative plants are not physical shell');
    return cityGltfLoader().parseAsync(shell.glb.buffer.slice(shell.glb.byteOffset, shell.glb.byteOffset + shell.glb.byteLength), '');
  } };
  const city = await new BuildingsLoader(factory, loader).load(new Map([[shellRequest.buildingId,
    { parcelId: shellRequest.buildingId, blueprint: shell.blueprint, shellUrl: '/duplex-shell.glb', hasInterior: true, interior: source }]]));
  const physics = await Physics.create();
  console.info(`duplex ${width}/${angle} shell+physics ready ${(performance.now() - started).toFixed(0)} ms`);
  try {
    physics.addHalfSpace(-.01);
    for (const geometry of city.shellColliders.values()) if (geometry) physics.addTrimesh(geometry);
    for (const floor of buildingFloors(shellRequest.buildingId, source))
      physics.addBoxes(floorBoxes(floorPlacements(floor), floor.elevation, (id: string) => catalog.get(id)));
    physics.step(STEP);
    const nav = expandBuilding(source).npc.nav;
    let partySeams = 0;
    for (const ref of refs) for (const slice of source.layouts[ref.layout]!.floor.duplexes ?? []) {
      if (slice.level !== 'lower') continue;
      const section = planDuplexSection({ width: slice.width, depth: slice.depth, pitch: slice.pitch,
        loungeVoidArea: slice.area.loungeVoid, stairOpeningDepth: slice.stairOpeningDepth });
      expect(slice.area.lower + slice.area.upper).toBeCloseTo(section.grossArea);
      const privateFrame = new RigidFrame2D(slice.frame.angleDeg, slice.frame.origin);
      const route = section.stair.route.map(([u, y, v]) => {
        const p = privateFrame.toWorld([u, v]); return new THREE.Vector3(p[0], ref.elevation + y, p[1]);
      });
      const journey = findPath({ nav, from: { floor: slice.lowerFloor, x: slice.lowerEntry[0], z: slice.lowerEntry[1] },
        to: { floor: slice.upperFloor, x: slice.upperEntry[0], z: slice.upperEntry[1] } });
      expect('legs' in journey, JSON.stringify(journey)).toBe(true);
      if ('legs' in journey) expect(journey.connectors.some(transfer => transfer.id === slice.id)).toBe(true);
      const player = new PlayerBody(physics, route[0]!.clone().add(new THREE.Vector3(0, .025, 0)));
      for (const [index, target] of route.entries()) walk(physics, player, target, `${slice.id} up ${index}`);
      for (const [index, target] of [...route].reverse().entries()) walk(physics, player, target, `${slice.id} down ${index}`);
      physics.world.removeCollider(player.collider, true);
      // A ray at the centre of the upper lounge opening cannot hit an upper
      // floor, ceiling patch or the original Exterior plate at that height.
      const lounge = section.loungeVoids[0]!;
      const p = privateFrame.toWorld([lounge.u + lounge.lu / 2, lounge.v + lounge.lv / 2]);
      const ray = new physics.rapier.Ray({ x: p[0], y: ref.elevation + slice.pitch + .08, z: p[1] }, { x: 0, y: -1, z: 0 });
      const hit = physics.world.castRay(ray, slice.pitch + 1, true);
      expect(hit).not.toBeNull();
      expect(hit.timeOfImpact).toBeGreaterThan(slice.pitch - 1.8);
      const upperRef = refs.find(ref => ref.index === slice.upperFloor)!;
      const upper = source.layouts[upperRef.layout]!.floor;
      const sideV = lounge.v + lounge.lv / 2;
      const neighbour = privateFrame.toWorld([-.25, sideV]);
      if (upper.rooms.some(room => room.unit && room.unit !== slice.unit && roomFootprintContains(room, neighbour))) {
        const p = privateFrame.toWorld([.6, sideV]);
        const d = privateFrame.toWorld([-.4, sideV]);
        for (const y of [upperRef.elevation + 1.1, upperRef.elevation - (slice.lowerCeilingGap ?? .2) / 2]) {
          const ray = new physics.rapier.Ray({ x: p[0], y, z: p[1] }, { x: d[0] - p[0], y: 0, z: d[1] - p[1] });
          const wall = physics.world.castRay(ray, 1, true);
          expect(wall, `${slice.unit} loft party wall at ${y}`).not.toBeNull();
          expect(wall.timeOfImpact, `${slice.unit} has its own closed finished face through the floor seam`).toBeLessThan(.57);
        }
        partySeams++;
      }
    }
    expect(partySeams).toBeGreaterThan(0);
  } finally { physics.world.free(); }
// Full detailed meshes now pass shell/doorway geometry checks on five unique
// storeys; profile.ts measures that producer work separately from walking.
}, 240_000);

function walk(physics: { step(dt: number): void }, player: { feet: THREE.Vector3; move(v: THREE.Vector3, dt: number): void },
  target: THREE.Vector3, label: string): void {
  for (let tick = 0; tick < 600; tick++) {
    const delta = target.clone().sub(player.feet); delta.y = 0;
    if (delta.length() < .025) break;
    delta.clampLength(0, 2 * STEP); physics.step(STEP); player.move(delta, STEP);
  }
  for (let tick = 0; tick < 5; tick++) { physics.step(STEP); player.move(new THREE.Vector3(), STEP); }
  expect(Math.hypot(player.feet.x - target.x, player.feet.z - target.z),
    `${label}: target ${target.toArray()} reached ${player.feet.toArray()}`).toBeLessThan(.045);
  expect(Math.abs(player.feet.y - target.y), `${label}: target ${target.toArray()} reached ${player.feet.toArray()}`).toBeLessThan(.21);
}
