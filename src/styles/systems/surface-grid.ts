import type { Point } from '../../core/geom.js';
import type { Frame, UvRect } from '../../layout/uv.js';
import { uvToWorld } from '../../layout/uv.js';
import type { PlacementBuilder } from '../../placements/builder.js';

/** Plan helpers the ceiling and floor systems share: which sides of a room rectangle are
 *  real walls (not the cut between two rectangles of one room), bands along them, and a
 *  cell grid phased to the building grid or the room, laid as baked blocks with rows,
 *  columns and single cells where a block is clipped. Everything is in uv (the building
 *  frame); a piece's local x runs along u and its local z along v. */

export type Side = 'u0' | 'u1' | 'v0' | 'v1';
export const SIDES: readonly Side[] = ['v0', 'v1', 'u0', 'u1'];
const EPS = 1e-6;

/** Unit inward normal (uv) of a rectangle side. */
export const inward = (side: Side): Point => side === 'u0' ? [1, 0] : side === 'u1' ? [-1, 0] : side === 'v0' ? [0, 1] : [0, -1];

/** The line a side lies on and the span it covers along it. */
function sideLine(rect: UvRect, side: Side): { axis: 'u' | 'v'; c: number; a: number; b: number } {
    switch (side) {
        case 'v0': return { axis: 'u', c: rect.v, a: rect.u, b: rect.u + rect.lu };
        case 'v1': return { axis: 'u', c: rect.v + rect.lv, a: rect.u, b: rect.u + rect.lu };
        case 'u0': return { axis: 'v', c: rect.u, a: rect.v, b: rect.v + rect.lv };
        case 'u1': return { axis: 'v', c: rect.u + rect.lu, a: rect.v, b: rect.v + rect.lv };
    }
}

/** Parts of each rectangle side that lie on the room's outline or its holes: real walls.
 *  Intervals are along the side's own axis (u for v-sides, v for u-sides), merged. */
export function wallIntervals(rect: UvRect, rings: readonly (readonly Point[])[]): Record<Side, [number, number][]> {
    const out = { u0: [], u1: [], v0: [], v1: [] } as Record<Side, [number, number][]>;
    for (const side of SIDES) {
        const line = sideLine(rect, side), spans: [number, number][] = [];
        for (const ring of rings) for (let i = 0; i < ring.length; i++) {
            const p = ring[i]!, q = ring[(i + 1) % ring.length]!;
            // An outline edge collinear with the side: u-running edges have equal v.
            const along = line.axis === 'u' ? 0 : 1, across = 1 - along;
            if (Math.abs(p[across]! - line.c) > 1e-5 || Math.abs(q[across]! - line.c) > 1e-5) continue;
            const lo = Math.max(line.a, Math.min(p[along]!, q[along]!)), hi = Math.min(line.b, Math.max(p[along]!, q[along]!));
            if (hi > lo + EPS) spans.push([lo, hi]);
        }
        spans.sort((x, y) => x[0] - y[0]);
        for (const span of spans) {
            const last = out[side].at(-1);
            if (last && span[0] <= last[1] + 1e-5) last[1] = Math.max(last[1], span[1]);
            else out[side].push([...span]);
        }
    }
    return out;
}

/** True when both sides meeting at a rectangle corner are real walls right up to it. */
export function wallCorner(walls: Record<Side, [number, number][]>, rect: UvRect, uSide: 'u0' | 'u1', vSide: 'v0' | 'v1'): boolean {
    const u = uSide === 'u0' ? rect.u : rect.u + rect.lu, v = vSide === 'v0' ? rect.v : rect.v + rect.lv;
    const reaches = (spans: [number, number][], at: number) => spans.some(([a, b]) => at >= a - 1e-5 && at <= b + 1e-5);
    return reaches(walls[vSide], u) && reaches(walls[uSide], v);
}

/** One straight band along a wall interval: `offset` from the wall, `width` deep. */
export interface Band { side: Side; a: number; b: number; offset: number; width: number }

/** Bands at `offset` from every real wall of the rectangle, `width` deep (one width, or one
 *  per side). At a corner where two bands meet, the v-sides (running along u) keep the
 *  corner square and the u-sides stop short of it, so no two bands overlap; `corners` lists
 *  those corners. */
export function wallBands(rect: UvRect, walls: Record<Side, [number, number][]>, offset: number, width: number | Record<Side, number>):
    { bands: Band[]; corners: { u: 'u0' | 'u1'; v: 'v0' | 'v1' }[] } {
    const bands: Band[] = [], corners: { u: 'u0' | 'u1'; v: 'v0' | 'v1' }[] = [];
    // Never deeper than half the rectangle across: bands from opposite walls must not meet.
    const deep = (side: Side) => Math.max(0, Math.min(typeof width === 'number' ? width : width[side],
        (side[0] === 'u' ? rect.lu : rect.lv) / 2 - offset));
    for (const uSide of ['u0', 'u1'] as const) for (const vSide of ['v0', 'v1'] as const)
        if (wallCorner(walls, rect, uSide, vSide)) corners.push({ u: uSide, v: vSide });
    const corner = (u: 'u0' | 'u1', v: 'v0' | 'v1') => corners.some(c => c.u === u && c.v === v);
    for (const side of SIDES) for (const [a0, b0] of walls[side]) {
        let a = a0, b = b0;
        if (side === 'v0' || side === 'v1') {
            // Along u: step in by the offset where a wall corner turns the band.
            if (corner('u0', side) && Math.abs(a0 - rect.u) < 1e-5) a += offset;
            if (corner('u1', side) && Math.abs(b0 - rect.u - rect.lu) < 1e-5) b -= offset;
        } else {
            // Along v: stop where the v-side band that owns the corner ends.
            if (corner(side, 'v0') && Math.abs(a0 - rect.v) < 1e-5) a += offset + deep('v0');
            if (corner(side, 'v1') && Math.abs(b0 - rect.v - rect.lv) < 1e-5) b -= offset + deep('v1');
        }
        // A zero-width band is a line (a fascia, a lens) at `offset`: it needs the room to reach it.
        const line = typeof width === 'number' && width === 0 && offset <= (side[0] === 'u' ? rect.lu : rect.lv) / 2 + 1e-9;
        if (b > a + 1e-4 && (deep(side) > 1e-3 || line)) bands.push({ side, a, b, offset, width: deep(side) });
    }
    return { bands, corners };
}

/** The plan rectangle a band covers. */
export function bandRect(rect: UvRect, band: Band): UvRect {
    const { a, b, offset, width } = band;
    switch (band.side) {
        case 'v0': return { u: a, v: rect.v + offset, lu: b - a, lv: width };
        case 'v1': return { u: a, v: rect.v + rect.lv - offset - width, lu: b - a, lv: width };
        case 'u0': return { u: rect.u + offset, v: a, lu: width, lv: b - a };
        case 'u1': return { u: rect.u + rect.lu - offset - width, v: a, lu: width, lv: b - a };
    }
}

/** A rectangle minus others, as disjoint rectangles. */
export function subtractAll(from: UvRect, cuts: readonly UvRect[]): UvRect[] {
    let parts = [from];
    for (const cut of cuts) parts = parts.flatMap(part => subtract(part, cut));
    return parts;
}

function subtract(a: UvRect, b: UvRect): UvRect[] {
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

export interface CellGrid {
    /** cell pitch [u, v] */
    pitch: [number, number];
    /** cells per baked block [u, v] */
    cells: [number, number];
    /** joint between cells */
    joint: number;
}

/** A piece of a cell grid: `cells` [a, b] of one block laid as one module, the block's own
 *  module when it is whole. Along each axis a piece holds either whole cells (unscaled) or
 *  one cell cut by the area's side (stretched on that axis). `rect` is the area its skin
 *  covers (joints already taken off on cell boundaries, never on the area's own sides);
 *  `scale` is the stretch of the authored piece in u, v. */
export interface GridPiece { cells: [number, number]; whole: boolean; rect: UvRect; scale: [number, number]; block: [number, number] }

/** Module id of an a × b piece of a grid: the block itself when whole, else `<block>-<a>x<b>`. */
export function gridId(block: string, cells: readonly [number, number], [a, b]: readonly [number, number]): string {
    return a === cells[0] && b === cells[1] ? block : `${block}-${a}x${b}`;
}

/** Every piece module a grid can need: all a × b sub-blocks of its block. */
export function gridModules(block: string, cells: readonly [number, number]): { id: string; cells: [number, number] }[] {
    const out: { id: string; cells: [number, number] }[] = [];
    for (let a = 1; a <= cells[0]; a++) for (let b = 1; b <= cells[1]; b++) out.push({ id: gridId(block, cells, [a, b]), cells: [a, b] });
    return out;
}

/** Covers `region` with the grid phased at `origin`: every block wholly inside is one block
 *  piece at scale 1; a clipped block becomes its whole cells as one unscaled sub-block plus
 *  the cells the area's sides cut, grouped per side into sub-blocks stretched only across
 *  the cut. Joints stay on the grid: a piece keeps half a joint on each side that is a cell
 *  boundary, and none on the area's own sides unless they fall on a grid line. */
export function gridPieces(region: UvRect, origin: Point, grid: CellGrid): GridPiece[] {
    const [pu, pv] = grid.pitch, [cu, cv] = grid.cells, bu = pu * cu, bv = pv * cv;
    const r0: Point = [region.u, region.v], r1: Point = [region.u + region.lu, region.v + region.lv];
    const out: GridPiece[] = [];
    for (let bj = Math.floor((r0[1] - origin[1]) / bv + 1e-9); origin[1] + bj * bv < r1[1] - 1e-7; bj++) {
        for (let bi = Math.floor((r0[0] - origin[0]) / bu + 1e-9); origin[0] + bi * bu < r1[0] - 1e-7; bi++) {
            const ku = origin[0] + bi * bu, kv = origin[1] + bj * bv;
            const us = runs(Math.max(ku, r0[0]), Math.min(ku + bu, r1[0]), ku, pu, cu, [origin[0], r0[0], r1[0]], grid.joint);
            const vs = runs(Math.max(kv, r0[1]), Math.min(kv + bv, r1[1]), kv, pv, cv, [origin[1], r0[1], r1[1]], grid.joint);
            for (const su of us) for (const sv of vs) out.push({
                cells: [su.count, sv.count], whole: su.count === cu && sv.count === cv, block: [bi, bj],
                rect: { u: su.a, v: sv.a, lu: su.b - su.a, lv: sv.b - sv.a },
                scale: [su.cut ? (su.b - su.a) / (pu - grid.joint) : 1, sv.cut ? (sv.b - sv.a) / (pv - grid.joint) : 1],
            });
        }
    }
    return out;
}

/** One block's cells inside [lo, hi] along one axis, as runs: each cell the area's side
 *  cuts on its own (stretched), the whole cells between them together (unscaled). Skins
 *  keep half a joint off every cell boundary; an area side takes none unless it lies on a
 *  grid line, where the next area's skin meets it. */
function runs(lo: number, hi: number, start: number, pitch: number, count: number, [origin, r0, r1]: [number, number, number], j: number):
    { a: number; b: number; count: number; cut: boolean }[] {
    if (hi - lo < 1e-4) return [];
    const onGrid = (x: number) => Math.abs((x - origin) / pitch - Math.round((x - origin) / pitch)) < 1e-6;
    const out: { a: number; b: number; count: number; cut: boolean }[] = [];
    for (let i = 0; i < count; i++) {
        const c0 = start + i * pitch, c1 = c0 + pitch, a = Math.max(lo, c0), b = Math.min(hi, c1);
        if (b - a <= 1e-4) continue;
        const cut = a > c0 + 1e-7 || b < c1 - 1e-7, last = out[out.length - 1];
        if (!cut && last && !last.cut) { last.b = b; last.count++; continue; }
        out.push({ a, b, count: 1, cut });
    }
    for (const run of out) {
        run.a += run.a > r0 + 1e-7 || onGrid(run.a) ? j / 2 : 0;
        run.b -= run.b < r1 - 1e-7 || onGrid(run.b) ? j / 2 : 0;
    }
    return out.filter(run => run.b - run.a > 1e-4);
}


/** Places a flat piece lying in the room plane: centre of `rect`, stretched [su, 1, sv]. */
export function lay(builder: Pick<PlacementBuilder, 'module'>, module: string, room: string, rect: UvRect, y: number, frame: Frame,
    scale: [number, number], extra: { id?: string } = {}) {
    const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
    return builder.module(module, room, [x, y, z], [scale[0], 1, scale[1]], -frame.angleDeg * Math.PI / 180, extra);
}

/** The rotation that turns a piece's local +z towards the uv direction `d`. */
export function facingRotation(d: Point, frame: Frame): number {
    const [x, z] = uvToWorld(d, frame);
    return Math.atan2(x, z);
}
