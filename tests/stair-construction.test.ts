import { expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { makePlacementFixture } from '../src/index.js';
import { planCore, type CorePlan } from '../src/layout/core-plan.js';
import { makeFrame, uvToWorld } from '../src/layout/uv.js';
import { baseLanding, computeStairSteps, entryAtLowEnd } from '../src/geometry/stairs.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import type { LightFixture } from '../src/core/types.js';
import { PlacementBuilder, litModule } from '../src/placements/builder.js';
import type { BuildingManifest, FloorPlacement, LayoutMap } from '../src/placements/types.js';
import { publishStairSoffits } from '../src/placements/stair-soffits.js';
import { stairs } from '../src/placements/stairs.js';
import type { Family } from '../src/placements/finish.js';
const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
const geometry = (id: string, opaque = false) => {
    const positions: number[] = [], indices: number[] = [];
    for (const slot of recipes.get(id)!.mesh.materials()) {
        if (opaque && slot.includes('glass')) continue;
        const group = recipes.get(id)!.mesh.getGroup(slot)!, offset = positions.length / 3;
        positions.push(...group.positions); indices.push(...group.indices.map(index => index + offset));
    }
    const result = new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    result.setIndex(indices); return result;
};
const basic = new MeshBasicMaterial();
function coreAt(angle = 0): CorePlan {
    const core = planCore(makePlacementFixture({ width: 40, depth: 40, floors: 3 }), []);
    return { ...core, frame: makeFrame(angle), mode: 'compact', vFace: 54.5,
        stairA: { u: 92.5, v: 54.5, lu: 4.5, lv: 8 }, stairB: undefined };
}
it('authors one smooth closed soffit with sealed side profiles, end bearing and recessed finish support', () => {
    for (let n = 7; n <= 14; n++) {
        const mesh = new Mesh(geometry(`stair-flight-${n}`), basic); mesh.updateMatrixWorld();
        const parts = [mesh, ...Array.from({ length: n }, (_, i) => {
            const soffit = new Mesh(geometry(`stair-soffit-${i}`), basic);
            soffit.position.set(0, i * .17, i * .28); soffit.updateMatrixWorld(); return soffit;
        })];
        for (let i = 0; i < n; i++) for (const f of [.2, .5, .8]) {
            const z = (i + f) * .28, bottom = (i + f) * .17 - .15;
            const hit = new Raycaster(new Vector3(.725, bottom - .02, z), new Vector3(0, 1, 0), 0, .03).intersectObjects(parts)[0];
            expect(hit, `flight ${n}, tread ${i}`).toBeDefined();
            expect(hit!.point.y).toBeCloseTo(bottom, 6);
            expect(hit!.face!.normal.y).toBeLessThan(-.8);
            const side = new Raycaster(new Vector3(-.02, bottom + .025, z), new Vector3(1, 0, 0), 0, .03).intersectObject(mesh)[0];
            expect(side).toBeDefined();
        }
        for (const part of parts) part.geometry.dispose();
    }
});
it('owns each landing and upper-flight soffit once, closing both return views with only bands 0 and 1', () => {
    const core = coreAt(), meshes: Mesh[] = [];
    const floors: BuildingManifest['floors'] = [
        { index: 0, layout: 'ground', elevation: 0, openings: {} },
        { index: 1, layout: 'middle', elevation: 4.5, openings: {} },
        { index: 2, layout: 'crown', elevation: 9, openings: {} },
    ];
    const layouts: LayoutMap<Pick<FloorPlacement, 'placements'>> = {};
    for (const floor of floors) {
        const builder = new PlacementBuilder(); stairs(builder, core, 4.5, 'floor-slab-plank', false, floor.index === 0, 'luxury');
        if (floor.index) expect(builder.placements.filter(p => p.module?.startsWith('floor-slab-') && Math.abs(p.position[1]) < 1e-6)).toHaveLength(0);
        layouts[floor.layout] = { placements: builder.placements };
    }
    const total = () => floors.flatMap(floor => [...layouts[floor.layout]!.placements, ...(floor.treatments ?? [])])
        .filter(p => p.module?.startsWith('stair-soffit-')).length;
    const before = total();
    publishStairSoffits(floors, layouts);
    expect(total()).toBe(before);
    expect(layouts.middle!.placements.some(p => p.module?.startsWith('stair-soffit-'))).toBe(false);
    for (const floor of floors.filter(f => f.index < 2)) for (const p of [...layouts[floor.layout]!.placements, ...(floor.treatments ?? [])]) {
        const mesh = new Mesh(geometry(p.module!, true), basic); mesh.position.set(p.position[0], p.position[1] + floor.elevation, p.position[2]);
        mesh.rotation.y = p.rotationY; mesh.scale.fromArray(p.scale); mesh.updateMatrixWorld();
        mesh.userData.floor = floor.index; mesh.userData.module = p.module; meshes.push(mesh);
    }
    for (const [at, direction] of [[[95.85, 3.9701, 60.90], [.10393133899, .67880227085, -.72692898818]],
        [[95.85, 5.0555, 58.40], [-.56914837361, .74731260345, -.34291981794]]] as const) {
        const hit = new Raycaster(new Vector3(...at), new Vector3(...direction), 0, 50).intersectObjects(meshes)[0]!;
        expect(hit.object.userData).toMatchObject({ floor: 1, module: 'floor-slab-plank' });
        expect(hit.point.y).toBeCloseTo(8.85, 5);
    }
    // A steeper ray formerly escaped beyond the repaired landing and needed the
    // unstreamed next outgoing flight. Its ceiling face now belongs to band 1.
    const camera = new PerspectiveCamera(72, 1600 / 900, .01, 100);
    camera.position.set(95.85, 3.9701, 60.90); camera.rotation.set(.47322, .1702119, 0, 'YXZ'); camera.updateMatrixWorld();
    const ray = new Raycaster(); ray.setFromCamera(new Vector2(600 / 1600 * 2 - 1, 1 - 140 / 900 * 2), camera);
    const hit = ray.intersectObjects(meshes)[0]!;
    expect(hit.object.userData.floor).toBe(1);
    expect(hit.object.userData.module).toMatch(/^stair-soffit-/);
    expect(hit.point.y).toBeGreaterThan(9);
    for (const mesh of meshes) mesh.geometry.dispose();
});
it.each(['luxury', 'corporate', 'capsule', 'damaged', 'industrial'] as Family[])('keeps the real %s profile walkable with canonical collider bounds', async family => {
    const [{ Physics }, { PlayerBody }, { floorBoxes }] = await Promise.all([
        import(new URL('../../engine/src/game/physics/Physics.js', import.meta.url).href),
        import(new URL('../../engine/src/game/physics/PlayerBody.js', import.meta.url).href),
        import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
    ]);
    for (const angle of [0, 37]) {
        const core = coreAt(angle), builder = new PlacementBuilder();
        const fixtures: LightFixture[] = [];
        stairs(builder, core, 4.5, family === 'luxury' ? 'floor-slab-plank' : 'floor-slab-stone', false, true, family, { fixtures, elevation: 0 });
        expect(builder.placements.filter(p => litModule(p.module!)).map(p => p.id).sort()).toEqual(fixtures.map(light => light.id).sort());
        expect(builder.placements.filter(p => p.module?.startsWith(`stair-side-${family}-`))).toHaveLength(52);
        expect(builder.placements.filter(p => p.module === `stair-tread-${family}`)).toHaveLength(26);
        const physics = await Physics.create();
        try {
            physics.addHalfSpace(-.01);
            const flightBoxes = floorBoxes(builder.placements.filter(p => p.module?.startsWith('stair-flight-')), 0, (id: string) => recipes.get(id));
            const soffitBoxes = floorBoxes(builder.placements.filter(p => p.module?.startsWith('stair-soffit-')), 0, (id: string) => recipes.get(id));
            for (const box of soffitBoxes) expect(flightBoxes.some((parent: { center: number[]; halfExtents: number[]; rotationY: number }) => {
                const delta = new Vector3(...box.center).sub(new Vector3(...parent.center)).applyAxisAngle(new Vector3(0, 1, 0), -parent.rotationY);
                return [delta.x, delta.y, delta.z].every((v, i) => Math.abs(v) + box.halfExtents[i] <= parent.halfExtents[i]! + 1e-6);
            }), 'soffit collider is inside the canonical step volume').toBe(true);
            const upper = new PlacementBuilder(); stairs(upper, core, 4.5, 'floor-slab-stone', false, false, family);
            const floorRefs: BuildingManifest['floors'] = [
                { index: 0, layout: 'ground', elevation: 0, openings: {} },
                { index: 1, layout: 'middle', elevation: 4.5, openings: {} },
            ];
            const layoutRefs = { ground: { placements: builder.placements }, middle: { placements: upper.placements } };
            publishStairSoffits(floorRefs, layoutRefs);
            for (const ref of floorRefs) physics.addBoxes(floorBoxes([...layoutRefs[ref.layout as 'ground' | 'middle'].placements,
                ...(ref.treatments ?? [])], ref.elevation, (id: string) => recipes.get(id)));
            const low = entryAtLowEnd(core, 'a'), steps = [baseLanding(core.stairA, low, 0),
                ...computeStairSteps(core.stairA, low, 0, 4.5), ...computeStairSteps(core.stairA, low, 4.5, 4.5)];
            const points = steps.map(step => { const [x, z] = uvToWorld([step.u + step.lu / 2, step.v + step.lv / 2], core.frame); return new Vector3(x, step.y, z); });
            const player = new PlayerBody(physics, points[0]!.clone().add(new Vector3(0, .025, 0)));
            for (const target of [...points, ...[...points].reverse()]) {
                for (let frame = 0; frame < 400; frame++) {
                    const delta = target.clone().sub(player.feet).setY(0);
                    if (delta.length() < .035) break;
                    delta.clampLength(0, 2.5 / 60); physics.step(1 / 60); player.move(delta, 1 / 60);
                }
                expect(Math.hypot(target.x - player.feet.x, target.z - player.feet.z), `${family} ${angle} at ${target.toArray()}`).toBeLessThan(.05);
                expect(Math.abs(player.feet.y - target.y)).toBeLessThan(.24);
            }
            physics.world.removeCollider(player.collider, true);
            // The sloped infill must not become one tall invisible rectangle below
            // a flight: its tread-length collision pieces preserve this real clearance.
            const under = (u: number) => { const [x, z] = uvToWorld([u, core.stairA.v + 2.05 + 3.9 - .15], core.frame); return new Vector3(x, .025, z); };
            const from = under(core.stairA.u + 3.35), to = under(core.stairA.u + 1.15);
            const below = new PlayerBody(physics, from);
            for (let frame = 0; frame < 200; frame++) {
                const delta = to.clone().sub(below.feet).setY(0);
                if (delta.length() < .035) break;
                delta.clampLength(0, 2.5 / 60); physics.step(1 / 60); below.move(delta, 1 / 60);
            }
            expect(Math.hypot(to.x - below.feet.x, to.z - below.feet.z), `${family} clear below flight`).toBeLessThan(.05);
        } finally { physics.world.free(); }
    }
}, 180_000);
