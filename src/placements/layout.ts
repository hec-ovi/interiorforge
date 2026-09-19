import { assertDoorwaysClear, floorDoorways, openFrontClearances } from '../geometry/door-clear.js';
import type { BlueprintFloor, FloorKind, InteriorRequest, RoomKind } from '../core/types.js';
import type { RoofAccessPlan } from '../layout/roof-access.js';
import { baseLanding, entryAtLowEnd } from '../geometry/stairs.js';
import type { BuildingPlan } from '../layout/index.js';
import { roomPolygon } from '../layout/room-shape.js';
import { uvToWorld } from '../layout/uv.js';
import { constructionPlate, shellWallDepth } from '../layout/shell.js';
import { assertInsideShell } from '../geometry/shell-fit.js';
import { stairClearance } from '../geometry/stair-clearance.js';
import { InteriorError } from '../core/errors.js';
import { PlacementBuilder } from './builder.js';
import { familyOf, roomFinish, type RoomFinish } from './finish.js';
import { ceiling, rectangles, slabs, surface } from './surfaces.js';
import { walls } from './walls.js';
import { openings } from './openings.js';
import { stairs } from './stairs.js';
import { props } from './props.js';

export function placeLayout(plan: BuildingPlan, bp: BlueprintFloor, request: InteriorRequest, climb: number, roof?: RoofAccessPlan | null): PlacementBuilder {
    const floor = plan.floors.find(f => f.floor === bp.index)!, uv = plan.uvFloors.get(bp.index)!, core = plan.core;
    const builder = new PlacementBuilder();
    const ceilingY = floor.ceilingElevation - floor.elevation;
    const plate = constructionPlate(bp, core.frame, shellWallDepth(request.blueprint.facade));
    const family = familyOf(request.building.type, request.building.tier);
    const kinds = new Map<string, RoomKind>(floor.rooms.map(room => [room.id, room.kind]));
    const common = floor.rooms.find(room => room.kind === 'corridor' || room.kind === 'elevator_lobby' || room.kind === 'concourse')!;
    const finishOf = (room: string, kind: RoomKind = kinds.get(room) ?? common.kind): RoomFinish => roomFinish(family, kind, floor.kind as FloorKind);
    const tag = `f${bp.index < 0 ? `m${-bp.index}` : bp.index}`;

    for (const room of uv.rooms) {
        const finish = finishOf(room.id, room.kind);
        for (const rect of rectangles(roomPolygon(room, plate), room.holes)) {
            slabs(builder, finish.floor, room.id, rect, 0, core.frame);
            ceiling(builder, finish, room.id, rect, ceilingY, core.frame);
        }
    }
    const plain = finishOf(common.id);
    for (const rect of uv.sealed) {
        surface(builder, plain.floor, 'sealed', rect, 0, core.frame);
        surface(builder, plain.ceiling, 'sealed', rect, ceilingY, core.frame);
    }
    for (const carpet of uv.carpets) surface(builder, 'floor-carpet', carpet.room, carpet.rect, 0, core.frame);

    // Every fixture the floor plan lit stands before the walls add their own lines.
    const planned = floor.lights.filter(light => !light.furniture);
    floor.lights.push(...walls(builder, floor, uv, core, bp, request, finishOf, tag));
    openings(builder, bp, floor, request, 'doors', room => finishOf(room).floor);
    const runs = stairs(builder, core, climb, plain.floor, !!roof);
    if (roof) {
        const landing = baseLanding(core.stairA, entryAtLowEnd(core, 'a'), climb);
        surface(builder, plain.floor, 'stair-a', landing, climb, core.frame);
        const rect = roof.landingUv;
        surface(builder, plain.floor, 'stair-a', { u: rect.x, v: rect.z, lu: rect.w, lv: rect.d }, climb, core.frame);
    }
    for (const elevator of core.elevators) {
        const rect = elevator.rect, [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], core.frame);
        builder.module('lift-car', elevator.id, [x, 0, z], [1, 1, 1], -core.frame.angleDeg * Math.PI / 180);
        const [dx, dz] = uvToWorld([rect.u + rect.lu / 2, core.vFace], core.frame);
        builder.module('lift-doors', elevator.id, [dx, 0, dz], [1, 1, 1], -core.frame.angleDeg * Math.PI / 180);
    }
    props(builder, floor, uv, family);
    for (const light of planned) {
        const finish = finishOf(light.room), position: [number, number, number] = [light.position[0], light.position[1] - floor.elevation, light.position[2]];
        const rotation = -light.angleDeg * Math.PI / 180;
        if (light.kind === 'spot') builder.module(finish.spot, light.room, position, [1, 1, 1], rotation, { id: light.id });
        else builder.module(light.kind === 'cove' ? finish.cove : 'ceiling-led-strip', light.room, position, [Math.max(.5, light.length) / .5, 1, 1], rotation, { id: light.id });
    }
    for (const [id, steps] of runs) {
        const shaft = id === 'stair-a' ? core.stairA : core.stairB!;
        const probe = stairClearance(shaft, core.frame, steps, [builder.mesh]);
        if (probe.clear < 2.1 - 1e-4)
            throw new InteriorError('E_UNREACHABLE_SPACE', `${id} has ${probe.clear.toFixed(3)} m headroom at ${probe.step.y}`, bp.index);
    }
    assertDoorwaysClear(builder.mesh, [...floorDoorways(uv.rooms, core.frame, 0, ceilingY), ...openFrontClearances({ ...bp, elevation: 0 }, shellWallDepth(request.blueprint.facade))], bp.index);
    assertInsideShell(builder.mesh, [{ ...bp, elevation: 0 }], shellWallDepth(request.blueprint.facade));
    const connectorIds = new Set([...floor.core.stairs, ...floor.core.elevators].map(item => item.id));
    for (const placement of builder.placements) {
        if (connectorIds.has(placement.room))
            placement.connector = placement.room;
        if (!kinds.has(placement.room))
            placement.room = common.id;
    }
    return builder;
}
