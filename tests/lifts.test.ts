import { expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three/webgpu';
import { moduleRecipes } from '../src/modules/recipes.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { lifts } from '../src/placements/lifts.js';
import { LIFT_LANDING } from '../src/geometry/lift-spec.js';
import { elevatorDoorHole } from '../src/geometry/core-geo.js';
import type { CorePlan } from '../src/layout/core-plan.js';
import { makeFrame, uvRectToFrameRect } from '../src/layout/uv.js';

const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
function core(angle = 0, size = 2.5): CorePlan {
    return { frame: makeFrame(angle), vFace: 10,
        elevators: [{ id: 'elev-0', rect: { u: 4, v: 10, lu: size, lv: size } }],
    } as CorePlan;
}

it('fits a full-sized car and bridges the landing without a shaft gap at every orientation', () => {
    for (const size of [2.5, 3.5]) for (const angle of [0, 90, 180, 35]) {
        const builder = new PlacementBuilder(), plan = core(angle, size);
        lifts(builder, plan, 'floor-slab-stone', 'lobby', 3.4);
        const car = builder.placements.find(p => p.module === 'lift-car')!;
        const recipe = recipes.get('lift-car')!;
        expect(recipe.size[0] * car.scale[0]).toBeCloseTo(size - 0.20, 6);
        expect(recipe.size[2] * car.scale[2]).toBeCloseTo(size - 0.20, 6);
        expect(car.rotationY).toBeCloseTo(-angle * Math.PI / 180, 7);
        const reveal = builder.placements.find(p => p.module === 'lift-reveal-jamb')!;
        expect(reveal.scale[2]).toBeCloseTo(0.10, 6);
        const doors = builder.placements.find(p => p.module === 'lift-doors')!;
        expect(reveal.rotationY).toBeCloseTo(doors.rotationY - Math.PI, 7);
        expect(builder.placements.filter(p => p.module === 'lift-car')).toHaveLength(1);
        expect(builder.placements.filter(p => p.module === 'lift-doors')).toHaveLength(1);
        expect(builder.placements.some(p => p.module === 'lift-landing-header')).toBe(true);
    }
});

it('keeps standing headroom when the same car serves short and tall storeys', () => {
    const builder = new PlacementBuilder();
    lifts(builder, core(), 'floor-slab-stone', 'lobby', 2.5);
    const car = builder.placements.find(p => p.module === 'lift-car')!;
    const recipe = recipes.get('lift-car')!;
    for (const slot of recipe.mesh.materials()) {
        const group = recipe.mesh.getGroup(slot)!;
        for (let i = 0; i < group.positions.length; i += 3) {
            const x = group.positions[i]!, y = group.positions[i + 1]! * car.scale[1];
            const z = group.positions[i + 2]!;
            if (Math.abs(x) < 0.54 && z < -1.04 && y > 0.1) expect(y).toBeGreaterThan(2.1);
        }
    }
});

it('keeps all leaf triangles on one side of the split and all fixed fittings outside the clear aperture', () => {
    const door = recipes.get('lift-doors')!;
    for (const slot of door.mesh.materials()) {
        const group = door.mesh.getGroup(slot)!;
        for (let i = 0; i < group.indices.length; i += 3) {
            const xs = group.indices.slice(i, i + 3).map(index => group.positions[index * 3]!);
            expect(Math.min(...xs) >= 0 || Math.max(...xs) <= 0).toBe(true);
        }
    }
    const builder = new PlacementBuilder(), plan = core();
    lifts(builder, plan, 'floor-slab-stone', 'lobby', 3.4);
    for (const placement of builder.placements.filter(p => /^lift-(landing|reveal)-/.test(p.module!))) {
        const recipe = recipes.get(placement.module!)!;
        const minX = placement.position[0] - recipe.origin[0] * placement.scale[0];
        const maxX = minX + recipe.size[0] * placement.scale[0];
        const minY = placement.position[1] - recipe.origin[1] * placement.scale[1];
        expect(minY >= 2.20 - 1e-6 || maxX <= 5.25 - 0.55 + 1e-6 || minX >= 5.25 + 0.55 - 1e-6).toBe(true);
    }
});

it('shuts a landing with two leaves that meet at zero and close behind both jambs', () => {
    const door = recipes.get('lift-doors')!;
    expect(door.size[0]).toBeCloseTo(2 * LIFT_LANDING.leaf, 9);
    expect(door.origin[0]).toBeCloseTo(LIFT_LANDING.leaf, 9);
    for (const size of [2.5, 3.5]) {
        const builder = new PlacementBuilder(), plan = core(0, size);
        lifts(builder, plan, 'floor-slab-stone', 'lobby', 3.4);
        const leaves = builder.placements.find(p => p.module === 'lift-doors')!;
        const passage = elevatorDoorHole(plan, 0, 0).hole;
        // Each shut leaf runs past the jamb's inner face, so the pair closes with no slit.
        expect(LIFT_LANDING.leaf * leaves.scale[0] - passage.width / 2).toBeGreaterThan(0.01);
        // Slid by half the module's width, each leaf's inner edge clears the doorway.
        expect(LIFT_LANDING.leaf * leaves.scale[0]).toBeGreaterThanOrEqual(passage.width / 2);
    }
});

// Optional sibling-consumer test: no engine source or behavior is changed.
const consumer = resolve('../engine/src/game/city/Elevators.js');
it.skipIf(!existsSync(consumer))('the existing engine mounts generated leaves and carries a rider to each real floor', async () => {
    const { Elevators } = await import(pathToFileURL(consumer).href);
    const material = new THREE.MeshBasicMaterial();
    const factory = { build: () => material, variant: () => material };
    const catalog = {
        boundsOf: (id: string) => recipes.get(id),
        surfacesOf: (id: string) => recipes.get(id)!.mesh.materials().map(slot => {
            const part = recipes.get(id)!.mesh.getGroup(slot)!;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
            geometry.setIndex(Array.from(part.indices));
            return { geometry: geometry.toNonIndexed(), material };
        }),
    };
    const plan = core(), builder = new PlacementBuilder();
    lifts(builder, plan, 'floor-slab-stone', 'lobby', 3.4);
    const floors = [0, 4.5, 7.9, 11.3].map((elevation, floor) => ({ floor, elevation, height: 3.4,
        core: { elevators: plan.elevators.map(lift => ({ id: lift.id, rect: uvRectToFrameRect(lift.rect, plan.frame), doorEdge: 0 })) },
    }));
    const collisionConsumer = resolve('../engine/src/game/city/InteriorBoxes.js');
    const { floorBoxes } = await import(pathToFileURL(collisionConsumer).href);
    const colliders = floorBoxes(builder.placements, 0, catalog.boundsOf);
    // Walk a full body through the opening into the cab. Frame bounding boxes
    // must not silently turn an open portal into a solid cuboid.
    for (const z of [9.8, 10, 10.2, 10.5, 11]) {
        const overlaps = colliders.filter((box: any) =>
            Math.abs(box.center[0] - 5.25) < box.halfExtents[0] + 0.30 - 1e-6 &&
            Math.abs(box.center[1] - 1.05) < box.halfExtents[1] + 1.00 - 1e-6 &&
            Math.abs(box.center[2] - z) < box.halfExtents[2] + 0.30 - 1e-6);
        expect(overlaps).toEqual([]);
    }
    const runtime = new Elevators(factory);
    const [shaft] = runtime.add('building', floors, new THREE.Group());
    for (const floor of floors) for (const placement of builder.placements.filter(p => ['lift-car', 'lift-doors'].includes(p.module!))) {
        expect(runtime.mount('building', floor.floor, placement, catalog, new THREE.Group())).toBe(true);
    }
    expect(shaft.car).toBeTruthy();
    expect(shaft.stops.every((stop: any) => stop.leaves.length === 2)).toBe(true);
    const body = { feet: new THREE.Vector3(shaft.centre.x, 0.05, shaft.centre.z),
        teleport(point: THREE.Vector3) { this.feet.copy(point); } };
    for (const destination of [3, 1, 0]) {
        shaft.selected = destination;
        shaft.press({ inside: true });
        for (let i = 0; i < 600; i++) runtime.update(1 / 30, body);
        expect(shaft.at).toBeCloseTo(floors[destination]!.elevation, 6);
        expect(body.feet.y).toBeCloseTo(floors[destination]!.elevation + 0.05, 6);
        expect(shaft.stops[destination].open).toBe(1);
        expect(shaft.stops.filter((stop: any) => stop.open > 0)).toHaveLength(1);
    }
});
