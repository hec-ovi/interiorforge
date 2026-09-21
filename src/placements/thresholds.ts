import type { Frame, UvRect } from '../layout/uv.js';
import { worldToUv } from '../layout/uv.js';
import type { PlacementBuilder } from './builder.js';
import type { Placement } from './types.js';
import { surface } from './surfaces.js';

/** Fill only uncovered doorway floor strips; existing room floors keep their own surfaces. */
export function thresholds(builder: PlacementBuilder, frame: Frame, floorOf: (room: string) => string): void {
    const support = builder.placements.filter(p => p.module?.startsWith('floor-slab-') && Math.abs(p.position[1]) < 1e-6)
        .map(p => footprint(p, p.scale[0] * .5, p.scale[2] * .5, frame));
    for (const door of builder.placements.filter(p => p.module === 'door-header')) {
        let gaps = [footprint(door, door.scale[0] * .5 - .16, .2, frame)];
        for (const floor of support) gaps = gaps.flatMap(gap => subtractRect(gap, floor));
        for (const gap of gaps) {
            surface(builder, floorOf(door.room), door.room, gap, 0, frame);
            support.push(gap);
        }
    }
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
