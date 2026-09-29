import type { Point } from '../core/geom.js';
import { distanceToSegment } from '../core/geom.js';
import type { BlueprintFloor, Opening } from '../core/types.js';
import { Facade as FacadeReservations, PARTITION_HALF } from '../layout/openings.js';
import type { EdgeName, PlanRoom } from '../layout/plan-types.js';
import { roomEdges } from '../layout/room-shape.js';
import { TILE } from '../layout/tile-fit.js';
import type { Frame } from '../layout/uv.js';
import { uvToWorld } from '../layout/uv.js';
import { edgeFrame, edgePoint } from './shell-fit.js';
const CASING = { width: 0.08 };
export interface WallHole {
    at: number;
    width: number;
    y0: number;
    y1: number;
}
export interface UvWallHole {
    axis: 'H' | 'V';
    c: number;
    hole: WallHole;
}
export interface RoomSegment {
    axis: 'H' | 'V';
    c: number;
    a: number;
    b: number;
    edge: EdgeName | null;
    /** the room's own face on the construction plate boundary, lined against the shell */
    boundary?: boolean;
}
export function doorHeadHeight(leaves: number, clearHeight: number): number {
    const head = leaves >= 3 ? 3.0 : 2.5;
    return Math.min(head, clearHeight - 2 * CASING.width);
}
export function reserveFacadeEnds(segment: RoomSegment, facade: FacadeReservations, facadeFloor: BlueprintFloor, frame: Frame, facadeDepth: number, windows = true): RoomSegment | null {
    const point = (along: number): Point => segment.axis === "H" ? [along, segment.c] : [segment.c, along];
    const facadeEdge = (edge: number): [
        Point,
        Point
    ] => [
        facadeFloor.outline[edge]!, facadeFloor.outline[(edge + 1) % facadeFloor.outline.length]!,
    ];
    const trim = (at: number, direction: -1 | 1): number => {
        const world = uvToWorld(point(at), frame);
        const reservation = facade.reservationAt(world, PARTITION_HALF, facadeDepth + PARTITION_HALF);
        // A partition carried to the shell's face closes against the shell, a window's reveal
        // included; only a door's or portal's passage keeps it back.
        if (!reservation || !windows && (!reservation.opening || reservation.opening.kind === 'window'))
            return 0;
        const openingDepth = reservation.opening?.door?.motion?.clearDepth
            ?? reservation.opening?.portal?.clearDepth
            ?? 0;
        const targetDepth = Math.max(facadeDepth, openingDepth) + PARTITION_HALF;
        const remaining = Math.max(0, targetDepth - reservation.distance);
        if (remaining === 0)
            return 0;
        const next = uvToWorld(point(at + direction), frame);
        const movement: Point = [next[0] - world[0], next[1] - world[1]];
        const outline = facadeEdge(reservation.edge);
        const edgeLength = Math.hypot(outline[1][0] - outline[0][0], outline[1][1] - outline[0][1]) || 1;
        const inward: Point = [
            -(outline[1][1] - outline[0][1]) / edgeLength,
            (outline[1][0] - outline[0][0]) / edgeLength,
        ];
        const slope = movement[0] * inward[0] + movement[1] * inward[1];
        return slope > 1e-3 ? remaining / slope : Infinity;
    };
    const a = segment.a + trim(segment.a, 1);
    const b = segment.b - trim(segment.b, -1);
    return b - a > 1e-3 ? { ...segment, a, b } : null;
}
/** One stretch of a wall line that openings cut: along `[a, b]`, open over each `[y0, y1]`
 *  of `open`, ascending and disjoint. Everything else of the stretch stays wall. */
export interface WallCut {
    a: number;
    b: number;
    open: [number, number][];
}
/** Holes that overlap or touch once `casing` frames them are one opening: their bounding
 *  rectangle, so a partition casing stands once around it. */
export function mergeHoles(holes: readonly WallHole[], casing = 0): WallHole[] {
    const sorted = [...holes].sort((p, q) => p.at - p.width / 2 - (q.at - q.width / 2));
    const merged: { a: number; b: number; y0: number; y1: number }[] = [];
    for (const hole of sorted) {
        const a = hole.at - hole.width / 2, b = hole.at + hole.width / 2, last = merged.at(-1);
        if (last && a - casing <= last.b + casing + 1e-6) {
            last.b = Math.max(last.b, b);
            last.y0 = Math.min(last.y0, hole.y0);
            last.y1 = Math.max(last.y1, hole.y1);
        }
        else merged.push({ a, b, y0: hole.y0, y1: hole.y1 });
    }
    return merged.map(({ a, b, y0, y1 }) => ({ at: (a + b) / 2, width: b - a, y0, y1 }));
}
/** The cuts one wall line takes from all its holes, however they overlap: a door and the
 *  shell passage it lands on, or windows of the floors that share the layout. Each hole
 *  widens by `casing` and its head rises by it; along the line, every stretch opens the union
 *  of the holes over it, so no stretch is cut twice and no sill or head crosses an opening. */
export function wallCuts(holes: readonly WallHole[], casing = 0): WallCut[] {
    const rects = holes.map(hole => ({ a: hole.at - hole.width / 2 - casing, b: hole.at + hole.width / 2 + casing, y0: hole.y0, y1: hole.y1 + casing }));
    const stops = [...new Set(rects.flatMap(r => [r.a, r.b]))].sort((p, q) => p - q);
    const cuts: WallCut[] = [];
    for (let i = 0; i + 1 < stops.length; i++) {
        const a = stops[i]!, b = stops[i + 1]!, mid = (a + b) / 2;
        if (b - a < 1e-9) continue;
        const spans = rects.filter(r => r.a < mid && r.b > mid).map(r => [r.y0, r.y1] as [number, number]).sort((p, q) => p[0] - q[0]);
        if (!spans.length) continue;
        const open: [number, number][] = [];
        for (const [y0, y1] of spans) {
            const top = open.at(-1);
            if (top && y0 <= top[1] + 1e-6) top[1] = Math.max(top[1], y1);
            else open.push([y0, y1]);
        }
        const last = cuts.at(-1);
        if (last && Math.abs(last.b - a) < 1e-9 && sameSpans(last.open, open)) last.b = b;
        else cuts.push({ a, b, open });
    }
    return cuts;
}
function sameSpans(p: readonly [number, number][], q: readonly [number, number][]): boolean {
    return p.length === q.length && p.every(([y0, y1], i) => Math.abs(y0 - q[i]![0]) < 1e-6 && Math.abs(y1 - q[i]![1]) < 1e-6);
}
/** The passage an opening keeps clear through the lining: a window's glazing, a door's
 *  published clearance, which a pocket door sets beside its cassette. */
export function openingSpan(opening: Opening): { from: number; to: number; sill: number; height: number } {
    const field = opening.kind === 'window' ? opening.glazing ?? opening : opening.door?.clearance ?? opening;
    const sill = opening.kind === 'window' ? field.sill ?? 0 : 0;
    return { from: field.offset, to: field.offset + field.width, sill, height: field.height };
}
/** An exterior connection at `world` opens no higher than the shell passage it lands on,
 *  the nearest door, balcony door or portal, nor higher than the storey; null without one. */
export function outsideDoorHead(bp: BlueprintFloor, world: Point, height: number): number | null {
    let best: { head: number; distance: number } | null = null;
    for (const opening of bp.openings) {
        if (opening.kind === 'window') continue;
        const p = edgePoint(edgeFrame(bp.outline, opening.edge), opening.offset + opening.width / 2, 0);
        const distance = Math.hypot(p[0] - world[0], p[1] - world[1]);
        if (!best || distance < best.distance) best = { head: openingSpan(opening).height, distance };
    }
    return best ? Math.min(height, best.head) : null;
}
/** The room boundaries a partition stands on. An edge lying on the buildable plate's own
 *  boundary is the open perimeter, where the facade lining or Exterior's slab stands instead. */
/** Every wall face a room owns: its partitions, and its own face on the plate boundary
 *  marked `boundary` so the caller lines it against the shell instead of the next room. An
 *  angled facade edge has no axis and stays the shell's own face. */
export function roomSegments(room: PlanRoom, plate: readonly Point[]): RoomSegment[] {
    const out: RoomSegment[] = [];
    for (const { a, b, edge } of roomEdges(room, plate)) {
        const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const boundary = onPlateBoundary(a, b, mid, plate);
        if (Math.abs(a[1] - b[1]) < 1e-6) {
            out.push({ axis: "H", c: a[1], a: Math.min(a[0], b[0]), b: Math.max(a[0], b[0]), edge, boundary });
        }
        else if (Math.abs(a[0] - b[0]) < 1e-6) {
            out.push({ axis: "V", c: a[0], a: Math.min(a[1], b[1]), b: Math.max(a[1], b[1]), edge, boundary });
        }
        // other angles only occur on the facade, which keeps its own face there
    }
    return out;
}
function onPlateBoundary(a: Point, b: Point, mid: Point, plate: readonly Point[]): boolean {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-6)
        return false;
    for (let i = 0; i < plate.length; i++) {
        const edgeA = plate[i]!;
        const edgeB = plate[(i + 1) % plate.length]!;
        const ex = edgeB[0] - edgeA[0];
        const ez = edgeB[1] - edgeA[1];
        const edgeLength = Math.hypot(ex, ez);
        if (edgeLength < 1e-6)
            continue;
        const parallel = Math.abs((dx * ex + dz * ez) / (length * edgeLength));
        // Layout cells can put the room edge up to half a finish tile behind the exact plate.
        // That one-sided snapped edge is still the plate's boundary, not a partition.
        if (parallel > 0.999 && distanceToSegment(mid, edgeA, edgeB) <= TILE / 2)
            return true;
    }
    return false;
}
