import type { Point } from '../core/geom.js';
import { distanceToSegment } from '../core/geom.js';
import type { BlueprintFloor } from '../core/types.js';
import { Facade as FacadeReservations, PARTITION_HALF } from '../layout/openings.js';
import type { EdgeName, PlanRoom } from '../layout/plan-types.js';
import { roomEdges } from '../layout/room-shape.js';
import { TILE } from '../layout/tile-fit.js';
import type { Frame } from '../layout/uv.js';
import { uvToWorld } from '../layout/uv.js';
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
}
export function doorHeadHeight(leaves: number, clearHeight: number): number {
    const head = leaves >= 3 ? 3.0 : 2.5;
    return Math.min(head, clearHeight - 2 * CASING.width);
}
export function reserveFacadeEnds(segment: RoomSegment, facade: FacadeReservations, facadeFloor: BlueprintFloor, frame: Frame, facadeDepth: number): RoomSegment | null {
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
        if (!reservation)
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
export function canonicalHoles(holes: readonly WallHole[]): WallHole[] {
    const unique = new Map<string, WallHole>();
    for (const hole of holes) {
        const key = [hole.at, hole.width, hole.y0, hole.y1]
            .map((value) => Math.round(value * 1e5))
            .join(":");
        if (!unique.has(key))
            unique.set(key, hole);
    }
    return [...unique.values()].sort((a, b) => a.at - b.at || a.y0 - b.y0 || a.y1 - b.y1);
}
export function roomSegments(room: PlanRoom, uvOutline: readonly Point[], facadeDepth: number): RoomSegment[] {
    const out: RoomSegment[] = [];
    for (const { a, b, edge } of roomEdges(room, uvOutline)) {
        const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (onFacadeBand(a, b, mid, uvOutline, facadeDepth))
            continue;
        if (Math.abs(a[1] - b[1]) < 1e-6) {
            out.push({ axis: "H", c: a[1], a: Math.min(a[0], b[0]), b: Math.max(a[0], b[0]), edge });
        }
        else if (Math.abs(a[0] - b[0]) < 1e-6) {
            out.push({ axis: "V", c: a[0], a: Math.min(a[1], b[1]), b: Math.max(a[1], b[1]), edge });
        }
        // other angles only occur on the facade, which the boundary test skipped
    }
    return out;
}
function onFacadeBand(a: Point, b: Point, mid: Point, outline: readonly Point[], facadeDepth: number): boolean {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-6)
        return false;
    for (let i = 0; i < outline.length; i++) {
        const edgeA = outline[i]!;
        const edgeB = outline[(i + 1) % outline.length]!;
        const ex = edgeB[0] - edgeA[0];
        const ez = edgeB[1] - edgeA[1];
        const edgeLength = Math.hypot(ex, ez);
        if (edgeLength < 1e-6)
            continue;
        const parallel = Math.abs((dx * ex + dz * ez) / (length * edgeLength));
        // Layout cells can put the room edge up to half a finish tile behind the exact inset.
        // That one-sided snapped edge is still the facade lining's boundary, not a partition.
        if (parallel > 0.999 && distanceToSegment(mid, edgeA, edgeB) <= facadeDepth + TILE / 2)
            return true;
    }
    return false;
}
