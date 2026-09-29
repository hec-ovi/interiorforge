/** Walk an immutable native review artifact using its own published catalog and
 * shell. No generation, runtime source changes or regenerated geometry is used. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import * as THREE from 'three';
import type { PlacementResult } from '../../placements/types.js';
import { RigidFrame2D } from '../../core/rigid-frame.js';
import { roomFootprintContains } from '../../core/room-footprint.js';
import { planDuplexSection } from './section.js';
const [{ floorBoxes }, { buildingFloors, floorPlacements }, { BuildingsLoader }, { cityGltfLoader }, { Physics }, { PlayerBody }] = await Promise.all([
    import(new URL('../../../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
    import(new URL('../../../../engine/src/game/city/InteriorLayouts.js', import.meta.url).href),
    import(new URL('../../../../engine/src/game/city/BuildingsLoader.js', import.meta.url).href),
    import(new URL('../../../../engine/src/game/data/CityGltfLoader.js', import.meta.url).href),
    import(new URL('../../../../engine/src/game/physics/Physics.js', import.meta.url).href),
    import(new URL('../../../../engine/src/game/physics/PlayerBody.js', import.meta.url).href),
]);
const directory = resolve(process.argv[2] ?? '/work/engine/out/reviews/loft-1702-02');
const json = async (file: string) => JSON.parse(await readFile(file, 'utf8'));
const review = await json(join(directory, 'review.json')), id = review.buildings[0].parcelId;
const manifest = await json(join(directory, 'manifest.json'));
const shared = resolve(directory, '../../shared', manifest.interiorModules.shared);
const models = await json(join(shared, manifest.interiorModules.file));
const catalog = new Map<string, { size: number[]; origin: number[] }>(models.modules.map((m: { id: string }) => [m.id, m]));
const building = await json(join(directory, id, 'interior/building.json'));
const layouts = Object.fromEntries(await Promise.all(Object.entries(building.layouts).map(async ([key, file]) =>
    [key, await json(join(directory, id, 'interior', file as string))])));
const interior: PlacementResult = { building, layouts };
const blueprint = await json(join(directory, id, `${id}.blueprint.json`));
const bytes = await readFile(join(directory, id, `${id}.glb`));
const loader = { loadAsync: async (url: string) => {
    assert.equal(url, '/native-shell.glb');
    return cityGltfLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
} };
const factory = { resolver: { resolve: () => null }, build: () => new THREE.MeshBasicMaterial(), variant: () => new THREE.MeshBasicMaterial() };
const city = await new BuildingsLoader(factory, loader).load(new Map([[id, { parcelId: id, blueprint,
    shellUrl: '/native-shell.glb', hasInterior: true, interior }]]));
const physics = await Physics.create(), step = 1 / 60;
const report = { artifact: directory, scope: 'Native published shell/catalog: private stairs up/down, real upper voids and party wall seams. No public-door traversal claim.', pairs: [] as unknown[], success: false };
try {
    physics.addHalfSpace(-.01);
    for (const geometry of city.shellColliders.values()) if (geometry) physics.addTrimesh(geometry);
    for (const floor of buildingFloors(id, interior)) physics.addBoxes(floorBoxes(floorPlacements(floor), floor.elevation, (key: string) => catalog.get(key)));
    physics.step(step);
    for (const ref of interior.building.floors) for (const slice of interior.layouts[ref.layout]!.floor.duplexes ?? []) {
        if (slice.level !== 'lower') continue;
        const section = planDuplexSection({ width: slice.width, depth: slice.depth, pitch: slice.pitch,
            loungeVoidArea: slice.area.loungeVoid, stairOpeningDepth: slice.stairOpeningDepth });
        const frame = new RigidFrame2D(slice.frame.angleDeg, slice.frame.origin);
        const route = section.stair.route.map(([u, y, v]) => { const p = frame.toWorld([u, v]); return new THREE.Vector3(p[0], ref.elevation + y, p[1]); });
        const player = new PlayerBody(physics, route[0]!.clone().add(new THREE.Vector3(0, .025, 0)));
        for (const [direction, targets] of [['up', route], ['down', [...route].reverse()]] as const)
            for (const [index, target] of targets.entries()) walk(player, target, `${slice.id} ${direction} ${index}`);
        physics.world.removeCollider(player.collider, true);
        const lounge = section.loungeVoids[0]!, center = frame.toWorld([lounge.u + lounge.lu / 2, lounge.v + lounge.lv / 2]);
        const voidHit = physics.world.castRay(new physics.rapier.Ray({ x: center[0], y: ref.elevation + slice.pitch + .08, z: center[1] }, { x: 0, y: -1, z: 0 }), slice.pitch + 1, true);
        assert.ok(voidHit && voidHit.timeOfImpact > slice.pitch - 1.8, `${slice.id} has a real upper void`);
        const upperRef = interior.building.floors.find(f => f.index === slice.upperFloor)!;
        const upper = interior.layouts[upperRef.layout]!.floor, sideV = lounge.v + lounge.lv / 2;
        const neighbour = frame.toWorld([-.25, sideV]);
        let seam = false;
        if (upper.rooms.some(room => room.unit && room.unit !== slice.unit && roomFootprintContains(room, neighbour))) {
            const p = frame.toWorld([.6, sideV]), d = frame.toWorld([-.4, sideV]);
            for (const y of [upperRef.elevation + 1.1, upperRef.elevation - (slice.lowerCeilingGap ?? .2) / 2]) {
                const hit = physics.world.castRay(new physics.rapier.Ray({ x: p[0], y, z: p[1] }, { x: d[0] - p[0], y: 0, z: d[1] - p[1] }), 1, true);
                assert.ok(hit && hit.timeOfImpact < .57, `${slice.id} closed finished party wall through seam at ${y}`);
            }
            seam = true;
        }
        report.pairs.push({ id: slice.id, lower: slice.lowerFloor, upper: slice.upperFloor, routePoints: route.length, voidDrop: voidHit.timeOfImpact, partySeamChecked: seam });
    }
    assert.ok(report.pairs.length > 0, 'artifact has no private duplex');
    report.success = true;
} finally {
    physics.world.free();
    const path = join(directory, `duplex-walking-${Date.now()}.json`);
    await writeFile(path, JSON.stringify(report, null, 2) + '\n');
    console.log(path, JSON.stringify(report));
}

function walk(player: { feet: THREE.Vector3; move(v: THREE.Vector3, dt: number): void }, target: THREE.Vector3, label: string) {
    for (let tick = 0; tick < 600; tick++) {
        const delta = target.clone().sub(player.feet); delta.y = 0;
        if (delta.length() < .025) break;
        delta.clampLength(0, 2 * step); physics.step(step); player.move(delta, step);
    }
    for (let tick = 0; tick < 5; tick++) { physics.step(step); player.move(new THREE.Vector3(), step); }
    assert.ok(Math.hypot(player.feet.x - target.x, player.feet.z - target.z) < .045 && Math.abs(player.feet.y - target.y) < .21,
        `${label}: target ${target.toArray()} reached ${player.feet.toArray()}`);
}
