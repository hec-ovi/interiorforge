import type { BlueprintFloor, FloorInterior, InteriorRequest } from '../core/types.js';
import { roomFootprintContains } from '../core/room-footprint.js';
import { edgeFrame, edgePoint, openingReturnDepth } from '../geometry/shell-fit.js';
import { SHELL_WALL, shellWallDepth } from '../layout/shell.js';
import type { PlacementBuilder } from './builder.js';
/** Doors belong to the reusable layout: the middle-layout signature holds them identical.
 *  Windows vary per floor, so their returns are published as that floor's own treatments. */
export function openings(builder: PlacementBuilder, bp: BlueprintFloor, floor: FloorInterior, request: InteriorRequest, want: 'doors' | 'windows', slabOf: (room: string) => string = () => 'floor-slab-stone'): void {
    const depth = shellWallDepth(request.blueprint.facade);
    for (const opening of bp.openings) {
        if ((opening.kind === 'window') !== (want === 'windows'))
            continue;
        // A window's field is its glazing; a door's passage is its clearance, which a pocket door
        // publishes beside the cassette its leaves retract into.
        const face = edgeFrame(bp.outline, opening.edge), field = opening.kind === 'window' ? opening.glazing ?? opening : opening.door?.clearance ?? opening;
        // The return's outer jambs also stay behind the two adjacent backing planes.
        const margin = field.width * .02 / .5;
        const low = Math.max(depth, field.offset - margin), high = Math.min(face.len - depth, field.offset + field.width + margin);
        if (opening.kind === 'window' && high <= low) continue;
        const p = edgePoint(face, opening.kind === 'window' ? (low + high) / 2 : field.offset + field.width / 2,
            depth + (opening.kind === 'window' ? .001 : .071));
        const owner = floor.rooms.find(r => roomFootprintContains(r, edgePoint(face, field.offset + field.width / 2, depth + .2))) ?? floor.rooms[0]!;
        const rotation = -Math.atan2(face.dir[1], face.dir[0]);
        if (opening.kind === 'window') {
            builder.module('window-return', owner.id, [p[0], field.sill, p[1]], [(high - low) / .54, field.height / .5, .2], rotation, { opening: opening.id });
        }
        else {
            builder.module('door-frame', owner.id, [p[0], field.sill, p[1]], [field.width, field.height / 2.5, 1], rotation, { id: opening.id, opening: opening.id });
            // The threshold joins the plate to the passage: behind the recess of a swing door, behind
            // the back attachment plane of a pocket cassette.
            const thresholdDepth = Math.max(openingReturnDepth(opening), opening.door?.recessDepth ?? opening.portal?.recessDepth ?? 0);
            if (field.sill === 0 && depth > thresholdDepth) {
                const threshold = edgePoint(face, field.offset + field.width / 2, (depth + thresholdDepth) / 2);
                const clearWidth = opening.portal?.clearWidth ?? field.width - 2 * SHELL_WALL.recess;
                builder.module(slabOf(owner.id), owner.id, [threshold[0], 0, threshold[1]], [clearWidth / .5, 1, (depth - thresholdDepth) / .5], rotation, { id: `threshold:${opening.id}`, opening: opening.id });
            }
            const connection = floor.rooms.flatMap(r => r.doors).filter(d => d.to === 'outside')
                .sort((a, b) => Math.hypot(a.position[0] - p[0], a.position[1] - p[1]) - Math.hypot(b.position[0] - p[0], b.position[1] - p[1]))[0];
            if (connection)
                connection.id = opening.id;
        }
    }
}
