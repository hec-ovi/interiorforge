import type { BlueprintFloor, InteriorRequest } from '../core/types.js';
import { assertInsideShell } from '../geometry/shell-fit.js';
import { shellWallDepth } from '../layout/shell.js';
import { PlacementBuilder } from './builder.js';
import { openings } from './openings.js';
import type { FloorPlacement, Placement } from './types.js';
/** Window returns of one floor, from its own openings. Windows vary per floor, so they stay
 *  out of the reusable layout and ride with the floor that owns them. */
export function windowTreatments(bp: BlueprintFloor, layout: FloorPlacement, request: InteriorRequest): Placement[] {
    const builder = new PlacementBuilder();
    openings(builder, { ...bp, elevation: 0 }, layout.floor, request, 'windows');
    assertInsideShell(builder.mesh, [{ ...bp, elevation: 0 }], shellWallDepth(request.blueprint.facade));
    const rooms = new Set(layout.floor.rooms.map(room => room.id));
    const common = layout.floor.rooms.find(room => room.kind === 'corridor' || room.kind === 'elevator_lobby' || room.kind === 'concourse')
        ?? layout.floor.rooms[0];
    for (const placement of builder.placements)
        if (!rooms.has(placement.room) && common)
            placement.room = common.id;
    return builder.placements;
}
