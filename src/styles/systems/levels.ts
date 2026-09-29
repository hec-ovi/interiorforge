import type { Point } from '../../core/geom.js';
import { polygonBounds } from '../../core/geom.js';
import type { LightFixture, LevelZone } from '../../core/types.js';
import type { Frame, UvRect } from '../../layout/uv.js';
import { uvToWorld } from '../../layout/uv.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { lensSlot } from './panel-recipes.js';
import { facingRotation, subtractAll, wallIntervals, type Side } from './surface-grid.js';
import type { SurfaceRoom } from './types.js';

/** Level zones inside one room: a raised platform (the B3 bar, a split lobby's upper
 *  lounge) or a pit (the B3 lounge), built from solid boxes the body climbs, since every
 *  rise stays under the engine's autostep. A sunken zone (a lounge pit) sinks at most
 *  `PIT_MAX`; its tray hangs inside the depth between this floor and the ceiling of the
 *  room under it, which the building's plenum pass keeps (`placements/plenum.ts`). A zone
 *  is the axis-aligned rectangle of its uv polygon, steps included. Its exposed sides (those not on the room's own walls) either step down all
 *  along (`step`, `open`) as nested slabs, one per riser, each a going inside the one
 *  below, or stand behind a glass guard (`guard`) with one straight flight at the zone's
 *  `stair`. Nothing here changes the storey: the floor around the zone stays at Y0.
 *
 *  Pieces (per style id): `floor-slab-<sid>-platform` (the top slab, a walked floor),
 *  `floor-slab-<sid>-tread` (a step slab),
 *  `trim-<sid>-nosing` (a flush metal nosing, or `ceiling-cove-<sid>-nosing`, a lit strip
 *  with a record of the same id when the style lights its steps), `wall-guard-<sid>` (a
 *  1 m frameless glass guard with a cap). Slabs are authored as 0.5 m cubes standing on
 *  y = 0 and stretched to their top, so a raised slab stands on the structural slab and
 *  counts as the room's walking floor at Y0. A style that never registered its level
 *  look (`levelRecipes`) wears the shared `ref` look. */

/** Highest riser a zone's steps take; the engine body steps 0.42 m. */
export const RISE_MAX = .18;
/** Going of one step. */
export const TREAD = .3;
/** Zones shallower than this are finish differences, not levels. */
export const LEVEL_MIN = .02;
/** Height of a level guard above the zone's top. */
export const GUARD_HEIGHT = 1;
/** Widest single flight a guarded zone cuts into its edge. */
export const FLIGHT_MAX = 2.4;
/** Style id of the shared level look. */
export const SHARED_LEVEL_LOOK = 'ref';

const CELL = .5;
const EPS = 1e-6;
/** Width of the curb lining a sunken zone's sides. */
const CURB = .03;

export interface LevelProfile {
    /** slab top (the platform's walking surface) */
    top: string;
    /** risers and slab sides */
    riser: string;
    /** flush nosing strip at every step edge */
    nosing: string;
    guard: { glass: string; cap: string };
    /** a lit strip in each nosing instead of plain metal, with a cove record */
    lit?: { color?: [number, number, number]; kelvin: number; lumensPerMetre: number };
}

/** Level looks by style id, registered when a kind builds its level recipes. */
const PROFILES = new Map<string, LevelProfile>();

export function levelIds(sid: string) {
    return {
        platform: `floor-slab-${sid}-platform`, tread: `floor-slab-${sid}-tread`, sunken: `floor-slab-${sid}-sunken`,
        nosing: `trim-${sid}-nosing`, guard: `wall-guard-${sid}`, lens: `ceiling-cove-${sid}-nosing`,
    };
}

/** Risers a zone of this delta takes. */
export const riserCount = (delta: number): number => Math.max(1, Math.ceil(Math.abs(delta) / RISE_MAX - 1e-6));

/** A zone's rectangle: the bounds of its uv polygon. */
export function zoneRect(zone: Pick<LevelZone, 'polygon'>): UvRect {
    const b = polygonBounds(zone.polygon);
    return { u: b.x, v: b.z, lu: b.w, lv: b.d };
}

/** Sunken depth any storey holds: its tray stays inside the 0.35 m between this floor and
 *  a full-height ceiling of the storey below. */
export const SUNKEN_MAX = .3;
/** Deepest sunken zone (a reference pit of three risers); a pit deeper than `SUNKEN_MAX`
 *  needs the room below it to hang its ceiling lower, which the plenum pass arranges. */
export const PIT_MAX = .6;
/** How far a pit's tray hangs below the floor per metre of pit depth (the tray module is
 *  authored from -1 to -0.9 and stretched to the depth). */
export const TRAY_HANG = 1 / .9;
const active = (zones: readonly LevelZone[]) => zones.filter(zone => zone.delta >= LEVEL_MIN || (zone.delta <= -LEVEL_MIN && zone.delta >= -PIT_MAX - 1e-9));

/** The parts of a floor rectangle outside every level zone (uv polygons): they keep the
 *  room's own floor; `placeLevels` builds the rest. */
export function levelFloorRects(rect: UvRect, zones: readonly LevelZone[]): UvRect[] {
    return subtractAll(rect, active(zones).map(zoneRect)).filter(part => part.lu > 1e-3 && part.lv > 1e-3);
}

/** The parts of a floor rectangle under raised zones. A raised zone stands on the storey's
 *  structural slab, so the floor keeps its support there; a sunken tray replaces the slab
 *  where it hangs, so a pit takes none. */
export function raisedFloorRects(rect: UvRect, zones: readonly LevelZone[]): UvRect[] {
    const out: UvRect[] = [];
    for (const zone of active(zones)) {
        const part = zone.delta > 0 ? clipRect(zoneRect(zone), rect) : undefined;
        if (part) out.push(...subtractAll(part, out).filter(piece => piece.lu > 1e-3 && piece.lv > 1e-3));
    }
    return out;
}

/** One solid slab of a zone: a rectangle standing from `bottom` to `top`. */
export interface LevelSlab { rect: UvRect; top: number; bottom: number; module: 'platform' | 'tread' | 'sunken' }
/** A straight edge of a zone at height y: a nosing (step edge) or a guard (drop edge).
 *  `out` is the unit uv direction off the higher side. */
export interface LevelEdge { a: Point; b: Point; y: number; out: Point }
export interface LevelPlan { slabs: LevelSlab[]; nosings: LevelEdge[]; guards: LevelEdge[] }

const SIDE_OUT: Record<Side, Point> = { u0: [-1, 0], u1: [1, 0], v0: [0, -1], v1: [0, 1] };
const SIDE_LIST: readonly Side[] = ['u0', 'u1', 'v0', 'v1'];

/** Side segments of a rectangle, from its low to its high end. */
function sideSegment(r: UvRect, side: Side): [Point, Point] {
    const u1 = r.u + r.lu, v1 = r.v + r.lv;
    switch (side) {
        case 'v0': return [[r.u, r.v], [u1, r.v]];
        case 'v1': return [[r.u, v1], [u1, v1]];
        case 'u0': return [[r.u, r.v], [r.u, v1]];
        case 'u1': return [[u1, r.v], [u1, v1]];
    }
}

/** Parts of each side of the zone rectangle that face the room (not its walls), as runs
 *  along the side's own axis. */
export function exposedSides(z: UvRect, rings: readonly (readonly Point[])[]): Record<Side, [number, number][]> {
    const walls = wallIntervals(z, rings);
    const out = {} as Record<Side, [number, number][]>;
    for (const side of SIDE_LIST) {
        const [a, b] = sideSegment(z, side), along = side[0] === 'v' ? 0 : 1;
        let open: [number, number][] = [[a[along]!, b[along]!]];
        for (const [w0, w1] of walls[side]) open = open.flatMap(([s0, s1]) =>
            ([[s0, Math.min(s1, w0)], [Math.max(s0, w1), s1]] as [number, number][]).filter(([p, q]) => q - p > 1e-4));
        out[side] = open;
    }
    return out;
}

/** Inset of a rectangle on the given sides only. */
function inset(r: UvRect, by: Partial<Record<Side, number>>): UvRect {
    const u0 = by.u0 ?? 0, u1 = by.u1 ?? 0, v0 = by.v0 ?? 0, v1 = by.v1 ?? 0;
    return { u: r.u + u0, v: r.v + v0, lu: r.lu - u0 - u1, lv: r.lv - v0 - v1 };
}

/** The exposed side of the zone its stair point lies nearest to. */
function stairSide(z: UvRect, at: Point, sides: readonly Side[]): Side | undefined {
    const d = (side: Side) => side === 'u0' ? Math.abs(at[0] - z.u) : side === 'u1' ? Math.abs(at[0] - z.u - z.lu)
        : side === 'v0' ? Math.abs(at[1] - z.v) : Math.abs(at[1] - z.v - z.lv);
    return [...sides].sort((a, b) => d(a) - d(b))[0];
}

const edgeAt = (side: Side, z: UvRect, s0: number, s1: number, y: number, offset = 0): LevelEdge => {
    const out = SIDE_OUT[side];
    const c = side === 'u0' ? z.u + offset : side === 'u1' ? z.u + z.lu - offset : side === 'v0' ? z.v + offset : z.v + z.lv - offset;
    return side[0] === 'v' ? { a: [s0, c], b: [s1, c], y, out } : { a: [c, s0], b: [c, s1], y, out };
};

/** The solid slabs, nosings and guards of one zone, in uv, before clipping to a floor
 *  rectangle. `rings` are the room's outline and holes: sides lying on them are walls. */
export function levelPlan(zone: LevelZone, rings: readonly (readonly Point[])[]): LevelPlan {
    const plan: LevelPlan = { slabs: [], nosings: [], guards: [] };
    if (zone.delta > -LEVEL_MIN && zone.delta < LEVEL_MIN) return plan;
    if (zone.delta < 0) return sunkenPlan(zone, rings, plan);
    const z = zoneRect(zone), n = riserCount(zone.delta), rise = Math.abs(zone.delta) / n;
    const open = exposedSides(z, rings);
    const sides = SIDE_LIST.filter(side => open[side].length);
    // Steps never eat more than half the zone across.
    const going = Math.min(TREAD, ...sides.map(side => (side[0] === 'u' ? z.lu : z.lv) / (2 * Math.max(1, n - 1) + 1)));
    if (zone.edge === 'guard') {
        const at = zone.stair?.at ?? [z.u + z.lu / 2, z.v];
        const side = stairSide(z, at, sides);
        const runAlong = side && side[0] === 'v' ? 0 : 1;
        const lo = side ? (runAlong === 0 ? z.u : z.v) : 0, length = side ? (runAlong === 0 ? z.lu : z.lv) : 0;
        const width = side ? Math.min(zone.stair?.width ?? 1.2, FLIGHT_MAX, length) : 0;
        const c = Math.min(Math.max(at[runAlong]!, lo + width / 2), lo + length - width / 2);
        const depth = (n - 1) * going;
        // The flight's notch: its width along the edge, (n - 1) goings deep into the zone.
        const notch: UvRect | undefined = side && n > 1 ? (runAlong === 0
            ? { u: c - width / 2, v: side === 'v0' ? z.v : z.v + z.lv - depth, lu: width, lv: depth }
            : { u: side === 'u0' ? z.u : z.u + z.lu - depth, v: c - width / 2, lu: depth, lv: width }) : undefined;
        for (const part of subtractAll(z, notch ? [notch] : [])) plan.slabs.push({ rect: part, top: zone.delta, bottom: 0, module: 'platform' });
        if (side) {
            for (let k = 1; k < n; k++) {
                // Step k (top k·rise) covers the notch from (k - 1) goings off the edge inward.
                const off = (k - 1) * going, rect = notch ? inset(notch, { [side]: off }) : undefined;
                if (rect && rect.lu > EPS && rect.lv > EPS) plan.slabs.push({ rect, top: k * rise, bottom: 0, module: 'tread' });
                plan.nosings.push(edgeAt(side, z, c - width / 2, c + width / 2, k * rise, off));
            }
            plan.nosings.push(edgeAt(side, z, c - width / 2, c + width / 2, zone.delta, depth));
        }
        for (const s of sides) for (const [s0, s1] of open[s]) {
            // The guard runs along every drop, broken by the flight's mouth.
            const runs: [number, number][] = s === side ? [[s0, Math.min(s1, c - width / 2)], [Math.max(s0, c + width / 2), s1]] : [[s0, s1]];
            for (const [p, q] of runs) if (q - p > .1) plan.guards.push(edgeAt(s, z, p, q, zone.delta));
        }
        // The notch's cheeks inside the platform are drops too.
        if (side && notch) for (const cheek of (runAlong === 0 ? ['u0', 'u1'] : ['v0', 'v1']) as Side[]) {
            const [a, b] = sideSegment(notch, cheek);
            plan.guards.push({ a, b, y: zone.delta, out: SIDE_OUT[cheek].map(x => -x) as Point });
        }
        return plan;
    }
    {
        // Stepped all along: slab k (top k·rise) inset (k - 1) goings on every exposed side,
        // the lowest spanning the whole zone and the platform the innermost.
        for (let k = 1; k <= n; k++) {
            const off = (k - 1) * going, by: Partial<Record<Side, number>> = {};
            for (const s of sides) by[s] = off;
            const rect = inset(z, by);
            if (rect.lu <= EPS || rect.lv <= EPS) continue;
            plan.slabs.push({ rect, top: k * rise, bottom: 0, module: k === n ? 'platform' : 'tread' });
            for (const s of sides) for (const [s0, s1] of open[s]) {
                // Along this side, the step edge spans the slab's own extent.
                const lo = s[0] === 'v' ? rect.u : rect.v, hi = lo + (s[0] === 'v' ? rect.lu : rect.lv);
                const p = Math.max(s0, lo), q = Math.min(s1, hi);
                if (q - p > .05) plan.nosings.push(edgeAt(s, z, p, q, k * rise, off));
            }
        }
        return plan;
    }
    return plan;
}

/** A sunken zone (a lounge pit): a thin tray at delta over the whole zone, which alone
 *  stands at y = 0 (so the zone counts as walking floor and no leftover slab covers it),
 *  then steps back up to Y0. `step`: nested rings along every exposed side; `guard`: one
 *  flight at the zone's stair and a glass guard on the floor above along the other drops. */
function sunkenPlan(zone: LevelZone, rings: readonly (readonly Point[])[], plan: LevelPlan): LevelPlan {
    const depth = Math.min(-zone.delta, PIT_MAX), z = zoneRect(zone), n = riserCount(depth), rise = depth / n;
    const open = exposedSides(z, rings), sides = SIDE_LIST.filter(side => open[side].length);
    const going = Math.min(TREAD, ...sides.map(side => (side[0] === 'u' ? z.lu : z.lv) / (2 * Math.max(1, n - 1) + 1)));
    plan.slabs.push({ rect: z, top: -depth, bottom: -depth, module: 'sunken' });
    // A 30 mm curb lines every side of the pit from its floor up to Y0 (the step's riser,
    // the wall's missing foot, the drop under a guard).
    for (const side of SIDE_LIST) {
        const r = side === 'u0' ? { u: z.u, v: z.v, lu: CURB, lv: z.lv } : side === 'u1' ? { u: z.u + z.lu - CURB, v: z.v, lu: CURB, lv: z.lv }
            : side === 'v0' ? { u: z.u, v: z.v, lu: z.lu, lv: CURB } : { u: z.u, v: z.v + z.lv - CURB, lu: z.lu, lv: CURB };
        plan.slabs.push({ rect: r, top: 0, bottom: -depth, module: 'tread' });
    }
    const inward = (side: Side) => SIDE_OUT[side].map(x => -x) as Point;
    if (zone.edge === 'guard') {
        const at = zone.stair?.at ?? [z.u + z.lu / 2, z.v];
        const side = stairSide(z, at, sides);
        if (!side) return plan;
        const runAlong = side[0] === 'v' ? 0 : 1;
        const lo = runAlong === 0 ? z.u : z.v, length = runAlong === 0 ? z.lu : z.lv;
        const width = Math.min(zone.stair?.width ?? 1.2, FLIGHT_MAX, length);
        const c = Math.min(Math.max(at[runAlong]!, lo + width / 2), lo + length - width / 2);
        for (let k = 1; k < n; k++) {
            // Step k (top -depth + k·rise) runs from the zone edge (n - k) goings inward.
            const reach = (n - k) * going;
            const rect: UvRect = runAlong === 0
                ? { u: c - width / 2, v: side === 'v0' ? z.v : z.v + z.lv - reach, lu: width, lv: reach }
                : { u: side === 'u0' ? z.u : z.u + z.lu - reach, v: c - width / 2, lu: reach, lv: width };
            plan.slabs.push({ rect, top: -depth + k * rise, bottom: -depth, module: 'tread' });
        }
        for (let k = 1; k <= n; k++)
            plan.nosings.push({ ...edgeAt(side, z, c - width / 2, c + width / 2, -depth + k * rise, (n - k) * going), out: inward(side) });
        for (const s of sides) for (const [s0, s1] of open[s]) {
            const runs: [number, number][] = s === side ? [[s0, Math.min(s1, c - width / 2)], [Math.max(s0, c + width / 2), s1]] : [[s0, s1]];
            // The guard stands on the floor above, just outside the drop.
            for (const [p, q] of runs) if (q - p > .1) plan.guards.push({ ...edgeAt(s, z, p, q, 0, -.06), out: inward(s) });
        }
        return plan;
    }
    for (let k = 1; k < n; k++) {
        const by: Partial<Record<Side, number>> = {};
        for (const s of sides) by[s] = (n - k) * going;
        const inner = inset(z, by);
        for (const part of subtractAll(z, inner.lu > EPS && inner.lv > EPS ? [inner] : []))
            plan.slabs.push({ rect: part, top: -depth + k * rise, bottom: -depth, module: 'tread' });
    }
    for (let k = 1; k <= n; k++) for (const s of sides) for (const [s0, s1] of open[s])
        plan.nosings.push({ ...edgeAt(s, z, s0, s1, -depth + k * rise, (n - k) * going), out: inward(s) });
    return plan;
}

const clipRect = (a: UvRect, b: UvRect): UvRect | undefined => {
    const u0 = Math.max(a.u, b.u), u1 = Math.min(a.u + a.lu, b.u + b.lu), v0 = Math.max(a.v, b.v), v1 = Math.min(a.v + a.lv, b.v + b.lv);
    return u1 - u0 > 1e-4 && v1 - v0 > 1e-4 ? { u: u0, v: v0, lu: u1 - u0, lv: v1 - v0 } : undefined;
};

/** The part of an edge a floor rectangle owns: its cross coordinate in [low, high) of the
 *  rectangle (the high side when it is the zone's far wall-free edge), its run clipped. */
function clipEdge(e: LevelEdge, r: UvRect): LevelEdge | undefined {
    const alongU = Math.abs(e.a[1] - e.b[1]) < EPS;
    const c = alongU ? e.a[1] : e.a[0], lo = alongU ? r.v : r.u, hi = lo + (alongU ? r.lv : r.lu);
    if (c < lo - 1e-4 || c > hi + 1e-4) return undefined;
    // An edge on the line between two rectangles belongs to the one it faces out of.
    const out = alongU ? e.out[1] : e.out[0];
    if (Math.abs(c - hi) < 1e-4 && out < 0) return undefined;
    if (Math.abs(c - lo) < 1e-4 && out > 0) return undefined;
    const s0 = Math.max(Math.min(alongU ? e.a[0] : e.a[1], alongU ? e.b[0] : e.b[1]), alongU ? r.u : r.v);
    const s1 = Math.min(Math.max(alongU ? e.a[0] : e.a[1], alongU ? e.b[0] : e.b[1]), alongU ? r.u + r.lu : r.v + r.lv);
    if (s1 - s0 < .05) return undefined;
    return alongU ? { ...e, a: [s0, c], b: [s1, c] } : { ...e, a: [c, s0], b: [c, s1] };
}

/** Platforms, treads, nosings and guards of the room's level zones inside
 *  one floor rectangle, in style `sid`. Returns the records of lit nosings. */
export function placeLevels(builder: PlacementBuilder, sid: string, room: SurfaceRoom, rect: UvRect, frame: Frame): LightFixture[] {
    const lights: LightFixture[] = [];
    const look = PROFILES.has(sid) ? sid : SHARED_LEVEL_LOOK;
    const ids = levelIds(look), lit = PROFILES.get(look)?.lit, rings = [room.polygon, ...(room.holes ?? [])];
    const yaw = -frame.angleDeg * Math.PI / 180;
    for (const zone of active(room.levels ?? [])) {
        const plan = levelPlan(zone, rings);
        for (const slab of plan.slabs) {
            const part = clipRect(slab.rect, rect);
            if (!part) continue;
            const [x, z] = uvToWorld([part.u + part.lu / 2, part.v + part.lv / 2], frame);
            // The tray is authored hanging under y = 0 (its top at -0.9 of its scale): it
            // stands at y = 0 stretched to its depth; every other slab stands on its bottom.
            if (slab.module === 'sunken') builder.module(ids.sunken, room.id, [x, 0, z], [part.lu / CELL, -slab.top / .9, part.lv / CELL], yaw);
            else builder.module(ids[slab.module], room.id, [x, slab.bottom, z], [part.lu / CELL, (slab.top - slab.bottom) / CELL, part.lv / CELL], yaw);
        }
        for (const edge of plan.nosings) {
            const e = clipEdge(edge, rect);
            if (!e) continue;
            const length = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
            const [x, z] = uvToWorld([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], frame), rotation = facingRotation(e.out, frame);
            const piece = builder.module(lit ? ids.lens : ids.nosing, room.id, [x, e.y, z], [length / CELL, 1, 1], rotation);
            if (lit) lights.push({
                id: piece.id, kind: 'cove', room: room.id,
                position: [x, e.y + room.elevation - .02, z].map(v => Math.round(v * 1000) / 1000) as [number, number, number],
                length: Math.round(length * 1000) / 1000,
                angleDeg: Math.round((((-rotation * 180 / Math.PI) % 360 + 360) % 360) * 100) / 100,
                axis: [Math.cos(rotation), 0, -Math.sin(rotation)], direction: [0, -1, 0],
                intensity: Math.round(length * lit.lumensPerMetre), colorTemperatureK: lit.kelvin,
                ...(lit.color ? { color: [...lit.color] as [number, number, number] } : {}),
                range: 1.5, beamDeg: 150, diffuse: .9, facing: 'down',
            });
        }
        for (const edge of plan.guards) {
            const e = clipEdge(edge, rect);
            if (!e) continue;
            const length = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
            // The glass stands just inside the drop, on the higher floor.
            const mid: Point = [(e.a[0] + e.b[0]) / 2 - e.out[0] * .03, (e.a[1] + e.b[1]) / 2 - e.out[1] * .03];
            const [x, z] = uvToWorld(mid, frame);
            builder.module(ids.guard, room.id, [x, e.y, z], [length / CELL, 1, 1], facingRotation(e.out, frame));
        }
    }
    return lights;
}

/** The level modules of one style: slabs as 0.5 m cubes on y = 0 (top skin, riser sides),
 *  a flush 30 mm nosing on the step's front edge (local +z points off the step), a lit
 *  strip variant, and the glass guard, 0.5 m long and 1 m high, centred on its line.
 *  Registers the look, so `placeLevels` finds it by style id. */
export function levelRecipes(sid: string, profile: LevelProfile): RecipeSet {
    PROFILES.set(sid, profile);
    const ids = levelIds(sid);
    const slab = (k: Kit) => {
        k.cbox(profile.riser, [0, 0, 0], [CELL, CELL - .012, CELL], undefined, ['north', 'south', 'east', 'west']);
        k.cbox(profile.top, [0, CELL - .012, 0], [CELL, .012, CELL], undefined, ['top', 'north', 'south', 'east', 'west']);
    };
    return add => {
        add(ids.platform, slab);
        add(ids.tread, slab);
        // Sunken tray: a slab from y = -1 to -0.9, its top skin the walking floor.
        add(ids.sunken, k => {
            k.cbox(profile.riser, [0, -1, 0], [CELL, .088, CELL], undefined, ['bottom', 'north', 'south', 'east', 'west']);
            k.cbox(profile.top, [0, -.912, 0], [CELL, .012, CELL], undefined, ['top']);
        });
        add(ids.nosing, k => k.box(profile.nosing, [-CELL / 2, -.011, -.03], [CELL, .012, .031], undefined, ['top', 'south']));
        add(ids.lens, k => {
            k.box(profile.nosing, [-CELL / 2, -.011, -.03], [CELL, .012, .031], undefined, ['top']);
            k.box(lensSlot({ color: profile.lit?.color, kelvin: profile.lit?.kelvin ?? 3000 }), [-CELL / 2, -.04, -.004], [CELL, .026, .005], undefined, ['south']);
        });
        add(ids.guard, k => {
            k.cbox(profile.guard.glass, [0, .03, 0], [CELL, GUARD_HEIGHT - .06, .012]);
            k.cbox(profile.guard.cap, [0, GUARD_HEIGHT - .03, 0], [CELL, .03, .035]);
            k.cbox(profile.guard.cap, [0, 0, 0], [CELL, .03, .035]);
        });
    };
}

/** The sides of a bulkhead hung under a pit of the storey above (`placements/plenum.ts`):
 *  a fascia of the room's level look, `drop` deep, along every side of `bulkhead.rect` that
 *  faces the room, from the room's ceiling `ceilingY` down. */
export function placeBulkheadSides(builder: PlacementBuilder, room: SurfaceRoom, bulkhead: { rect: UvRect; drop: number }, ceilingY: number, frame: Frame): void {
    const look = room.style && PROFILES.has(room.style) ? room.style : SHARED_LEVEL_LOOK;
    const id = levelIds(look).nosing, z = bulkhead.rect, open = exposedSides(z, [room.polygon, ...(room.holes ?? [])]);
    // the nosing strip is 12 mm tall with its top 1 mm above its origin
    const scaleY = bulkhead.drop / .012;
    for (const side of SIDE_LIST) for (const [s0, s1] of open[side]) {
        if (s1 - s0 < .05) continue;
        const e = edgeAt(side, z, s0, s1, 0);
        const [x, zz] = uvToWorld([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2], frame);
        builder.module(id, room.id, [x, ceilingY - bulkhead.drop / 12, zz], [(s1 - s0) / CELL, scaleY, 1], facingRotation(e.out, frame));
    }
}
