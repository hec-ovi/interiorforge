import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three/webgpu';
import { moduleRecipes } from '../src/modules/recipes.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { lifts } from '../src/placements/lifts.js';
import { ELEVATOR } from '../src/layout/constants.js';
import { elevatorDoorHole } from '../src/geometry/core-geo.js';
import { makeFrame, uvRectToFrameRect } from '../src/layout/uv.js';
import type { CorePlan } from '../src/layout/core-plan.js';

const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const plan = { frame: makeFrame(0), vFace: 10,
    elevators: [{ id: 'elev-0', rect: { u: 4, v: 10, lu: ELEVATOR.shaft, lv: ELEVATOR.shaft } }],
} as CorePlan;
function placed() {
    const builder = new PlacementBuilder();
    const lights = lifts(builder, plan, 'floor-slab-stone', 'lobby', 4.5, 4.5, 9);
    return { builder, lights, car: builder.placements.find(p => p.module === 'lift-car')! };
}
function cabMeshes(scale: number[]): THREE.Mesh[] {
    const recipe = recipes.get('lift-car')!;
    return recipe.mesh.materials().map(slot => {
        const data = recipe.mesh.getGroup(slot)!, geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
        geometry.setIndex(Array.from(data.indices));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
        mesh.scale.set(...scale as [number, number, number]);
        mesh.updateMatrixWorld(true);
        return mesh;
    });
}

it('reserves a spacious cabin and keeps its landing lights on its actual ceiling lenses', () => {
    const { car, lights } = placed();
    expect(ELEVATOR.shaft).toBeGreaterThanOrEqual(3.5);
    expect(2.14 * car.scale[0]).toBeGreaterThan(3.0);
    expect(elevatorDoorHole(plan, 0, 0).hole.width).toBeGreaterThan(1.5);
    expect(lights).toHaveLength(1);
    expect(lights[0]!.id).toBe(car.id);
    for (const light of lights) {
        expect(light.position[1]).toBeCloseTo(9 + 2.445 * car.scale[1] - .002);
        expect(light.length).toBeCloseTo(1.65 * car.scale[2]);
        expect(light.intensity).toBeGreaterThanOrEqual(800);
    }
    expect(recipes.get('lift-car')!.mesh.materials().some(key => key.includes('mirror'))).toBe(false);
});

it('opaque inward-facing walls close every view except the real entrance, including near corners', () => {
    const { car } = placed(), meshes = cabMeshes(car.scale), ray = new THREE.Raycaster();
    for (const eye of [[0, 1.7, 0], [.8, 1.7, .8], [-.8, 1.7, .8], [0, 1.05, .8]]) {
        for (let i = 0; i < 96; i++) {
            const angle = i * Math.PI * 2 / 96, direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
            // A ray may leave through the single front aperture, whose width follows the car.
            const toFront = (-1.15 * car.scale[2] - eye[2]!) / direction.z;
            const apertureX = eye[0]! + direction.x * toFront;
            if (toFront > 0 && Math.abs(apertureX) < .56 * car.scale[0]) continue;
            ray.set(new THREE.Vector3(...eye as [number, number, number]), direction);
            expect(ray.intersectObjects(meshes).length, `open wall from ${eye} at ${angle}`).toBeGreaterThan(0);
        }
        for (const direction of [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)]) {
            ray.set(new THREE.Vector3(...eye as [number, number, number]), direction);
            expect(ray.intersectObjects(meshes).length).toBeGreaterThan(0);
        }
    }
});

const engine = resolve('../engine/src/game');
it.skipIf(!existsSync(engine))('real player collision keeps the camera inside cab skins and crosses the flush threshold', async () => {
    const load = (path: string) => import(pathToFileURL(resolve(engine, path)).href);
    const [{ Physics }, { PlayerBody }, { floorBoxes }, { Elevators }] = await Promise.all([
        load('physics/Physics.js'), load('physics/PlayerBody.js'), load('city/InteriorBoxes.js'), load('city/Elevators.js'),
    ]);
    const physics = await Physics.create(), { builder, car } = placed();
    const walls = floorBoxes(builder.placements, 0, (id: string) => recipes.get(id));
    physics.addBoxes([...walls, { center: [5.75, -.075, 9], halfExtents: [3, .075, 1], rotationY: 0 }]);
    const dynamic = new Map<string, any>();
    const colliders = { solid(id: string, boxes: any[]) { dynamic.set(id, physics.addBoxes(boxes)); },
        drop(id: string) { const item = dynamic.get(id); if (item) physics.world.removeRigidBody(item.body); dynamic.delete(id); } };
    const material = new THREE.MeshBasicMaterial();
    const runtime = new Elevators({ build: () => material, variant: () => material }, colliders);
    runtime.add('test', [{ floor: 0, elevation: 0, height: 4.5,
        core: { elevators: plan.elevators.map(lift => ({ id: lift.id, rect: uvRectToFrameRect(lift.rect, plan.frame), doorEdge: 0 })) } }], new THREE.Group());
    const cx = 4 + ELEVATOR.shaft / 2, cz = 10 + ELEVATOR.shaft / 2;
    const body = new PlayerBody(physics, new THREE.Vector3(cx, .025, cz));
    const tick = (direction: THREE.Vector3, frames: number) => {
        for (let i = 0; i < frames; i++) { physics.step(1 / 60); body.move(direction.clone().multiplyScalar(.05), 1 / 60); }
    };
    const meshes = cabMeshes(car.scale), ray = new THREE.Raycaster();
    for (const direction of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1]]) {
        body.teleport(new THREE.Vector3(cx, .025, cz));
        const forward = new THREE.Vector3(...direction as [number, number, number]).normalize();
        tick(forward, 160);
        const eye = body.eye.clone().sub(new THREE.Vector3(cx, 0, cz));
        expect(Math.abs(eye.x)).toBeLessThan(1.056 * car.scale[0]);
        expect(eye.z).toBeLessThan(1.042 * car.scale[2]);
        ray.set(eye, forward);
        expect(ray.intersectObjects(meshes)[0]?.distance).toBeGreaterThan(.10);
        expect(body.feet.y).toBeCloseTo(.02, 2);
    }
    body.teleport(new THREE.Vector3(cx, .025, cz));
    tick(new THREE.Vector3(0, 0, -1), 50);
    expect(body.feet.z).toBeLessThan(9.5);
    expect(body.feet.y).toBeCloseTo(.02, 2);
    tick(new THREE.Vector3(0, 0, 1), 50);
    expect(body.feet.z).toBeGreaterThan(11.5);
    expect(body.feet.y).toBeCloseTo(.02, 2);
    physics.world.free();
});
