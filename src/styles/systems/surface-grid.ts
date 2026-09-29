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

/** One straight band along a wall interval: `offset` from the wall, `width` deep, trimmed at
 *  both ends by `trim` (the part a perpendicular band or a corner piece owns). */
export interface Band { side: Side; a: number; b: number; offset: number; width: number }

/** Bands of `width` at `offset` from every real wall of the rectangle. At a corner where two
 *  bands meet, the v-sides (running along u) keep the corner square and the u-sides stop
 *  short of it, so no two bands overlap. `corners` lists those shared corner squares. */
export function wallBands(rect: UvRect, walls: Record<Side, [number, number][]>, offset: number, width: number):
    { bands: Band[]; corners: { u: 'u0' | 'u1'; v: 'v0' | 'v1' }[] } {
    const bands: Band[] = [], corners: { u: 'u0' | 'u1'; v: 'v0' | 'v1' }[] = [];
    const inner = offset + width;
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
            if (corner(side, 'v0') && Math.abs(a0 - rect.v) < 1e-5) a += inner;
            if (corner(side, 'v1') && Math.abs(b0 - rect.v - rect.lv) < 1e-5) b -= inner;
        }
        if (b > a + 1e-4) bands.push({ side, a, b, offset, width });
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

/** A piece of a cell grid: a whole block, a row or column of one block's cells, or one
 *  cell. `rect` is the area its skin covers (joints already taken off on cell boundaries,
 *  never on the region's own sides); `scale` is the stretch of the authored piece in u, v. */
export interface GridPiece { kind: 'block' | 'row' | 'col' | 'cell'; rect: UvRect; scale: [number, number]; block: [number, number] }

/** Ids of a grid's pieces by convention: the block module, then `-row`, `-col`, `-cell`.
 *  A piece shaped like one already named reuses it (a one-row block is its own row, a
 *  one-cell block its own cell), so a single-cell grid needs only its block module. */
export function gridIds(block: string, [cu, cv]: readonly [number, number]): Record<GridPiece['kind'], string> {
    const shapes: [GridPiece['kind'], number, number, string][] = [
        ['block', cu, cv, block], ['row', cu, 1, `${block}-row`], ['col', 1, cv, `${block}-col`], ['cell', 1, 1, `${block}-cell`]];
    const ids = {} as Record<GridPiece['kind'], string>;
    for (const [kind, a, b] of shapes) ids[kind] = shapes.find(([, x, y]) => x === a && y === b)![3];
    return ids;
}

/** Every distinct piece of a grid: kind, cells across u and v, and module id. */
export function gridModules(block: string, cells: readonly [number, number]): { id: string; cells: [number, number] }[] {
    const ids = gridIds(block, cells), [cu, cv] = cells;
    const shape: Record<GridPiece['kind'], [number, number]> = { block: [cu, cv], row: [cu, 1], col: [1, cv], cell: [1, 1] };
    const seen = new Set<string>();
    return (Object.keys(ids) as GridPiece['kind'][]).filter(kind => !seen.has(ids[kind]) && !!seen.add(ids[kind]))
        .map(kind => ({ id: ids[kind], cells: shape[kind] }));
}

/** Covers `region` with the grid phased at `origin`: every block wholly inside is one block
 *  piece at scale 1; a block cut across v only becomes its cell rows (full width, v
 *  stretched), across u only its cell columns, across both its single cells. Joints stay on
 *  the grid: a clipped piece keeps half a joint on each side that is a cell boundary. */
export function gridPieces(region: UvRect, origin: Point, grid: CellGrid): GridPiece[] {
    const [pu, pv] = grid.pitch, [cu, cv] = grid.cells, bu = pu * cu, bv = pv * cv, j = grid.joint;
    const r0: Point = [region.u, region.v], r1: Point = [region.u + region.lu, region.v + region.lv];
    const out: GridPiece[] = [];
    const inset = (x0: number, x1: number, lo: number, hi: number, origin: number, pitch: number): [number, number] => {
        const onGrid = (x: number) => Math.abs((x - origin) / pitch - Math.round((x - origin) / pitch)) < 1e-6;
        return [x0 + (x0 > lo + 1e-7 || onGrid(x0) ? j / 2 : 0), x1 - (x1 < hi - 1e-7 || onGrid(x1) ? j / 2 : 0)];
    };
    for (let bj = Math.floor((r0[1] - origin[1]) / bv + 1e-9); origin[1] + bj * bv < r1[1] - 1e-7; bj++) {
        for (let bi = Math.floor((r0[0] - origin[0]) / bu + 1e-9); origin[0] + bi * bu < r1[0] - 1e-7; bi++) {
            const ku = origin[0] + bi * bu, kv = origin[1] + bj * bv;
            const iu0 = Math.max(ku, r0[0]), iu1 = Math.min(ku + bu, r1[0]), iv0 = Math.max(kv, r0[1]), iv1 = Math.min(kv + bv, r1[1]);
            if (iu1 - iu0 < 1e-4 || iv1 - iv0 < 1e-4) continue;
            const fullU = iu0 <= ku + 1e-7 && iu1 >= ku + bu - 1e-7, fullV = iv0 <= kv + 1e-7 && iv1 >= kv + bv - 1e-7;
            const block: [number, number] = [bi, bj];
            if (fullU && fullV) {
                out.push({ kind: 'block', rect: { u: ku + j / 2, v: kv + j / 2, lu: bu - j, lv: bv - j }, scale: [1, 1], block });
                continue;
            }
            const us = cellSpans(iu0, iu1, ku, pu, cu), vs = cellSpans(iv0, iv1, kv, pv, cv);
            if (fullU) for (const [v0, v1] of vs) {
                const [a, b] = inset(v0, v1, r0[1], r1[1], origin[1], pv);
                if (b - a > 1e-4) out.push({ kind: 'row', rect: { u: ku + j / 2, v: a, lu: bu - j, lv: b - a }, scale: [1, (b - a) / (pv - j)], block });
            }
            else if (fullV) for (const [u0, u1] of us) {
                const [a, b] = inset(u0, u1, r0[0], r1[0], origin[0], pu);
                if (b - a > 1e-4) out.push({ kind: 'col', rect: { u: a, v: kv + j / 2, lu: b - a, lv: bv - j }, scale: [(b - a) / (pu - j), 1], block });
            }
            else for (const [v0, v1] of vs) for (const [u0, u1] of us) {
                const [a, b] = inset(u0, u1, r0[0], r1[0], origin[0], pu), [c, d] = inset(v0, v1, r0[1], r1[1], origin[1], pv);
                if (b - a > 1e-4 && d - c > 1e-4) out.push({ kind: 'cell', rect: { u: a, v: c, lu: b - a, lv: d - c }, scale: [(b - a) / (pu - j), (d - c) / (pv - j)], block });
            }
        }
    }
    return out;
}

/** The cell intervals of one block inside [lo, hi]. */
function cellSpans(lo: number, hi: number, start: number, pitch: number, count: number): [number, number][] {
    const spans: [number, number][] = [];
    for (let i = 0; i < count; i++) {
        const a = Math.max(lo, start + i * pitch), b = Math.min(hi, start + (i + 1) * pitch);
        if (b > a + 1e-4) spans.push([a, b]);
    }
    return spans;
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
