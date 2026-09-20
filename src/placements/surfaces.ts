import { InteriorError } from '../core/errors.js';
import { roomFootprintContains } from '../core/room-footprint.js';
import type { Point } from '../core/geom.js';
import type { Frame, UvRect } from '../layout/uv.js';
import { uvToWorld } from '../layout/uv.js';
import type { PlacementBuilder } from './builder.js';
import type { RoomFinish } from './finish.js';

/** Fitted ceiling band width, one construction cell. */
const BAND = 0.5;

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

/** One fitted module over a complete rectangular run: the placement's stretch publishes the
 *  repeat, so the map keeps its own metre size however wide the run is. */
export function surface(builder: PlacementBuilder, module: string, room: string, rect: UvRect, y: number, frame: Frame): void {
    const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
    builder.module(module, room, [x, y, z], [rect.lu / .5, 1, rect.lv / .5], -frame.angleDeg * Math.PI / 180);
}

/** The floor of a room rectangle: one fitted slab, tiled by its own map. */
export function slabs(builder: PlacementBuilder, module: string, room: string, rect: UvRect, y: number, frame: Frame): void {
    surface(builder, module, room, rect, y, frame);
}

/** A ceiling over a room rectangle: the fitted outer band where the rectangle can hold one,
 *  inset fields inside it, and the family's exposed services along the run. */
export function ceiling(builder: PlacementBuilder, finish: RoomFinish, room: string, rect: UvRect, y: number, frame: Frame): void {
    const banded = finish.band && rect.lu >= 2 * BAND + 1 && rect.lv >= 2 * BAND + 1;
    if (banded) {
        surface(builder, finish.band!, room, { u: rect.u, v: rect.v, lu: rect.lu, lv: BAND }, y, frame);
        surface(builder, finish.band!, room, { u: rect.u, v: rect.v + rect.lv - BAND, lu: rect.lu, lv: BAND }, y, frame);
        surface(builder, finish.band!, room, { u: rect.u, v: rect.v + BAND, lu: BAND, lv: rect.lv - 2 * BAND }, y, frame);
        surface(builder, finish.band!, room, { u: rect.u + rect.lu - BAND, v: rect.v + BAND, lu: BAND, lv: rect.lv - 2 * BAND }, y, frame);
    }
    const field = banded ? { u: rect.u + BAND, v: rect.v + BAND, lu: rect.lu - 2 * BAND, lv: rect.lv - 2 * BAND } : rect;
    surface(builder, finish.ceiling, room, field, y, frame);
    if (finish.services && Math.max(rect.lu, rect.lv) >= 2) {
        const alongU = rect.lu >= rect.lv;
        const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
        builder.module(finish.services, room, [x, y, z], [(alongU ? rect.lu : rect.lv) / .5, 1, 1],
            -frame.angleDeg * Math.PI / 180 + (alongU ? 0 : -Math.PI / 2));
    }
}
