import type { Point } from '../../core/geom.js';
import type { LightFixture } from '../../core/types.js';
import type { Frame, UvRect } from '../../layout/uv.js';
import { uvToWorld, worldToUv } from '../../layout/uv.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { CeilingSystem, LitJoint, SurfaceRoom } from './types.js';
import {
    bandRect, facingRotation, gridId, gridPieces, inward, lay, subtractAll, wallBands, wallIntervals, type Band, type Side,
} from './surface-grid.js';

/** Ceilings: a backing that closes every joint, stepped rings hanging below the datum along
 *  the real walls, a perimeter reveal band inside them, an optional coffer rising into the
 *  void, then a cell grid of baked blocks (rows, columns or single cells where a block is
 *  clipped) phased to the building grid or the room's centre, never to the rectangle
 *  fragment, so an L-shaped room keeps one grid. Every lens is a `ceiling-cove-*` module
 *  with a record of the same id; planned records follow the room's ceiling drop and planned
 *  spots move to the centre of their cell. */

const CELL = .5;
/** Lowest a stepped ring may hang: a door head (2.5 m) plus its casing (0.08 m). */
export const MIN_STEP_BOTTOM = 2.58;
/** The void a coffer leaves under the slab above. */
const SOFFIT_CLEAR = .15;
/** Least free ceiling between a coffer and a wall when the system has no perimeter band. */
const COFFER_MARGIN = .5;
/** Planned spots hang this far under the finished ceiling (layout/lighting.ts). */
const SPOT_BELOW = .04;
/** Planned records already moved: one room's rectangles share them. */
const moved = new WeakSet<LightFixture>();

/** Where the grid counts from: the building grid origin, or, room-centred, cells symmetric
 *  about the room's centre (a joint or a cell on the centre line, whichever leaves the
 *  narrower cut cell at the reveal, which then takes it) with blocks counted from the first
 *  whole cell inside the reveal, so a room spends as few pieces as its cells allow. */
export function ceilingOrigin(spec: CeilingSystem, room: SurfaceRoom): Point {
    if (spec.grid.phase === 'grid') return room.gridOrigin;
    const b = room.bounds, depth = (spec.steps?.reduce((m, s) => Math.max(m, s.inset), 0) ?? 0) + (spec.perimeter?.width ?? 0);
    const axis = (lo: number, length: number, pitch: number): number => {
        const centre = lo + length / 2, edge = lo + depth;
        const cut = (o: number) => { const k = Math.ceil((edge - o) / pitch - 1e-9); return o + k * pitch - edge; };
        const [a, c] = [centre, centre + pitch / 2];
        const o = cut(a) <= cut(c) ? a : c;
        return edge + cut(o);
    };
    return [axis(b.u, b.lu, spec.grid.pitch[0]), axis(b.v, b.lv, spec.grid.pitch[1])];
}

/** The coffer of a room, centred on its bounds, at least one perimeter band (or half a
 *  metre) from every wall, or none when the room is too small for it. */
export function cofferRect(spec: CeilingSystem, room: SurfaceRoom): UvRect | undefined {
    if (!spec.coffers) return undefined;
    const margin = (spec.steps?.reduce((m, s) => Math.max(m, s.inset), 0) ?? 0) + (spec.perimeter?.width ?? COFFER_MARGIN);
    const b = room.bounds, [w, d] = spec.coffers.size;
    if (w > b.lu - 2 * margin + 1e-6 || d > b.lv - 2 * margin + 1e-6) return undefined;
    return { u: b.u + (b.lu - w) / 2, v: b.v + (b.lv - d) / 2, lu: w, lv: d };
}

const inside = (a: UvRect, b: UvRect) => a.u >= b.u - 1e-6 && a.v >= b.v - 1e-6 && a.u + a.lu <= b.u + b.lu + 1e-6 && a.v + a.lv <= b.v + b.lv + 1e-6;

/** One ceiling rectangle of a room in a ceiling system. `y` is the room's own ceiling
 *  (storey ceiling minus its ceilingDrop). Returns the lens records it placed. */
export function placeCeilingSystem(builder: PlacementBuilder, spec: CeilingSystem, room: SurfaceRoom, rect: UvRect, y: number, frame: Frame,
    planned: LightFixture[]): LightFixture[] {
    if (rect.lu < 1e-3 || rect.lv < 1e-3) return [];
    const lights: LightFixture[] = [], cuts: UvRect[] = [];
    const walls = wallIntervals(rect, [room.polygon, ...(room.holes ?? [])]);
    const stair = room.id.startsWith('stair-');
    const coffer = stair ? undefined : cofferRect(spec, room);
    const rise = spec.coffers ? Math.min(spec.coffers.rise, room.soffitY - SOFFIT_CLEAR - y) : 0;
    const hollow = coffer && rise > .02 && inside(coffer, rect) ? coffer : undefined;
    for (const part of hollow ? subtractAll(rect, [hollow]) : [rect]) lay(builder, spec.backing, room.id, part, y, frame, [part.lu / CELL, part.lv / CELL]);
    // Stepped rings hang below the datum, outermost first; never in a stairwell, never
    // below a door head's reach.
    let offset = 0;
    const steps = stair ? [] : [...(spec.steps ?? [])].sort((a, b) => a.inset - b.inset);
    const dropOf = (k: number) => Math.min(steps[k]!.drop, y - MIN_STEP_BOTTOM);
    for (const [k, step] of steps.entries()) {
        const width = step.inset - offset, drop = dropOf(k);
        if (width < .05 || drop < .02) break;
        for (const band of wallBands(rect, walls, offset, width).bands) {
            const r = bandRect(rect, band);
            cuts.push(r);
            lay(builder, `${step.fascia}-soffit`, room.id, r, y - drop, frame, [r.lu / CELL, r.lv / CELL]);
        }
        // The fascia closes the ring's inner edge from its soffit up to the next level in.
        const next = k + 1 < steps.length && steps[k + 1]!.inset - step.inset >= .05 ? Math.max(0, dropOf(k + 1)) : 0;
        const face = drop - next;
        if (face > .01) for (const edge of wallBands(rect, walls, step.inset, 0).bands) {
            edgePiece(builder, step.fascia, room.id, rect, edge, y - drop, frame, [(edge.b - edge.a) / CELL, face / step.drop, 1]);
            if (step.lens) lights.push(...lens(builder, step.lens, room, rect, edge, y - drop, frame));
        }
        offset = step.inset;
    }
    // The perimeter reveal along the walls, inside any rings. On a room-centred grid the band
    // also takes a cut cell narrower than half a cell, so whole panels meet the reveal.
    const origin = ceilingOrigin(spec, room);
    const perimeter = stair ? undefined : spec.perimeter;
    if (perimeter) {
        const widths = revealWidths(spec, rect, offset + perimeter.width, origin);
        const { bands } = wallBands(rect, walls, offset, widths);
        // The v-side bands own the corner squares, so one straight piece runs corner to corner.
        // A reveal in the backing's own module is the backing left bare: nothing to place.
        for (const band of bands) {
            cuts.push(bandRect(rect, band));
            if (perimeter.edge !== spec.backing)
                edgePiece(builder, perimeter.edge, room.id, rect, band, y, frame, [(band.b - band.a) / CELL, 1, band.width / perimeter.width]);
        }
        if (perimeter.lens) for (const band of bands)
            lights.push(...lens(builder, perimeter.lens, room, rect, { ...band, offset: band.offset + band.width, width: 0 }, y, frame));
    }
    const grid = { pitch: spec.grid.pitch, cells: spec.grid.blockCells, joint: spec.grid.joint };
    const levels: { region: UvRect; y: number }[] = subtractAll(rect, hollow ? [...cuts, hollow] : cuts).map(region => ({ region, y }));
    if (hollow) {
        levels.push({ region: hollow, y: y + rise });
        lay(builder, spec.backing, room.id, hollow, y + rise, frame, [hollow.lu / CELL, hollow.lv / CELL]);
        lights.push(...cofferSides(builder, spec, room, hollow, y, rise, frame));
    }
    // The grid fills what the rings, the reveal and the coffer leave.
    for (const { region, y: at } of levels) for (const piece of gridPieces(region, origin, grid)) {
        const fields = spec.fields;
        if (fields && piece.whole && mod(piece.block[0] + piece.block[1], fields.every) === 0) {
            const placement = lay(builder, fields.module, room.id, piece.rect, at, frame, [1, 1]);
            lights.push(fieldRecord(placement.id, room, piece.rect, at, frame, fields.lumens));
            continue;
        }
        lay(builder, gridId(spec.grid.block, spec.grid.blockCells, piece.cells), room.id, piece.rect, at, frame, piece.scale);
    }
    moveRecords(spec, room, rect, y, frame, origin, planned);
    return lights;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Reveal depth per side: the band's own width, plus, on a room-centred grid, the cut cell
 *  between the band and the next grid line when it is narrower than half a cell. */
function revealWidths(spec: CeilingSystem, rect: UvRect, depth: number, origin: Point): Record<Side, number> {
    const w = spec.perimeter!.width, out = { u0: w, u1: w, v0: w, v1: w } as Record<Side, number>;
    if (spec.grid.phase !== 'room-centre') return out;
    for (const side of ['u0', 'u1', 'v0', 'v1'] as const) {
        const axis = side[0] === 'u' ? 0 : 1, pitch = spec.grid.pitch[axis], o = origin[axis]!;
        const low = side.endsWith('0'), wall = axis === 0 ? (low ? rect.u : rect.u + rect.lu) : (low ? rect.v : rect.v + rect.lv);
        const edge = wall + (low ? depth : -depth), k = (edge - o) / pitch;
        const next = o + (low ? Math.ceil(k - 1e-9) : Math.floor(k + 1e-9)) * pitch, cut = Math.abs(next - edge);
        if (cut > 1e-6 && cut < pitch / 2) out[side] = w + cut;
    }
    return out;
}

/** The four sides of a coffer: fascias rising from the ceiling to the coffer's floor, facing
 *  its centre, unscaled corner posts, and a lens along each side at the top. */
function cofferSides(builder: PlacementBuilder, spec: CeilingSystem, room: SurfaceRoom, c: UvRect, y: number, rise: number, frame: Frame): LightFixture[] {
    const coffers = spec.coffers!, lights: LightFixture[] = [], scale = rise / coffers.rise;
    // Seen from inside the coffer its sides are walls of a small room: reuse the band logic
    // on the coffer rectangle with every side a wall.
    const ring: Point[] = [[c.u, c.v], [c.u + c.lu, c.v], [c.u + c.lu, c.v + c.lv], [c.u, c.v + c.lv]];
    const walls = wallIntervals(c, [ring]);
    for (const edge of wallBands(c, walls, 0, 0).bands) {
        edgePiece(builder, coffers.edge, room.id, c, edge, y, frame, [(edge.b - edge.a) / CELL, scale, 1]);
        if (coffers.lens) lights.push(...lens(builder, coffers.lens, room, c, edge, y + rise, frame));
    }
    for (const u of ['u0', 'u1'] as const) for (const v of ['v0', 'v1'] as const) {
        const at: Point = [u === 'u0' ? c.u : c.u + c.lu, v === 'v0' ? c.v : c.v + c.lv];
        cornerPiece(builder, coffers.corner, room.id, at, inward(u), inward(v), y, frame, [1, scale, 1]);
    }
    return lights;
}

/** The uv point of a band's wall-side line at `t` along it. */
function linePoint(rect: UvRect, band: Band, t: number): Point {
    switch (band.side) {
        case 'v0': return [t, rect.v + band.offset];
        case 'v1': return [t, rect.v + rect.lv - band.offset];
        case 'u0': return [rect.u + band.offset, t];
        case 'u1': return [rect.u + rect.lu - band.offset, t];
    }
}

/** A fixed-section piece standing on a band's wall-side line, local +z into the room,
 *  stretched along the band. */
function edgePiece(builder: PlacementBuilder, module: string, room: string, rect: UvRect, band: Band, y: number, frame: Frame,
    scale: [number, number, number]) {
    const [x, z] = uvToWorld(linePoint(rect, band, (band.a + band.b) / 2), frame);
    return builder.module(module, room, [x, y, z], scale, facingRotation(inward(band.side), frame));
}

/** A corner piece at `at`, symmetric about its diagonal, reaching into the room along both
 *  inward directions. A rotation can turn local +z and +x onto only one pairing of the two
 *  directions; the piece is symmetric, so either pairing reads the same. */
function cornerPiece(builder: PlacementBuilder, module: string, room: string, at: Point, du: Point, dv: Point, y: number, frame: Frame,
    scale: [number, number, number] = [1, 1, 1]) {
    const xOf = (d: Point): Point => [d[1], -d[0]];
    const z = Math.abs(xOf(du)[0] - dv[0]) < 1e-9 && Math.abs(xOf(du)[1] - dv[1]) < 1e-9 ? du : dv;
    const [x, w] = uvToWorld(at, frame);
    return builder.module(module, room, [x, y, w], scale, facingRotation(z, frame));
}

/** A lit lens along a band edge at `y` (plus the joint's own offset), with its cove record. */
function lens(builder: PlacementBuilder, joint: LitJoint, room: SurfaceRoom, rect: UvRect, band: Band, y: number, frame: Frame): LightFixture[] {
    const length = band.b - band.a - .04;
    if (length < .3) return [];
    const n = inward(band.side), p = linePoint(rect, band, (band.a + band.b) / 2);
    const [x, z] = uvToWorld([p[0] + n[0] * joint.proud, p[1] + n[1] * joint.proud], frame);
    const ly = y + (typeof joint.y === 'number' ? joint.y : 0), rotation = facingRotation(n, frame);
    const placement = builder.module(joint.module, room.id, [x, ly, z], [length / CELL, 1, 1], rotation);
    return [{
        id: placement.id, kind: 'cove', room: room.id,
        position: [x, ly + room.elevation, z].map(v => Math.round(v * 1000) / 1000) as [number, number, number],
        length: Math.round(length * 1000) / 1000,
        angleDeg: Math.round(((-rotation * 180 / Math.PI) % 360 + 360) % 360 * 100) / 100,
        axis: [Math.cos(rotation), 0, -Math.sin(rotation)], direction: [0, joint.facing === 'up' ? 1 : -1, 0],
        intensity: Math.round(length * joint.lumensPerMetre), colorTemperatureK: joint.kelvin,
        ...(joint.color ? { color: [...joint.color] as [number, number, number] } : {}),
        range: 2.5, beamDeg: 170, diffuse: .9, facing: joint.facing,
    }];
}

/** A luminous field: a ceiling fixture the room's balance sets, with the placement's id. */
function fieldRecord(id: string, room: SurfaceRoom, rect: UvRect, y: number, frame: Frame, lumens: number): LightFixture {
    const [x, z] = uvToWorld([rect.u + rect.lu / 2, rect.v + rect.lv / 2], frame);
    return {
        id, kind: 'strip', room: room.id,
        position: [x, y + room.elevation - .01, z].map(v => Math.round(v * 1000) / 1000) as [number, number, number],
        length: Math.round(rect.lu * 1000) / 1000, angleDeg: Math.round((((frame.angleDeg % 360) + 360) % 360) * 100) / 100,
        axis: [frame.cos, 0, frame.sin], direction: [0, -1, 0],
        intensity: lumens, colorTemperatureK: 3000, range: 5, beamDeg: 170, diffuse: .95, facing: 'down',
    };
}

/** Whether a ceiling system has already seated this planned record under its own ceiling,
 *  its room's drop taken: the record must not be lowered again. */
export function seatedUnderCeiling(light: LightFixture): boolean {
    return moved.has(light);
}

/** Planned records of this room over this rectangle: each follows the room's ceiling drop
 *  once, and with `snapSpots` a spot moves to the centre of the cell it hangs in. */
function moveRecords(spec: CeilingSystem, room: SurfaceRoom, rect: UvRect, y: number, frame: Frame, origin: Point, planned: LightFixture[]): void {
    const drop = room.ceilingY - y, [pu, pv] = spec.grid.pitch;
    for (const light of planned) {
        if (light.room !== room.id || light.furniture || moved.has(light)) continue;
        const [u, v] = worldToUv([light.position[0], light.position[2]], frame);
        if (u < rect.u - 1e-6 || u > rect.u + rect.lu + 1e-6 || v < rect.v - 1e-6 || v > rect.v + rect.lv + 1e-6) continue;
        moved.add(light);
        if (Math.abs(drop) > 1e-6) light.position = [light.position[0], Math.round((light.position[1] - drop) * 1000) / 1000, light.position[2]];
        if (!spec.snapSpots || light.kind !== 'spot') continue;
        const cu = origin[0] + (Math.floor((u - origin[0]) / pu) + .5) * pu, cv = origin[1] + (Math.floor((v - origin[1]) / pv) + .5) * pv;
        // A cell clipped by a wall keeps its spot inside the rectangle.
        const su = Math.min(Math.max(cu, rect.u + .15), rect.u + rect.lu - .15), sv = Math.min(Math.max(cv, rect.v + .15), rect.v + rect.lv - .15);
        const [x, z] = uvToWorld([su, sv], frame);
        light.position = [Math.round(x * 1000) / 1000, Math.round((room.elevation + y - SPOT_BELOW) * 1000) / 1000, Math.round(z * 1000) / 1000];
    }
}

export type { Side };
