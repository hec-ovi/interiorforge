import type { Point } from '../../core/geom.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import type { Kit } from '../../modules/kit.js';

/** Geometry the surface systems (panel walls, glazing, ceilings, floors) draw their modules
 *  from: bevelled slabs, rounded extrusions and stadium outlines. Every helper emits only
 *  the faces a viewer can reach, and keeps a fixed cross-section on the axes a placement
 *  never stretches. Wall pieces follow the wall datum (back on z = 0, face towards +z,
 *  standing on y = 0); horizontal pieces lie in XZ. */

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A quad whose front faces `outward`, whatever order its corners come in. */
export function facing(k: Kit, slot: string, corners: [Vec3, Vec3, Vec3, Vec3], outward: Vec3): void {
    const n = cross(sub(corners[1], corners[0]), sub(corners[2], corners[0]));
    const quad = dot(n, outward) >= 0 ? corners : [corners[3], corners[2], corners[1], corners[0]] as [Vec3, Vec3, Vec3, Vec3];
    k.mesh.addQuad(slot, quad);
}

/** Offsets and depths of a quarter-round bevel of `radius` in `segments` steps, from the
 *  side face (offset 0, depth front − radius) to the front face (offset radius, depth front). */
export function bevelRings(radius: number, segments: number, front: number): { offset: number; z: number }[] {
    const n = Math.max(1, Math.round(segments));
    return Array.from({ length: n + 1 }, (_, i) => {
        const phi = (Math.PI / 2) * (i / n);
        return { offset: radius - radius * Math.cos(phi), z: front - radius + radius * Math.sin(phi) };
    });
}

/** A wall panel slab [x0, x1] × [y0, y1] from `back` to `front`, its vertical edges always
 *  rounded by `radius`, its bottom/top edges only where a seam or floor exposes them. An
 *  unrounded horizontal edge abuts the next piece, so it draws no cap. Faces: the front,
 *  the bevel rings (mitred at the corners) and the exposed sides; never the back. */
export function bevelSlab(k: Kit, slot: string, [x0, x1]: [number, number], [y0, y1]: [number, number], back: number, front: number,
    bevel: { radius: number; segments: number }, round: { bottom: boolean; top: boolean }): void {
    const r = Math.max(0, Math.min(bevel.radius, (x1 - x0) / 2 - 1e-4, (y1 - y0) / 2 - 1e-4, front - back - 1e-4));
    const rings = r > 1e-5 ? bevelRings(r, bevel.segments, front) : [{ offset: 0, z: front }];
    const ring = (i: number) => {
        const { offset, z } = rings[i]!;
        return { l: x0 + offset, r: x1 - offset, b: y0 + (round.bottom ? offset : 0), t: y1 - (round.top ? offset : 0), z };
    };
    const outer = ring(0);
    // Sides from the back to where the bevel starts.
    if (outer.z > back + 1e-6) {
        facing(k, slot, [[x0, y0, back], [x0, y1, back], [x0, y1, outer.z], [x0, y0, outer.z]], [-1, 0, 0]);
        facing(k, slot, [[x1, y0, back], [x1, y1, back], [x1, y1, outer.z], [x1, y0, outer.z]], [1, 0, 0]);
        if (round.bottom) facing(k, slot, [[x0, y0, back], [x1, y0, back], [x1, y0, outer.z], [x0, y0, outer.z]], [0, -1, 0]);
        if (round.top) facing(k, slot, [[x0, y1, back], [x1, y1, back], [x1, y1, outer.z], [x0, y1, outer.z]], [0, 1, 0]);
    }
    for (let i = 0; i + 1 < rings.length; i++) {
        const a = ring(i), b = ring(i + 1);
        const tilt = (dx: number, dy: number): Vec3 => [dx, dy, 1];
        facing(k, slot, [[a.l, a.b, a.z], [a.l, a.t, a.z], [b.l, b.t, b.z], [b.l, b.b, b.z]], tilt(-1, 0));
        facing(k, slot, [[a.r, a.b, a.z], [a.r, a.t, a.z], [b.r, b.t, b.z], [b.r, b.b, b.z]], tilt(1, 0));
        if (round.bottom) facing(k, slot, [[a.l, a.b, a.z], [a.r, a.b, a.z], [b.r, b.b, b.z], [b.l, b.b, b.z]], tilt(0, -1));
        if (round.top) facing(k, slot, [[a.l, a.t, a.z], [a.r, a.t, a.z], [b.r, b.t, b.z], [b.l, b.t, b.z]], tilt(0, 1));
    }
    const f = ring(rings.length - 1);
    facing(k, slot, [[f.l, f.b, f.z], [f.r, f.b, f.z], [f.r, f.t, f.z], [f.l, f.t, f.z]], [0, 0, 1]);
}

/** Plan outline (x, z) of a panel's cross-section: square back corners, rounded front
 *  corners, wound with a positive (x, z) signed area, as `extrude` expects. */
export function roundedSection(halfWidth: number, back: number, front: number, radius: number, segments: number): Point[] {
    const r = Math.max(0, Math.min(radius, halfWidth - 1e-4, front - back - 1e-4));
    const rings = r > 1e-5 ? bevelRings(r, segments, front) : [{ offset: 0, z: front }];
    const right: Point[] = rings.map(({ offset, z }) => [halfWidth - offset, z]);
    const left: Point[] = [...rings].reverse().map(({ offset, z }) => [-halfWidth + offset, z]);
    const outline: Point[] = [[-halfWidth, back], [halfWidth, back], ...right, ...left];
    return ccw(dedupe(outline));
}

/** A vertical extrusion of a plan outline from y0 to y1: outward sides except those lying
 *  on z = `skipZ` (the hidden back), no caps. */
export function extrude(k: Kit, slot: string, ring: readonly Point[], y0: number, y1: number, skipZ?: number): void {
    const outline = ccw([...ring]);
    for (let i = 0; i < outline.length; i++) {
        const a = outline[i]!, b = outline[(i + 1) % outline.length]!;
        if (skipZ !== undefined && Math.abs(a[1] - skipZ) < 1e-7 && Math.abs(b[1] - skipZ) < 1e-7) continue;
        const nx = b[1] - a[1], nz = -(b[0] - a[0]);
        facing(k, slot, [[a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]]], [nx, 0, nz]);
    }
}

/** A horizontal extrusion along x of a (y, z) section from x0 to x1: its outward faces,
 *  no end caps unless asked. Used for fixed cross-sections stretched along a run. */
export function sweepX(k: Kit, slot: string, section: readonly [number, number][], x0: number, x1: number, caps = false): void {
    const pts = ccwYZ(section);
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
        // Outward normal in (y, z) for a CCW (y, z) polygon.
        const ny = b[1] - a[1], nz = -(b[0] - a[0]);
        facing(k, slot, [[x0, a[0], a[1]], [x1, a[0], a[1]], [x1, b[0], b[1]], [x0, b[0], b[1]]], [0, ny, nz]);
    }
    if (!caps) return;
    capYZ(k, slot, pts, x0, -1);
    capYZ(k, slot, pts, x1, 1);
}

/** A flat cap of a convex (y, z) polygon at x, facing ±x. */
function capYZ(k: Kit, slot: string, pts: readonly [number, number][], x: number, side: 1 | -1): void {
    for (let i = 1; i + 1 < pts.length; i += 2) {
        const a = pts[0]!, b = pts[i]!, c = pts[i + 1]!, d = pts[Math.min(i + 2, pts.length - 1)]!;
        facing(k, slot, [[x, a[0], a[1]], [x, b[0], b[1]], [x, c[0], c[1]], [x, d[0], d[1]]], [side, 0, 0]);
    }
}

/** A flat horizontal cap of a convex plan outline at y, facing up or down, as a quad fan. */
export function capXZ(k: Kit, slot: string, outline: readonly Point[], y: number, up: boolean): void {
    for (let i = 1; i + 1 < outline.length; i += 2) {
        const a = outline[0]!, b = outline[i]!, c = outline[i + 1]!, d = outline[Math.min(i + 2, outline.length - 1)]!;
        facing(k, slot, [[a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [d[0], y, d[1]]], [0, up ? 1 : -1, 0]);
    }
}

/** A box proud of a wall face: its front and four sides, no back (it stands on the face). */
export function stud(k: Kit, slot: string, [cx, cy]: [number, number], [w, h]: [number, number], z0: number, z1: number): void {
    k.box(slot, [cx - w / 2, cy - h / 2, z0], [w, h, z1 - z0], undefined, ['north', 'east', 'west', 'top', 'bottom']);
}

/** Half a stadium in plan: a semicircle of `radius` centred on the origin, bulging towards
 *  +x, as `segments` + 1 points from (0, -radius) to (0, +radius). */
export function halfRound(radius: number, segments: number): Point[] {
    const n = Math.max(2, Math.round(segments));
    return Array.from({ length: n + 1 }, (_, i) => {
        const a = -Math.PI / 2 + Math.PI * (i / n);
        return [radius * Math.cos(a), radius * Math.sin(a)] as Point;
    });
}

function dedupe(points: Point[]): Point[] {
    return points.filter((p, i) => {
        const q = points[(i + points.length - 1) % points.length]!;
        return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7;
    });
}

/** The ring wound with a positive (x, z) shoelace area, whose outward edge normal is
 *  (dz, -dx). */
export function ccw(points: Point[]): Point[] {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i]!, b = points[(i + 1) % points.length]!;
        area += a[0] * b[1] - b[0] * a[1];
    }
    return area > 0 ? points : [...points].reverse();
}

function ccwYZ(points: readonly [number, number][]): [number, number][] {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i]!, b = points[(i + 1) % points.length]!;
        area += a[0] * b[1] - b[0] * a[1];
    }
    return area > 0 ? [...points] : [...points].reverse();
}
