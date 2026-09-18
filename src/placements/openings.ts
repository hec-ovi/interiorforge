import type { BlueprintFloor, FloorInterior, InteriorRequest } from '../core/types.js';
import { roomFootprintContains } from '../core/room-footprint.js';
import { edgeFrame, edgePoint } from '../geometry/shell-fit.js';
import { SHELL_WALL, shellWallDepth } from '../layout/shell.js';
import type { PlacementBuilder } from './builder.js';
export function openings(builder: PlacementBuilder, bp: BlueprintFloor, floor: FloorInterior, request: InteriorRequest): void {
    const depth = shellWallDepth(request.blueprint.facade);
    for (const opening of bp.openings) {
        const face = edgeFrame(bp.outline, opening.edge), field = opening.kind === 'window' ? opening.glazing ?? opening : opening;
        const p = edgePoint(face, field.offset + field.width / 2, depth + (opening.kind === 'window' ? .001 : .071));
        const owner = floor.rooms.find(r => roomFootprintContains(r, edgePoint(face, field.offset + field.width / 2, depth + .2))) ?? floor.rooms[0]!;
        const rotation = -Math.atan2(face.dir[1], face.dir[0]);
        if (opening.kind === 'window') {
            builder.module('window-return', owner.id, [p[0], field.sill, p[1]], [field.width / .5, field.height / .5, .2], rotation, { opening: opening.id });
        }
        else {
            builder.module('door-frame', owner.id, [p[0], opening.sill, p[1]], [opening.width, opening.height / 2.5, 1], rotation, { id: opening.id, opening: opening.id });
            const thresholdDepth = Math.max(SHELL_WALL.skinClear, opening.door?.recessDepth ?? opening.portal?.recessDepth ?? 0);
            if (opening.sill === 0 && depth > thresholdDepth) {
                const threshold = edgePoint(face, opening.offset + opening.width / 2, (depth + thresholdDepth) / 2);
                const clearWidth = opening.portal?.clearWidth ?? opening.width - 2 * SHELL_WALL.recess;
                builder.module('floor-tile', owner.id, [threshold[0], 0, threshold[1]], [clearWidth / .5, 1, (depth - thresholdDepth) / .5], rotation, { id: `threshold:${opening.id}`, opening: opening.id });
            }
            const connection = floor.rooms.flatMap(r => r.doors).filter(d => d.to === 'outside')
                .sort((a, b) => Math.hypot(a.position[0] - p[0], a.position[1] - p[1]) - Math.hypot(b.position[0] - p[0], b.position[1] - p[1]))[0];
            if (connection)
                connection.id = opening.id;
        }
    }
}
