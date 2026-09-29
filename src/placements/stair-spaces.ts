import type { InteriorRequest, Room } from '../core/types.js';
import type { Point } from '../core/geom.js';
import { roomFootprintContains } from '../core/room-footprint.js';
import { elevatorDoorHole } from '../geometry/core-geo.js';
import { balanceIllumination } from '../layout/lighting.js';
import { WALL } from '../layout/constants.js';
import { stairAccess, type CorePlan } from '../layout/core-plan.js';
import { uvRectCorners, uvToWorld } from '../layout/uv.js';
import type { GeneratedInterior } from './types.js';

/** The enclosed air of the already-built stairs and lift shafts, published after room surfaces,
 * furniture and navigation. Its floor is the real flight/landing geometry, never
 * a new flat room slab. This makes the shaft's existing fixtures and surfaces belong
 * to the space they actually light, and lets consumers classify its occupied volume. */
export function publishStairSpaces(result: GeneratedInterior, request: InteriorRequest, core: CorePlan): void {
    for (const layout of Object.values(result.layouts)) {
        if (layout.floor.kind === 'roof') {
            const housing = request.blueprint.roof?.bulkhead;
            if (!housing || !layout.floor.core.stairs.length) continue;
            const [ux, uz] = housing.axis, halfU = housing.width / 2 - .2, halfV = housing.depth / 2 - .2;
            const polygon = ([[-halfU, -halfV], [halfU, -halfV], [halfU, halfV], [-halfU, halfV]] as Point[])
                .map(([u, v]): Point => [housing.center[0] + ux * u - uz * v, housing.center[1] + uz * u + ux * v]);
            // Only the enclosure is indoors. The rest of the roof retains no room.
            layout.floor.rooms.push({ id: 'stair-a', kind: 'corridor', polygon, doors: [] });
            continue;
        }
        for (const which of (core.stairB ? ['a', 'b'] : ['a']) as ('a' | 'b')[]) {
            const id = `stair-${which}`, shaft = which === 'a' ? core.stairA : core.stairB!;
            if (!layout.floor.core.stairs.some(stair => stair.id === id)) continue;
            const access = stairAccess(core, which), entry = uvToWorld(access.entry, core.frame);
            const owner = layout.floor.rooms.find(room => roomFootprintContains(room, entry));
            const position = uvToWorld(access.axis === 'H' ? [access.at, access.c] : [access.c, access.at], core.frame);
            const room: Room = { id, kind: 'corridor', polygon: uvRectCorners(shaft).map(point => uvToWorld(point, core.frame)), doors: [] };
            if (owner) {
                const portal = { id: `${id}:portal`, kind: 'openFront' as const, position,
                    width: access.width, angleDeg: core.frame.angleDeg + (access.axis === 'H' ? 0 : 90),
                    clearHeight: Math.min(layout.floor.height - .15, access.width > 3 ? 2.8 : 2.1), clearDepth: WALL };
                room.doors.push({ ...portal, to: owner.id });
                owner.doors.push({ ...portal, to: id });
            }
            layout.floor.rooms.push(room);
            balanceIllumination([{ id, kind: 'corridor', area: shaft.lu * shaft.lv }], layout.floor.lights, request.building.tier);
            for (const placement of layout.placements) {
                if (placement.connector === id) placement.room = id;
            }
        }
        for (const [index, elevator] of core.elevators.entries()) {
            if (!layout.floor.core.elevators.some(shaft => shaft.id === elevator.id)) continue;
            const { id, rect } = elevator;
            const entry = uvToWorld([rect.u + rect.lu / 2, core.vFace - .6], core.frame);
            const owner = layout.floor.rooms.find(room => roomFootprintContains(room, entry));
            const passage = elevatorDoorHole(core, index, 0);
            const room: Room = { id, kind: 'corridor', polygon: uvRectCorners(rect).map(point => uvToWorld(point, core.frame)), doors: [] };
            if (owner) {
                const portal = { id: `${id}:portal`, position: uvToWorld([passage.hole.at, passage.c], core.frame),
                    width: passage.hole.width, angleDeg: core.frame.angleDeg, leaves: 2 as const, clearDepth: 0 };
                room.doors.push({ ...portal, to: owner.id });
                owner.doors.push({ ...portal, to: id });
            }
            layout.floor.rooms.push(room);
            // The car already owns one authored diffuser record. Move that record's
            // room association, preserving its flux and identity. The interactive
            // consumer owns moving cab lights; publication creates no light here.
            const cars = new Set(layout.placements.filter(placement => placement.connector === id
                && placement.module === 'lift-car').map(placement => placement.id));
            for (const light of layout.floor.lights) if (cars.has(light.id)) light.room = id;
            for (const placement of layout.placements) if (placement.connector === id) placement.room = id;
        }
    }
}
