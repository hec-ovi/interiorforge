import { LIFT_CAR, LIFT_SHAFT_FRONT } from '../geometry/lift-spec.js';
import { elevatorDoorHole } from '../geometry/core-geo.js';
import type { LightFixture } from '../core/types.js';
import type { CorePlan } from '../layout/core-plan.js';
import { uvToWorld } from '../layout/uv.js';
import type { PlacementBuilder } from './builder.js';
import { surface } from './surfaces.js';

/** Fit one shared rideable car pose into each shaft and a landing at every served
 * floor. The engine mounts one lift-car per shaft with its own front (`lift-car-doors`,
 * `lift-car-head`), and slides the car's leaves and each landing's `lift-doors`. A lobby
 * wearing a reference style frames its landings in that style's jamb and header, whose
 * bounds match the plain `lift-landing-jamb` and `lift-landing-header`. */
export function lifts(builder: PlacementBuilder, core: CorePlan, floorModule: string, room: string, minimumStoreyHeight: number, storeyHeight = minimumStoreyHeight, elevation = 0,
    surround: { jamb: string; header: string } = { jamb: 'lift-landing-jamb', header: 'lift-landing-header' }): LightFixture[] {
    const lights: LightFixture[] = [];
    const angle = -core.frame.angleDeg * Math.PI / 180;
    // All landings use the same car height, including taller ground floors.
    const heightScale = Math.min(1, (minimumStoreyHeight - 0.15) / (LIFT_CAR.ceiling + LIFT_CAR.roof));
    for (const [index, elevator] of core.elevators.entries()) {
        const rect = elevator.rect;
        const width = rect.lu - 0.20, depth = rect.lv - 0.20;
        const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], core.frame);
        const car = builder.module('lift-car', elevator.id, [x, 0, z], [width / LIFT_CAR.width, heightScale, depth / LIFT_CAR.depth], angle);
        // The car's leaves, head and sill stand at its front plane, scaled across the car only,
        // so they keep the clearance between the landing leaves and the car in every shaft.
        const carFront = rect.v + (rect.lv - depth) / 2;
        const [fx, fz] = uvToWorld([rect.u + rect.lu / 2, carFront], core.frame);
        const frontScale: [number, number, number] = [width / LIFT_CAR.width,
            Math.min(1, LIFT_CAR.ceiling * heightScale / LIFT_CAR.door.height), 1];
        builder.module('lift-car-doors', elevator.id, [fx, 0, fz], frontScale, angle);
        builder.module('lift-car-head', elevator.id, [fx, 0, fz], frontScale, angle);
        // The source is owned by the actual moving car module's broad ceiling
        // diffuser. A real landing source lights its opaque passenger enclosure;
        // an emissive panel by itself did not illuminate the walls.
        lights.push({ id: car.id, kind: 'strip', room,
            position: [x, elevation + LIFT_CAR.lens.center[1] * heightScale - 0.002, z],
            length: LIFT_CAR.lens.depth * depth / LIFT_CAR.depth, angleDeg: core.frame.angleDeg + 90,
            axis: [-core.frame.sin, 0, core.frame.cos], direction: [0, -1, 0],
            intensity: LIFT_CAR.lens.lumens, colorTemperatureK: 3500, range: 4, beamDeg: 170,
            diffuse: 0.95, facing: 'down' });
        const [dx, dz] = uvToWorld([rect.u + rect.lu / 2, core.vFace], core.frame);
        const passage = elevatorDoorHole(core, index, 0).hole;
        const doorScale: [number, number, number] = [passage.width / LIFT_CAR.doorWidth, 1, 1];
        // The runtime's call plate is on local +Z: face it out into the corridor.
        builder.module('lift-doors', elevator.id, [dx, 0, dz], doorScale, angle + Math.PI);
        for (const side of [-1, 1]) {
            const [jx, jz] = uvToWorld([passage.at + side * (passage.width / 2 + 0.05), core.vFace], core.frame);
            builder.module(surround.jamb, elevator.id, [jx, 0, jz], [1, 1, 1], angle);
        }
        builder.module(surround.header, elevator.id, [dx, 2.20, dz], doorScale, angle);
        const solid = (u: number, v: number, w: number, d: number) => {
            const [sx, sz] = uvToWorld([u, v], core.frame);
            builder.module('elevator-shaft-wall', elevator.id, [sx, 0, sz], [w, storeyHeight, d], angle);
        };
        // The consumer carries the car floor but gives its walls no collision.
        // Solid shaft linings follow 40 mm behind the car's inner skins, keeping
        // the player/camera inside the visible enclosure at every landing.
        const sideLining = 0.10 + LIFT_CAR.wall * width / LIFT_CAR.width - 0.04;
        const rearLining = 0.10 + LIFT_CAR.wall * depth / LIFT_CAR.depth - 0.04;
        for (const u of [rect.u + sideLining / 2, rect.u + rect.lu - sideLining / 2])
            solid(u, rect.v + rect.lv / 2, sideLining, rect.lv);
        solid(rect.u + rect.lu / 2, rect.v + rect.lv - rearLining / 2,
            rect.lu - 2 * sideLining, rearLining);
        // Front cheeks cannot rely on an adjacent room drawing a partition:
        // service-only neighbours and shaft voids also need a solid enclosure. They
        // stand in the wall line, short of the car's leaves.
        const cheek = (rect.lu - passage.width) / 2, front = LIFT_SHAFT_FRONT.depth;
        for (const u of [rect.u + cheek / 2, rect.u + rect.lu - cheek / 2])
            solid(u, rect.v + front / 2, cheek, front);
        const gap = carFront - core.vFace;
        if (gap > 1e-6) {
            // No exposed shaft gap between the corridor slab and the car floor: the
            // landing's threshold runs to the car's own sill.
            const threshold = gap - LIFT_CAR.door.sill;
            if (threshold > 1e-6) surface(builder, floorModule, room,
                { u: passage.at - passage.width / 2, v: core.vFace, lu: passage.width, lv: threshold }, 0, core.frame);
            // The reveal lines the passage up to the car's leaves and stops short of
            // them, so nothing standing at a landing reaches into the car's front as
            // it passes the floor.
            const reveal = Math.max(0.01, gap + LIFT_CAR.door.plane[0] - 0.004);
            for (const side of [-1, 1]) {
                const [jx, jz] = uvToWorld([passage.at + side * (passage.width / 2 + 0.01), core.vFace], core.frame);
                builder.module('lift-reveal-jamb', elevator.id, [jx, 0, jz], [1, 1, reveal], angle);
            }
            builder.module('lift-reveal-header', elevator.id, [dx, 2.20, dz], [doorScale[0], 1, reveal], angle);
        }
    }
    return lights;
}
