import { insetPolygon } from '../core/geom.js';
import { assertDoorwaysClear, floorDoorways, openFrontClearances } from '../geometry/door-clear.js';
import type { BlueprintFloor, InteriorRequest } from '../core/types.js';
import type { RoofAccessPlan } from '../layout/roof-access.js';
import { baseLanding, entryAtLowEnd } from '../geometry/stairs.js';
import type { BuildingPlan } from '../layout/index.js';
import { roomPolygon } from '../layout/room-shape.js';
import { uvToWorld } from '../layout/uv.js';
import { shellWallDepth } from '../layout/shell.js';
import { assertInsideShell } from '../geometry/shell-fit.js';
import { stairClearance } from '../geometry/stair-clearance.js';
import { InteriorError } from '../core/errors.js';
import { PlacementBuilder } from './builder.js';
import { rectangles, surface } from './surfaces.js';
import { walls } from './walls.js';
import { openings } from './openings.js';
import { stairs } from './stairs.js';
import { props } from './props.js';
export function placeLayout(plan: BuildingPlan, bp: BlueprintFloor, request: InteriorRequest, climb: number, roof?: RoofAccessPlan | null): PlacementBuilder {
    const floor = plan.floors.find(f => f.floor === bp.index)!, uv = plan.uvFloors.get(bp.index)!, core = plan.core;
    const builder = new PlacementBuilder();
    const ceiling = floor.ceilingElevation - floor.elevation;
    const plate = insetPolygon(uv.outline, shellWallDepth(request.blueprint.facade));
    for (const room of uv.rooms)
        for (const rect of rectangles(roomPolygon(room, plate), room.holes)) {
            surface(builder, 'floor-tile', room.id, rect, 0, core.frame);
            surface(builder, 'ceiling-tile', room.id, rect, ceiling, core.frame);
        }
    for (const rect of uv.sealed) {
        surface(builder, 'floor-tile', 'sealed', rect, 0, core.frame);
        surface(builder, 'ceiling-tile', 'sealed', rect, ceiling, core.frame);
    }
    walls(builder, floor, uv, core, bp, request);
    openings(builder, bp, floor, request);
    const runs = stairs(builder, core, climb, !!roof);
    if (roof) {
        const landing = baseLanding(core.stairA, entryAtLowEnd(core, 'a'), climb);
        surface(builder, 'floor-tile', 'stair-a', landing, climb, core.frame);
        const rect = roof.landingUv;
        surface(builder, 'floor-tile', 'stair-a', { u: rect.x, v: rect.z, lu: rect.w, lv: rect.d }, climb, core.frame);
    }
    for (const elevator of core.elevators) {
        const rect = elevator.rect, [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], core.frame);
        builder.module('lift-car', elevator.id, [x, 0, z], [1, 1, 1], -core.frame.angleDeg * Math.PI / 180);
        const [dx, dz] = uvToWorld([rect.u + rect.lu / 2, core.vFace], core.frame);
        builder.module('lift-doors', elevator.id, [dx, 0, dz], [1, 1, 1], -core.frame.angleDeg * Math.PI / 180);
    }
    props(builder, floor, uv);
    floor.lights = floor.lights.filter(light => !light.furniture);
    for (const light of floor.lights) {
        builder.module('ceiling-led-strip', light.room, [light.position[0], light.position[1] - floor.elevation, light.position[2]], [Math.max(.5, light.length), 1, 1], -light.angleDeg * Math.PI / 180, { id: light.id });
    }
    for (const [id, steps] of runs) {
        const shaft = id === 'stair-a' ? core.stairA : core.stairB!;
        const probe = stairClearance(shaft, core.frame, steps, [builder.mesh]);
        if (probe.clear < 2.1 - 1e-4)
            throw new InteriorError('E_UNREACHABLE_SPACE', `${id} has ${probe.clear.toFixed(3)} m headroom at ${probe.step.y}`, bp.index);
    }
    assertDoorwaysClear(builder.mesh, [...floorDoorways(uv.rooms, core.frame, 0, ceiling), ...openFrontClearances({ ...bp, elevation: 0 }, shellWallDepth(request.blueprint.facade))], bp.index);
    assertInsideShell(builder.mesh, [{ ...bp, elevation: 0 }], shellWallDepth(request.blueprint.facade));
    const roomIds = new Set(floor.rooms.map(room => room.id));
    const connectorIds = new Set([...floor.core.stairs, ...floor.core.elevators].map(item => item.id));
    const common = floor.rooms.find(room => room.kind === 'corridor' || room.kind === 'elevator_lobby' || room.kind === 'concourse')!;
    for (const placement of builder.placements) {
        if (connectorIds.has(placement.room))
            placement.connector = placement.room;
        if (!roomIds.has(placement.room))
            placement.room = common.id;
    }
    return builder;
}
