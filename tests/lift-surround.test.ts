import { expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { generate, type InteriorRequest } from '../src/index.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import type { Placement } from '../src/placements/types.js';
import type { Room } from '../src/core/types.js';
import type { CorePlan } from '../src/layout/core-plan.js';
import type { DressContext } from '../src/styles/systems/types.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import { dressPublic } from '../src/styles/ref-c/dress.js';
import { elevatorDoorHole } from '../src/geometry/core-geo.js';
import { makeFrame } from '../src/layout/uv.js';

const recipes = new Map(moduleRecipes().map(recipe => [recipe.id, recipe]));

/** The world box a placed module fills. */
function boxOf(placement: Placement): THREE.Box3 | null {
    const recipe = recipes.get(placement.module!);
    if (!recipe) return null;
    const min = new THREE.Vector3(...recipe.origin).negate();
    const box = new THREE.Box3(min, min.clone().add(new THREE.Vector3(...recipe.size)));
    return box.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...placement.position),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), placement.rotationY), new THREE.Vector3(...placement.scale)));
}

// A landing stands in its room's own lining: the lift's jambs and head assume a finished wall
// around them, and a lobby whose lining was taken for a neighbour's glass showed the bare
// shaft walls beside its lift doors.
it.each([['balcony-grid', 'high_rich'], ['mirror-frame', 'high_rich']] as const)(
    'flanks every %s landing with its room\'s own lining beside both jambs, from the floor to the head', async (architecture, tier) => {
    const { generate: exterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
    const { blueprint } = await exterior({ seed: 'lift-surround', buildingId: 'lift-surround', theme: 'cyberpunk',
        parcel: { footprint: [[0, 0], [40, 0], [40, 40], [0, 40]], accessPoint: [20, 0], maxHeight: 29 },
        building: { type: 'residential', tier, floors: 3 }, options: { architecture } }, { textures: { mode: 'keys' } });
    const request: InteriorRequest = { seed: blueprint.seed, building: { id: blueprint.buildingId, type: 'residential', tier }, blueprint, materialTheme: 'cyberpunk' };
    const result = await generate(request, { models: new Set() });
    let landings = 0;
    for (const layout of Object.values(result.layouts)) {
        for (const lift of layout.floor.core?.elevators ?? []) {
            const entry = layout.floor.rooms.flatMap(room => room.doors.map(door => ({ room, door })))
                .find(({ door }) => door.id === `${lift.id}:portal` && door.to === lift.id);
            if (!entry) continue;
            landings++;
            const { room, door } = entry;
            const along = Math.abs(Math.cos(door.angleDeg * Math.PI / 180)) > .5 ? 'x' : 'z', across = along === 'x' ? 'z' : 'x';
            const at = { x: door.position[0], z: door.position[1] };
            const lining = layout.placements.filter(p => p.room === room.id && /^wall-/.test(p.module ?? '')).map(boxOf).filter(Boolean) as THREE.Box3[];
            for (const side of [-1, 1]) for (const offset of [.12, .25, .4]) for (const y of [.3, 1.2, 2]) {
                const u = at[along] + side * (door.width / 2 + offset);
                const covered = lining.some(box => box.min[along] <= u && box.max[along] >= u && box.min.y <= y && box.max.y >= y
                    && box.min[across] <= at[across] + .15 && box.max[across] >= at[across] - .15);
                expect(covered, `${layout.id} ${lift.id}: no ${room.id} lining ${offset} m ${side < 0 ? 'left' : 'right'} of the doors at ${y} m`).toBe(true);
            }
        }
    }
    expect(landings).toBeGreaterThan(0);
}, 180000);

// Nothing a style dresses a room with stands in the way out of a lift: the landings are
// doorways the corridor's own doors do not list while the floor is dressed.
it('keeps the poor corridors\' debris off the floor in front of every lift landing', () => {
    const hall = { id: 'hall', kind: 'corridor', polygon: [[0, 0], [14, 0], [14, 6], [0, 6]], doors: [] } as unknown as Room;
    const core = { frame: makeFrame(0), vFace: 6, elevators: [
        { id: 'elev-0', rect: { u: 2.65, v: 6, lu: 3.5, lv: 3.5 } }, { id: 'elev-1', rect: { u: 7.85, v: 6, lu: 3.5, lv: 3.5 } }] } as CorePlan;
    const builder = new PlacementBuilder();
    const ctx = { builder, core, floor: { rooms: [hall], lights: [] }, rooms: [hall], ceilingY: 2.5, frame: core.frame,
        bp: { outline: [[-20, -20], [40, -20], [40, 30], [-20, 30]] } } as unknown as DressContext;
    dressPublic(ctx, 'c2');
    const debris = builder.placements.filter(p => p.module === 'trim-c2-debris');
    // The wall across from the lifts is dressed, so the rule has something to keep clear.
    expect(debris.some(p => p.position[2] < 1.5)).toBe(true);
    for (const [index] of core.elevators.entries()) {
        const { c, hole } = elevatorDoorHole(core, index, 0);
        for (const p of debris) expect(Math.hypot(p.position[0] - hole.at, p.position[2] - c)).toBeGreaterThan(hole.width / 2 + 1.5);
    }
});
