import { InteriorError } from '../core/errors.js';
import { roomFootprintContains } from '../core/room-footprint.js';
import type { Point } from '../core/geom.js';
import type { Frame, UvRect } from '../layout/uv.js';
import { uvToWorld } from '../layout/uv.js';
import type { PlacementBuilder } from './builder.js';
/** Exact rectangular strips, including room holes. Boundaries preserve source coordinates. */
export function rectangles(polygon: Point[], holes: Point[][] = []): UvRect[] {
    const rings = [polygon, ...holes], xs = new Set<number>(), zs = new Set<number>();
    for (const ring of rings)
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            if (Math.abs(a[0] - b[0]) > 1e-6 && Math.abs(a[1] - b[1]) > 1e-6)
                throw new InteriorError('E_BLUEPRINT_INVALID', 'module layouts require rectangular construction axes');
            xs.add(a[0]);
            zs.add(a[1]);
        }
    const x = [...xs].sort((a, b) => a - b), z = [...zs].sort((a, b) => a - b), result: UvRect[] = [];
    for (let j = 0; j < z.length - 1; j++) {
        let start: number | undefined;
        for (let i = 0; i < x.length; i++) {
            const inside = i < x.length - 1 && roomFootprintContains({ polygon, holes }, [(x[i]! + x[i + 1]!) / 2, (z[j]! + z[j + 1]!) / 2]);
            if (inside && start === undefined)
                start = x[i]!;
            if (!inside && start !== undefined) {
                const previous = result.find(r => Math.abs(r.u - start!) < 1e-7 && Math.abs(r.lu - (x[i]! - start!)) < 1e-7 && Math.abs(r.v + r.lv - z[j]!) < 1e-7);
                if (previous)
                    previous.lv += z[j + 1]! - z[j]!;
                else
                    result.push({ u: start, v: z[j]!, lu: x[i]! - start, lv: z[j + 1]! - z[j]! });
                start = undefined;
            }
        }
    }
    return result;
}
/** Plain tile fields share one mesh; scale fits each complete rectangular run. */
export function surface(builder: PlacementBuilder, module: string, room: string, rect: UvRect, y: number, frame: Frame): void {
    const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
    builder.module(module, room, [x, y, z], [rect.lu / .5, 1, rect.lv / .5], -frame.angleDeg * Math.PI / 180);
}
