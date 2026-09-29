import { boundaryDistance, type Point } from '../../core/geom.js';
import type { LightFixture, Room } from '../../core/types.js';
import type { CapsuleProfile } from '../capsule/profile.js';
import { LocalFrame, lensRecord } from '../systems/built-ins.js';
import type { DressContext } from '../systems/types.js';

/** Dress passes of kind C, run after walls, surfaces and props and before the room lights are
 *  balanced. Housings (the capsule beams and ducts, the corridor ducts, the AC units) are
 *  placed by the housing system from each style's `housings`; these passes add the rest. */

const CELL = .5;
/** Wall face off the partition line: casings and panel faces stand inside it. */
const FACE = .1;
/** Least distance a dressing piece keeps from the shell outline (the lining and its wall). */
const SHELL = .6;

/** True when the footprint [x0, x1] x [z0, z1] of `frame` stays clear of the shell. */
function clearOfShell(ctx: DressContext, frame: LocalFrame, x0: number, x1: number, z0: number, z1: number): boolean {
    return ([[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as const).every(([x, z]) => {
        const p = frame.at(x, 0, z);
        return boundaryDistance([p[0], p[2]] as Point, ctx.bp.outline) >= SHELL;
    });
}

/** Capsule homes: the H10 bathroom glows amber behind its portal; the Japantown wet recess
 *  stays cool. Only the planned records of the style's wet rooms change colour. */
export function dressCapsuleHome(ctx: DressContext, profile: CapsuleProfile): LightFixture[] {
    const wet = new Set(ctx.rooms.filter(room => room.kind === 'bathroom').map(room => room.id));
    for (const light of ctx.floor.lights) {
        if (!wet.has(light.room) || light.furniture) continue;
        light.colorTemperatureK = profile === 'h10' ? 2300 : 4600;
    }
    return [];
}

const TRUNK_ROOMS = new Set(['corridor', 'elevator_lobby', 'concourse', 'reception', 'lounge', 'mechanical_room', 'storage']);
const LAMP_ROOMS = new Set(['corridor', 'elevator_lobby', 'concourse', 'reception', 'lounge']);

/** Public floors (c2 corridors and landings, c3 atrium rooms): the exposed ceiling trunk in
 *  2 m bays along the long side of every ceiling rectangle, caged wall lamps on long walls
 *  clear of every doorway, and a debris layer along the walls of long corridors. */
export function dressPublic(ctx: DressContext, sid: 'c2' | 'c3'): LightFixture[] {
    const lights: LightFixture[] = [];
    const rooms = new Map(ctx.rooms.filter(room => !/^(stair|elev)-/.test(room.id)).map(room => [room.id, room]));
    const backing = 'ceiling-field-c2';
    const doors = ctx.floor.rooms.flatMap(room => room.doors.map(door => ({ at: door.position, width: door.width })));
    if (ctx.ceilingY >= 2.75) for (const p of ctx.builder.placements.filter(q => q.module === backing && rooms.has(q.room))) {
        const room = rooms.get(p.room)!;
        if (!TRUNK_ROOMS.has(room.kind)) continue;
        trunk(ctx, p.room, p.position, p.rotationY, p.scale[0] * CELL, p.scale[2] * CELL);
    }
    for (const room of rooms.values()) {
        if (!LAMP_ROOMS.has(room.kind)) continue;
        lights.push(...wallLamps(ctx, room, doors, sid === 'c3' ? 'trim-c3-low-lamp' : 'trim-c2-wall-lamp'));
        if (sid === 'c2') debris(ctx, room, doors);
    }
    return lights;
}

/** The small studio: a round ceiling disc over the room's middle and red neon signs on its
 *  two longest walls clear of doorways, each lens with its (coloured) record. */
export function dressStudio(ctx: DressContext): LightFixture[] {
    const lights: LightFixture[] = [];
    const doors = ctx.floor.rooms.flatMap(room => room.doors.map(door => ({ at: door.position, width: door.width })));
    for (const room of ctx.rooms.filter(r => r.kind === 'studio_main' || r.kind === 'living' || r.kind === 'bedroom')) {
        const xs = room.polygon.map(p => p[0]), zs = room.polygon.map(p => p[1]);
        const centre: [number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
        const y = ctx.ceilingY - (room.ceilingDrop ?? 0);
        if (inside(room, centre) && y > 2.6) {
            const frame = new LocalFrame([centre[0], 0, centre[1]], 0);
            const disc = frame.place(ctx.builder, 'trim-c6-disc', room.id, 0, y, 0);
            lights.push(lensRecord(frame, room.id, disc.id, 0, y - .13, 0, 1.1, ctx.floor.elevation,
                { kind: 'strip', lumensPerMetre: 700, color: [1, .3, .75], facing: 'down', range: 5, beamDeg: 150, diffuse: .6 }));
        }
        const edges = room.polygon.map((a, i) => [a, room.polygon[(i + 1) % room.polygon.length]!] as const)
            .map(([a, b]) => ({ a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) })).sort((p, q) => q.length - p.length);
        let signs = 0;
        for (const { a, b, length } of edges) {
            if (signs >= 2 || length < 2) continue;
            const frame = wallFrame(room, a, b);
            if (!frame) continue;
            const at = frame.at(0, 0, FACE);
            if (doors.some(door => Math.hypot(door.at[0] - at[0], door.at[1] - at[2]) < door.width / 2 + .9)) continue;
            if (!clearOfShell(ctx, frame, -.5, .5, FACE, FACE + .05)) continue;
            const sign = frame.place(ctx.builder, 'trim-c6-neon', room.id, 0, 1.55, FACE);
            lights.push(lensRecord(frame, room.id, sign.id, 0, 1.9, FACE + .03, .9, ctx.floor.elevation,
                { kind: 'strip', lumensPerMetre: 160, color: [1, .08, .1], facing: 'down', range: 2.5, beamDeg: 170, diffuse: .9 }));
            signs++;
        }
    }
    return lights;
}

/** One ceiling rectangle's trunk: whole 2 m bays centred on the run, stretched pipe runs in
 *  what is left at each end, hung 0.5 m in from one long side (the other when the first is
 *  the shell's), both ends kept clear of the shell. */
function trunk(ctx: DressContext, room: string, centre: [number, number, number], rotation: number, width: number, depth: number): void {
    const along = width >= depth, across = Math.min(width, depth);
    if (across < 1.3) return;
    const frame = new LocalFrame(centre, rotation + (along ? 0 : Math.PI / 2));
    for (let trim = .3; trim < 2.4; trim += .5) {
        const length = Math.max(width, depth) - trim;
        if (length < 1.5) return;
        const offset = [across / 2 - .55, -(across / 2 - .55)].find(z => clearOfShell(ctx, frame, -length / 2, length / 2, z - .3, z + .3));
        if (offset === undefined) continue;
        const bays = Math.floor(length / 2), rest = (length - bays * 2) / 2;
        for (let i = 0; i < bays; i++) frame.place(ctx.builder, 'trim-c2-trunk-bay', room, -length / 2 + rest + 1 + i * 2, 0, offset);
        if (rest > .05) for (const side of [-1, 1])
            frame.place(ctx.builder, 'trim-c2-trunk-run', room, side * (length / 2 - rest / 2), 0, offset, [rest / CELL, 1, 1]);
        return;
    }
}

/** Caged tube lamps on the long walls of a public room, every 6 m, never within 1.3 m of a
 *  doorway, each with its record (a soft warm wash). */
function wallLamps(ctx: DressContext, room: Room, doors: { at: [number, number]; width: number }[], module: string): LightFixture[] {
    const low = module === 'trim-c3-low-lamp';
    const lights: LightFixture[] = [], poly = room.polygon;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 3) continue;
        const frame = wallFrame(room, a, b);
        if (!frame) continue;
        const n = Math.max(1, Math.floor(length / (low ? 3 : 6)));
        for (let j = 0; j < n; j++) {
            const x = -length / 2 + length * (j + .5) / n;
            const at = frame.at(x, 0, FACE);
            if (doors.some(door => Math.hypot(door.at[0] - at[0], door.at[1] - at[2]) < door.width / 2 + 1.3)) continue;
            if (!clearOfShell(ctx, frame, x - .1, x + .1, FACE, FACE + .1)) continue;
            const placed = frame.place(ctx.builder, module, room.id, x, low ? .25 : 1.35, FACE);
            lights.push(lensRecord(frame, room.id, placed.id, x, low ? .3 : 1.71, FACE + .05, low ? .1 : .6, ctx.floor.elevation,
                low ? { kind: 'strip', lumensPerMetre: 1200, kelvin: 2400, facing: 'up', range: 2, beamDeg: 120, diffuse: .7 }
                    : { kind: 'strip', lumensPerMetre: 420, kelvin: 3000, facing: 'down', range: 4, beamDeg: 160, diffuse: .8 }));
        }
    }
    return lights;
}

/** Paper, card and cans along the walls of a long public room: one patch per 7 m of wall,
 *  alternating sides, clear of doorways. */
function debris(ctx: DressContext, room: Room, doors: { at: [number, number]; width: number }[]): void {
    const poly = room.polygon;
    let k = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 4) continue;
        const frame = wallFrame(room, a, b);
        if (!frame) continue;
        const n = Math.floor(length / 7);
        for (let j = 0; j < n; j++, k++) {
            if (k % 2) continue;
            const x = -length / 2 + length * (j + .5) / n + .9;
            const at = frame.at(x, 0, FACE + .6);
            if (Math.abs(x) > length / 2 - 1 || doors.some(door => Math.hypot(door.at[0] - at[0], door.at[1] - at[2]) < door.width / 2 + 1.6)) continue;
            if (!clearOfShell(ctx, frame, x - .9, x + .9, FACE + .2, FACE + 1.05)) continue;
            frame.place(ctx.builder, 'trim-c2-debris', room.id, x, 0, FACE + .6);
        }
    }
}

/** The frame of a wall edge a→b of a room: origin at the edge's middle on the partition
 *  line, local +x along it, +z into the room; undefined when the edge is not axis-true
 *  enough to carry pieces. */
function wallFrame(room: Room, a: [number, number], b: [number, number]): LocalFrame | undefined {
    const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
    if (length < 1e-6) return undefined;
    const mid: [number, number, number] = [(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2];
    // +x along the edge is (cos r, -sin r); pick the turn whose +z points inside.
    const r = Math.atan2(-dz, dx);
    for (const rotation of [r, r + Math.PI]) {
        const frame = new LocalFrame(mid, rotation);
        const probe = frame.at(0, 0, .3);
        if (inside(room, [probe[0], probe[2]])) return rotation === r ? frame : new LocalFrame(mid, rotation);
    }
    return undefined;
}

function inside(room: Room, [x, z]: [number, number]): boolean {
    const poly = room.polygon;
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, zi] = poly[i]!, [xj, zj] = poly[j]!;
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) hit = !hit;
    }
    return hit && !(room.holes ?? []).some(hole => inside({ ...room, polygon: hole, holes: [] }, [x, z]));
}
