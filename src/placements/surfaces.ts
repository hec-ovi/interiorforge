import { InteriorError } from '../core/errors.js';
import { roomFootprintContains } from '../core/room-footprint.js';
import { boundaryDistance, type Point } from '../core/geom.js';
import type { Frame, UvRect } from '../layout/uv.js';
import { uvToWorld } from '../layout/uv.js';
import type { PlacementBuilder } from './builder.js';
import type { RoomFinish } from './finish.js';
import { placeCorporateCeiling } from '../styles/corporate/ceiling.js';
import { placeIndustrialServices } from '../styles/industrial/services.js';
import { placeLuxuryCeiling } from '../styles/luxury/ceiling.js';
import { placeLuxuryStoneFloor } from '../styles/luxury/surfaces.js';
import { isLoft1702Ceiling, LOFT1702_FINISH, placeLoft1702Ceiling } from '../styles/luxury/loft-finish.js';
import type { LightFixture } from '../core/types.js';
import { CEILINGS, FLOORS } from '../styles/reference/registry.js';
import { placeCeilingSystem } from '../styles/systems/ceiling.js';
import { placeFloorSupport, placeFloorSystem } from '../styles/systems/floor.js';
import { levelFloorRects, placeLevels, raisedFloorRects } from '../styles/systems/levels.js';
import type { SurfaceRoom } from '../styles/systems/types.js';

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

/** Exact rectangles of an axis-aligned footprint, largest first: each is the biggest the part
 *  still uncovered holds. A room stepped out to a curved facade keeps its body in a few large
 *  rectangles this way, and only the steps along the curve come out as small ones. */
export function coverRectangles(polygon: Point[], holes: Point[][] = []): UvRect[] {
    const rings = [polygon, ...holes];
    const xs = [...new Set(rings.flat().map(p => p[0]))].sort((a, b) => a - b);
    const zs = [...new Set(rings.flat().map(p => p[1]))].sort((a, b) => a - b);
    const nx = xs.length - 1, nz = zs.length - 1;
    const free: boolean[][] = [];
    for (let j = 0; j < nz; j++) {
        free.push([]);
        for (let i = 0; i < nx; i++)
            free[j]!.push(roomFootprintContains({ polygon, holes }, [(xs[i]! + xs[i + 1]!) / 2, (zs[j]! + zs[j + 1]!) / 2]));
    }
    const result: UvRect[] = [];
    for (;;) {
        let best: { i0: number; i1: number; j0: number; j1: number; area: number } | undefined;
        const top = new Array<number>(nx).fill(-1);
        for (let j = 0; j < nz; j++) {
            for (let i = 0; i < nx; i++) top[i] = free[j]![i] ? (top[i]! < 0 ? j : top[i]!) : -1;
            for (let i0 = 0; i0 < nx; i0++) {
                let high = -1;
                for (let i1 = i0; i1 < nx && top[i1]! >= 0; i1++) {
                    high = Math.max(high, top[i1]!);
                    const area = (xs[i1 + 1]! - xs[i0]!) * (zs[j + 1]! - zs[high]!);
                    if (!best || area > best.area + 1e-9) best = { i0, i1, j0: high, j1: j, area };
                }
            }
        }
        if (!best) return result;
        for (let j = best.j0; j <= best.j1; j++) for (let i = best.i0; i <= best.i1; i++) free[j]![i] = false;
        result.push({ u: xs[best.i0]!, v: zs[best.j0]!, lu: xs[best.i1 + 1]! - xs[best.i0]!, lv: zs[best.j1 + 1]! - zs[best.j0]! });
    }
}

/** The parts of `bounds` inside `plate` that no rectangle of `covered` reaches, merged into
 *  the fewest row-wise rectangles. Slivers below a millimetre are rounding, not floor. */
export function uncoveredRects(bounds: UvRect, covered: readonly UvRect[], plate: readonly Point[]): UvRect[] {
    const inBounds = (value: number, lo: number, hi: number) => value > lo + 1e-7 && value < hi - 1e-7;
    const us = [...new Set([bounds.u, bounds.u + bounds.lu, ...covered.flatMap(r => [r.u, r.u + r.lu]).filter(u => inBounds(u, bounds.u, bounds.u + bounds.lu))])].sort((a, b) => a - b);
    const vs = [...new Set([bounds.v, bounds.v + bounds.lv, ...covered.flatMap(r => [r.v, r.v + r.lv]).filter(v => inBounds(v, bounds.v, bounds.v + bounds.lv))])].sort((a, b) => a - b);
    const inside = (p: Point) => boundaryDistance(p, plate) >= -1e-6;
    const result: UvRect[] = [];
    for (let j = 0; j + 1 < vs.length; j++) {
        const v0 = vs[j]!, v1 = vs[j + 1]!;
        if (v1 - v0 < 1e-3) continue;
        let start: number | undefined;
        for (let i = 0; i < us.length; i++) {
            const u0 = us[i]!, u1 = us[i + 1];
            const open = u1 !== undefined && u1 - u0 >= 1e-3
                && !covered.some(r => (u0 + u1) / 2 > r.u - 1e-6 && (u0 + u1) / 2 < r.u + r.lu + 1e-6 && (v0 + v1) / 2 > r.v - 1e-6 && (v0 + v1) / 2 < r.v + r.lv + 1e-6)
                && ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as Point[]).every(inside);
            if (open && start === undefined) start = u0;
            if (!open && start !== undefined) {
                const from = start;
                const above = result.find(r => Math.abs(r.u - from) < 1e-7 && Math.abs(r.lu - (u0 - from)) < 1e-7 && Math.abs(r.v + r.lv - v0) < 1e-7);
                if (above) above.lv += v1 - v0;
                else result.push({ u: from, v: v0, lu: u0 - from, lv: v1 - v0 });
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

/** The floor of a room rectangle: one fitted slab, tiled by its own map. Given the whole
 *  room, a registered floor system lays it (phased to the room or the grid), and the room's
 *  level zones take their part of the rectangle as platforms. Returns lens records. */
export function slabs(builder: PlacementBuilder, module: string, room: string, rect: UvRect, y: number, frame: Frame, whole?: SurfaceRoom): LightFixture[] {
    const lights: LightFixture[] = [];
    const zones = whole?.levels?.length ? whole.levels : undefined;
    const system = whole ? FLOORS.get(module) : undefined;
    for (const part of zones ? levelFloorRects(rect, zones) : [rect]) {
        if (system) lights.push(...placeFloorSystem(builder, system, whole!, part, y, frame));
        else if (module === 'floor-slab-meridian-stone' || module === 'floor-slab-luxury-polished')
            placeLuxuryStoneFloor(builder, room, part, y, frame, module === 'floor-slab-luxury-polished' ? 'floor-finish-luxury-polished' : undefined);
        else surface(builder, module, room, part, y, frame);
    }
    if (zones && whole) {
        // A raised zone stands on the storey's structural slab, which stays whole under it.
        for (const part of raisedFloorRects(rect, zones)) {
            if (system) placeFloorSupport(builder, system, room, part, y, frame);
            else surface(builder, module, room, part, y, frame);
        }
        lights.push(...placeLevels(builder, whole.style ?? module.replace(/^floor-slab-/, ''), whole, rect, frame));
    }
    return lights;
}

/** A ceiling over a room rectangle: the fitted outer band where the rectangle can hold one,
 *  inset fields inside it, and the family's exposed services along the run. Given the whole
 *  room, a registered ceiling system builds it at the room's own height (the storey ceiling
 *  less its ceilingDrop) and may move the room's `planned` spots. Returns lens records. */
export function ceiling(builder: PlacementBuilder, finish: RoomFinish, room: string, rect: UvRect, y: number, frame: Frame,
    whole?: SurfaceRoom, planned: LightFixture[] = []): LightFixture[] {
    const system = whole ? CEILINGS.get(finish.ceiling) : undefined;
    if (system) return placeCeilingSystem(builder, system, whole!, rect, y - (whole!.ceilingDrop ?? 0), frame, planned);
    if (isLoft1702Ceiling(finish.ceiling)) {
        placeLoft1702Ceiling(builder, room, rect, y, frame, { dark: finish.ceiling === LOFT1702_FINISH.wetCeiling });
        return [];
    }
    if (finish.family === 'corporate') {
        placeCorporateCeiling(builder, room, rect, y, frame, finish.ceiling);
        return [];
    }
    if (finish.family === 'luxury') {
        placeLuxuryCeiling(builder, room, rect, y, frame);
        return [];
    }
    const banded = finish.band && rect.lu >= 2 * BAND + 1 && rect.lv >= 2 * BAND + 1;
    if (banded) {
        surface(builder, finish.band!, room, { u: rect.u, v: rect.v, lu: rect.lu, lv: BAND }, y, frame);
        surface(builder, finish.band!, room, { u: rect.u, v: rect.v + rect.lv - BAND, lu: rect.lu, lv: BAND }, y, frame);
        surface(builder, finish.band!, room, { u: rect.u, v: rect.v + BAND, lu: BAND, lv: rect.lv - 2 * BAND }, y, frame);
        surface(builder, finish.band!, room, { u: rect.u + rect.lu - BAND, v: rect.v + BAND, lu: BAND, lv: rect.lv - 2 * BAND }, y, frame);
    }
    const field = banded ? { u: rect.u + BAND, v: rect.v + BAND, lu: rect.lu - 2 * BAND, lv: rect.lv - 2 * BAND } : rect;
    surface(builder, finish.ceiling, room, field, y, frame);
    if (finish.services === 'ceiling-services-industrial') {
        placeIndustrialServices(builder, room, rect, y, frame);
        return [];
    }
    if (finish.services && Math.max(rect.lu, rect.lv) >= 2 && Math.min(rect.lu, rect.lv) >= .5) {
        const alongU = rect.lu >= rect.lv;
        const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
        builder.module(finish.services, room, [x, y, z], [(alongU ? rect.lu : rect.lv) / .5, 1, 1],
            -frame.angleDeg * Math.PI / 180 + (alongU ? 0 : -Math.PI / 2));
    }
    return [];
}
