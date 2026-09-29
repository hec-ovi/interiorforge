import { expect, it } from 'vitest';
import { Vector3 } from 'three';
import { makePlacementFixture } from '../src/index.js';
import { STAIR, WALL } from '../src/layout/constants.js';
import { planCore, type CorePlan } from '../src/layout/core-plan.js';
import { makeFrame, uvToWorld } from '../src/layout/uv.js';
import { baseLanding, entryAtLowEnd } from '../src/geometry/stairs.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { stairs } from '../src/placements/stairs.js';

function coreFixture(compact: boolean, angle: number): CorePlan {
    const request = makePlacementFixture({ seed: 'terminal-stair', width: 40, depth: 30, floors: 4, type: 'residential', tier: 'mid' });
    const core = planCore(request, []);
    const dimensions = compact ? { lu: 2.9, lv: 6.5 } : { lu: 6.5, lv: 2.9 };
    return { ...core, frame: makeFrame(angle), mode: compact ? 'compact' : 'standard', vFace: 2,
        stairA: { u: 2, v: 2, ...dimensions }, stairB: { u: 12, v: 2, ...dimensions } };
}

it.each([false, true])('guards terminal floors and roof arrivals while leaving ongoing flights open (compact %s)', compact => {
    const core = coreFixture(compact, 0);
    for (const [climb, roof, lowest, count] of [[0, false, false, 2], [4.5, true, false, 2],
        [4.5, false, false, 0], [0, false, true, 0]] as const) {
        const builder = new PlacementBuilder();
        stairs(builder, core, climb, 'floor-slab-stone', roof, lowest);
        const guards = builder.placements.filter(placement => placement.module === 'stair-landing-guard');
        expect(guards).toHaveLength(count);
        if (roof) {
            expect(guards.find(guard => guard.room === 'stair-a')!.position[1]).toBe(climb);
            expect(guards.find(guard => guard.room === 'stair-b')!.position[1]).toBe(0);
        }
    }
});

// Exercise the unchanged consumer: new module bounds must become a real solid, not a
// decorative rail. Standard cores cover opposite entry ends; compact cores run across v.
it.each([[false, 0], [false, 37], [true, 0], [true, 37]] as const)(
    'stops standing/crouched players at the terminal drop and keeps descent clear (compact %s, yaw %s)', async (compact, angle) => {
        const [{ Physics }, { PlayerBody }, { floorBoxes }] = await Promise.all([
            import(new URL('../../engine/src/game/physics/Physics.js', import.meta.url).href),
            import(new URL('../../engine/src/game/physics/PlayerBody.js', import.meta.url).href),
            import(new URL('../../engine/src/game/city/InteriorBoxes.js', import.meta.url).href),
        ]);
        const core = coreFixture(compact, angle);
        const builder = new PlacementBuilder();
        stairs(builder, core, 0, 'floor-slab-stone');
        const catalog = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));
        for (const which of ['a', 'b'] as const) {
            const shaft = which === 'a' ? core.stairA : core.stairB!;
            const low = entryAtLowEnd(core, which), alongU = shaft.lu >= shaft.lv;
            const landing = baseLanding(shaft, low, 0);
            const lane = (Math.min(shaft.lu, shaft.lv) - WALL) / 2;
            const forward = low ? 1 : -1;
            const edge = alongU ? landing.u + (low ? landing.lu : 0) : landing.v + (low ? landing.lv : 0);
            const center = alongU ? landing.v : landing.u;
            const at = (along: number, across: number, y = .025) => {
                const [x, z] = uvToWorld(alongU ? [along, across] : [across, along], core.frame);
                return new Vector3(x, y, z);
            };
            for (const crouched of [false, true]) for (const descendingLane of [false, true]) {
                const physics = await Physics.create();
                try {
                    // The test floor beyond the edge lets us distinguish a blocked passage
                    // from a fall; only the unused half should have a solid in the way.
                    physics.addHalfSpace(0);
                    physics.addBoxes(floorBoxes(builder.placements, 0, (id: string) => catalog.get(id)));
                    const across = center + lane * (descendingLane ? 1.5 : .5);
                    const start = at(edge - forward * STAIR.landing / 2, across);
                    const player = new PlayerBody(physics, start);
                    player.setCrouched(crouched);
                    const direction = at(edge + forward, across).sub(start).setY(0).normalize();
                    for (let frame = 0; frame < 90; frame++) {
                        physics.step(1 / 60);
                        player.move(direction.clone().multiplyScalar(1 / 60), 1 / 60);
                    }
                    const travel = player.feet.clone().sub(start).dot(direction);
                    if (descendingLane) expect(travel).toBeGreaterThan(1.2);
                    else {
                        expect(travel).toBeGreaterThan(.1);
                        expect(travel).toBeLessThan(.4);
                        expect(player.feet.y).toBeLessThan(.1);
                    }
                } finally { physics.world.free(); }
            }
        }
    }, 180_000,
);
