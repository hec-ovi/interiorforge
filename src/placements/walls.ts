import { insetPolygon, polygonBounds } from '../core/geom.js';
import type { BlueprintFloor, FloorInterior, InteriorRequest } from '../core/types.js';
import type { CorePlan } from '../layout/core-plan.js';
import type { UvFloorData } from '../layout/plan-floor.js';
import { doorUvPoint } from '../layout/plan-floor.js';
import { Facade } from '../layout/openings.js';
import { facadeDepth } from '../layout/shell.js';
import { uvToWorld } from '../layout/uv.js';
import { canonicalHoles, doorHeadHeight, roomSegments, reserveFacadeEnds, type WallHole } from '../geometry/walls.js';
import { stairEntryHole } from '../geometry/stairs.js';
import { elevatorDoorHole, coreRects } from '../geometry/core-geo.js';
import type { PlacementBuilder } from './builder.js';
export function walls(builder: PlacementBuilder, floor: FloorInterior, uv: UvFloorData, core: CorePlan, bp: BlueprintFloor, request: InteriorRequest): void {
    const frame = core.frame, depth = facadeDepth(request.blueprint.facade), facade = new Facade(bp, request.blueprint.facade);
    type Line = {
        axis: 'H' | 'V';
        c: number;
        runs: {
            a: number;
            b: number;
            room: string;
        }[];
        holes: WallHole[];
    };
    const plate = polygonBounds(insetPolygon(uv.outline, depth));
    const lines = new Map<string, Line>();
    const line = (axis: 'H' | 'V', c: number) => {
        const key = `${axis}:${c.toFixed(6)}`;
        let value = lines.get(key);
        if (!value) {
            value = { axis, c, runs: [], holes: [] };
            lines.set(key, value);
        }
        return value;
    };
    const rooms = [...uv.rooms, ...coreRects(core).map((rect, i) => ({ id: `core:${i}`, kind: 'mechanical_room' as const, rect, doors: [] })),
        ...uv.sealed.map((rect, i) => ({ id: `sealed:${i}`, kind: 'mechanical_room' as const, rect, doors: [] }))];
    for (const room of rooms) {
        for (const raw of roomSegments(room, uv.outline, depth)) {
            const segment = reserveFacadeEnds(raw, facade, bp, frame, depth);
            if (segment) {
                const a = Math.max(segment.a, segment.axis === 'H' ? plate.x : plate.z), b = Math.min(segment.b, segment.axis === 'H' ? plate.x + plate.w : plate.z + plate.d);
                if (b > a + 1e-6)
                    line(segment.axis, segment.c).runs.push({ ...segment, a, b, room: room.id });
            }
        }
        for (const door of room.doors) {
            if (door.to === 'outside' || door.openFront)
                continue;
            const [u, v] = doorUvPoint(door, room), head = doorHeadHeight(door.leaves, floor.ceilingElevation - floor.elevation);
            line(door.edge.startsWith('v') ? 'H' : 'V', door.edge.startsWith('v') ? v : u).holes.push({ at: door.edge.startsWith('v') ? u : v, width: door.width, y0: 0, y1: head });
        }
    }
    const extra = [stairEntryHole(core, 'a', 0), ...(core.stairB ? [stairEntryHole(core, 'b', 0)] : []), ...core.elevators.map((_, i) => elevatorDoorHole(core, i, 0))];
    for (const h of extra)
        line(h.axis, h.c).holes.push(h.hole);
    for (const l of lines.values()) {
        const cuts = [...new Set(l.runs.flatMap(r => [r.a, r.b]).concat(l.holes.flatMap(h => [h.at - h.width / 2, h.at + h.width / 2])))].sort((a, b) => a - b);
        const top = floor.height - .15, rotation = -frame.angleDeg * Math.PI / 180 + (l.axis === 'V' ? -Math.PI / 2 : 0);
        const at = (t: number, y: number): [
            number,
            number,
            number
        ] => { const [x, z] = uvToWorld(l.axis === 'H' ? [t, l.c] : [l.c, t], frame); return [x, y, z]; };
        for (let i = 0; i < cuts.length - 1; i++) {
            const a = cuts[i]!, b = cuts[i + 1]!, mid = (a + b) / 2, owner = l.runs.find(r => mid > r.a - 1e-6 && mid < r.b + 1e-6);
            if (!owner || b - a < 1e-6)
                continue;
            const holes = l.holes.filter(h => mid > h.at - h.width / 2 + 1e-6 && mid < h.at + h.width / 2 - 1e-6).sort((a, b) => a.y0 - b.y0);
            let bottom = 0;
            for (const h of [...holes, { y0: top, y1: top }]) {
                if (h.y0 > bottom + 1e-6)
                    builder.module('wall-segment', owner.room, at(mid, bottom), [(b - a) / .5, (h.y0 - bottom) / .5, 1], rotation);
                bottom = Math.max(bottom, h.y1);
            }
        }
        for (const h of canonicalHoles(l.holes)) {
            const owner = l.runs.find(r => h.at - h.width / 2 >= r.a - .01 && h.at + h.width / 2 <= r.b + .01);
            if (owner)
                builder.module('door-frame', owner.room, at(h.at, 0), [h.width, h.y1 / 2.5, 1], rotation);
        }
    }
}
