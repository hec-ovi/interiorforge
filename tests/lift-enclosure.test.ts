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
import type { Placement } from '../src/placements/types.js';
import { LIFT_CAR, LIFT_SHAFT_FRONT } from '../src/geometry/lift-spec.js';

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

/** One placement's module as a mesh standing where the placement puts it. */
function placedMeshes(placement: Placement): THREE.Mesh[] {
    const recipe = recipes.get(placement.module!)!;
    return recipe.mesh.materials().map(slot => {
        const data = recipe.mesh.getGroup(slot)!, geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
        geometry.setIndex(Array.from(data.indices));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.FrontSide }));
        mesh.position.set(...placement.position);
        mesh.rotation.y = placement.rotationY;
        mesh.scale.set(...placement.scale);
        mesh.updateMatrixWorld(true);
        return mesh;
    });
}

it('closes every view out of the travelling car on its walls, its shut leaves, its head or its sill', () => {
    const { builder, car } = placed();
    const meshes = builder.placements.filter(p => /^lift-car/.test(p.module!)).flatMap(placedMeshes);
    expect(new Set(builder.placements.filter(p => /^lift-car/.test(p.module!)).map(p => p.module)))
        .toEqual(new Set(['lift-car', 'lift-car-doors', 'lift-car-head']));
    const ray = new THREE.Raycaster(), [cx, , cz] = car.position;
    // Eyes across the car, down to one a step from the doors, at seated and standing height.
    for (const [x, y, z] of [[0, 1.7, 0], [.9, 1.7, .9], [-.9, 1.7, .9], [0, 1.05, .8], [-.8, 1.7, -1.3], [.8, 1.2, -1.3], [0, 1.9, -1.3]]) {
        const eye = new THREE.Vector3(cx + x!, y!, cz + z!);
        for (const pitch of [-70, -45, -20, 0, 20, 45, 70]) {
            for (let i = 0; i < 96; i++) {
                const yaw = i * Math.PI * 2 / 96, p = pitch * Math.PI / 180;
                const direction = new THREE.Vector3(Math.cos(yaw) * Math.cos(p), Math.sin(p), Math.sin(yaw) * Math.cos(p));
                ray.set(eye, direction);
                const [hit] = ray.intersectObjects(meshes);
                expect(hit, `view out of the car from ${[x, y, z]} at yaw ${i}/96, pitch ${pitch}`).toBeTruthy();
                // A hit lies on the car itself, never past its shaft.
                expect(Math.abs(hit!.point.x - cx)).toBeLessThan(ELEVATOR.shaft / 2);
                expect(Math.abs(hit!.point.z - cz)).toBeLessThan(ELEVATOR.shaft / 2);
            }
        }
    }
});

it('closes the shaft side of every landing wall line from the floor to the next, except the landing doorway', () => {
    for (const storey of [3.4, 4.5, 6.2]) {
        const builder = new PlacementBuilder();
        lifts(builder, plan, 'floor-slab-stone', 'lobby', 3.4, storey, 0);
        const rect = plan.elevators[0]!.rect, passage = elevatorDoorHole(plan, 0, 0).hole;
        // What stands still in the wall line: shaft walls, the landing's frame and its shut leaves.
        const boxes = builder.placements.filter(p => /^(elevator-shaft-wall|lift-landing-|lift-doors)/.test(p.module!)).map(p => {
            const box = new THREE.Box3();
            for (const mesh of placedMeshes(p)) { mesh.geometry.computeBoundingBox(); box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)); }
            return box;
        });
        // The wall line's shaft side, a hair behind the landing leaves.
        const v = rect.v + LIFT_SHAFT_FRONT.depth / 2;
        for (let u = rect.u + 0.005; u < rect.u + rect.lu; u += 0.05) {
            for (let y = 0.005; y < storey; y += 0.05) {
                const point = new THREE.Vector3(u, y, v);
                if (Math.abs(u - passage.at) < passage.width / 2 && y < 2.20) continue;
                expect(boxes.some(box => box.containsPoint(point)), `open wall line at u ${u.toFixed(3)}, y ${y.toFixed(3)}, storey ${storey}`).toBe(true);
            }
        }
        // And nothing standing in it reaches the car's leaves.
        const reach = Math.max(...builder.placements.filter(p => p.module === 'elevator-shaft-wall').map(p => {
            const box = new THREE.Box3();
            for (const mesh of placedMeshes(p)) { mesh.geometry.computeBoundingBox(); box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld)); }
            // The members of the wall line, not the side linings running the shaft's depth.
            return box.min.z < rect.v + 0.2 && box.max.z - box.min.z < 1 ? box.max.z : -Infinity;
        }));
        expect(reach).toBeLessThan(rect.v + 0.10 - 0.042);
    }
});

it('keeps every member that stands still at a landing out of the car front the car carries past it', () => {
    for (const storey of [3.4, 4.5]) {
        const builder = new PlacementBuilder();
        lifts(builder, plan, 'floor-slab-stone', 'lobby', 3.4, storey, 0);
        const rect = plan.elevators[0]!.rect, car = builder.placements.find(p => p.module === 'lift-car')!;
        const carFront = rect.v + 0.10, reach = LIFT_CAR.door.leaf * car.scale[0] + 0.02;
        // The car's leaves, head and sill pass every floor in this slab of the shaft.
        const envelope = new THREE.Box3(new THREE.Vector3(car.position[0] - reach, -1, carFront + LIFT_CAR.door.plane[0]),
            new THREE.Vector3(car.position[0] + reach, storey + 1, carFront));
        for (const placement of builder.placements.filter(p => !/^lift-car/.test(p.module!))) {
            for (const mesh of placedMeshes(placement)) {
                mesh.geometry.computeBoundingBox();
                const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
                const overlap = box.intersect(envelope);
                const reachesIn = !overlap.isEmpty() && Math.min(...overlap.getSize(new THREE.Vector3()).toArray()) > 1e-6;
                expect(reachesIn, `${placement.module} reaches into the car front`).toBe(false);
            }
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
