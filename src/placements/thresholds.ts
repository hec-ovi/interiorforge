import type { Frame, UvRect } from '../layout/uv.js';
import { makeFrame, uvToWorld, worldToUv } from '../layout/uv.js';
import type { EdgeFrame } from '../geometry/shell-fit.js';
import type { PlacementBuilder } from './builder.js';
import type { Placement } from './types.js';
import { surface } from './surfaces.js';
import { PUBLIC_PORTAL } from '../styles/luxury/portals.js';

/** Join an exterior passage to the floor that was actually placed behind it. Facade
 * backing depth and the room envelope are independent: a recessed facade may leave
 * another broad strip before the room starts. Work in the opening's own axes so the
 * joint stays exact on rotated parcels and across stepped floor boundaries. */
export function exteriorThreshold(builder: PlacementBuilder, face: EdgeFrame, opening: string,
    offset: number, width: number, startDepth: number, module: string, room: string): void {
    const frame = makeFrame(Math.atan2(face.dir[1], face.dir[0]) * 180 / Math.PI);
    const [originU, originV] = worldToUv(face.a, frame);
    const from = originU + offset, to = from + width, front = originV + startDepth;
    const support = walkingSlabs(builder, frame).filter(rect => rect.u < to - 1e-6 && rect.u + rect.lu > from + 1e-6
        && rect.v + rect.lv > front + 1e-6);
    const cuts = [...new Set([from, to, ...support.flatMap(rect => [rect.u, rect.u + rect.lu])
        .filter(u => u > from + 1e-6 && u < to - 1e-6)])].sort((a, b) => a - b);
    const pieces: UvRect[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
        const u = cuts[i]!, end = cuts[i + 1]!, center = (u + end) / 2;
        const nearest = support.filter(rect => center >= rect.u - 1e-6 && center <= rect.u + rect.lu + 1e-6)
            .sort((a, b) => a.v - b.v)[0];
        if (!nearest || nearest.v <= front + 1e-6) continue;
        const previous = pieces.at(-1);
        if (previous && Math.abs(previous.u + previous.lu - u) < 1e-6 && Math.abs(previous.v + previous.lv - nearest.v) < 1e-6)
            previous.lu = end - previous.u;
        else pieces.push({ u, v: front, lu: end - u, lv: nearest.v - front });
    }
    pieces.forEach((rect, i) => {
        const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
        builder.module(module, room, [x, 0, z], [rect.lu / .5, 1, rect.lv / .5], -frame.angleDeg * Math.PI / 180,
            { id: `threshold:${opening}${i ? `:${i}` : ''}`, opening });
    });
}

/** Fill only uncovered doorway floor strips; existing room floors keep their own surfaces. */
export function thresholds(builder: PlacementBuilder, frame: Frame, floorOf: (room: string) => string, linkedSupport: readonly UvRect[] = []): void {
    const support = [...walkingSlabs(builder, frame), ...linkedSupport];
    for (const door of builder.placements.filter(p => p.module && /^door-header(?:-|$)/.test(p.module))) {
        const width = door.module === 'door-header-luxury-public' ? door.scale[0] * .5 + 2 * PUBLIC_PORTAL.radius : door.scale[0] * .5 - .16;
        let gaps = [footprint(door, width, .2, frame)];
        for (const floor of support) gaps = gaps.flatMap(gap => subtractRect(gap, floor));
        for (const gap of gaps) {
            surface(builder, floorOf(door.room), door.room, gap, 0, frame);
            support.push(gap);
        }
    }
}

/** The frame rectangles the floor's walking-level slabs cover. */
export function walkingSlabs(builder: PlacementBuilder, frame: Frame): UvRect[] {
    return builder.placements.filter(p => p.module?.startsWith('floor-slab-') && Math.abs(p.position[1]) < 1e-6)
        .map(p => footprint(p, p.scale[0] * .5, p.scale[2] * .5, frame));
}

function footprint(p: Placement, width: number, depth: number, frame: Frame): UvRect {
    const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY);
    const points = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
        const x = a! * width / 2, z = b! * depth / 2;
        return worldToUv([p.position[0] + x * c + z * s, p.position[2] - x * s + z * c], frame);
    });
    const u = Math.min(...points.map(p => p[0])), v = Math.min(...points.map(p => p[1]));
    return { u, v, lu: Math.max(...points.map(p => p[0])) - u, lv: Math.max(...points.map(p => p[1])) - v };
}

/** Exact uncovered rectangles, used wherever adjacent finished slabs meet. */
export function subtractRect(a: UvRect, b: UvRect): UvRect[] {
    const u0 = Math.max(a.u, b.u), u1 = Math.min(a.u + a.lu, b.u + b.lu);
    const v0 = Math.max(a.v, b.v), v1 = Math.min(a.v + a.lv, b.v + b.lv);
    if (u1 <= u0 + 1e-7 || v1 <= v0 + 1e-7) return [a];
    return [
        { u: a.u, v: a.v, lu: u0 - a.u, lv: a.lv },
        { u: u1, v: a.v, lu: a.u + a.lu - u1, lv: a.lv },
        { u: u0, v: a.v, lu: u1 - u0, lv: v0 - a.v },
        { u: u0, v: v1, lu: u1 - u0, lv: a.v + a.lv - v1 },
    ].filter(r => r.lu > 1e-6 && r.lv > 1e-6);
}
