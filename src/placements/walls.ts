import { polygonBounds } from '../core/geom.js';
import type { Point } from '../core/geom.js';
import type { BlueprintFloor, FloorInterior, InteriorRequest, LightFixture, Opening, RoomKind } from '../core/types.js';
import type { CorePlan } from '../layout/core-plan.js';
import type { UvFloorData } from '../layout/plan-floor.js';
import { doorUvPoint } from '../layout/plan-floor.js';
import type { PlanRoom } from '../layout/plan-types.js';
import { Facade } from '../layout/openings.js';
import { constructionPlate, facadeDepth } from '../layout/shell.js';
import type { Frame } from '../layout/uv.js';
import { uvToWorld, worldToUv } from '../layout/uv.js';
import { edgeFrame, edgePoint } from '../geometry/shell-fit.js';
import { canonicalHoles, doorHeadHeight, roomSegments, reserveFacadeEnds, type WallHole } from '../geometry/walls.js';
import { stairEntryHole } from '../geometry/stairs.js';
import { elevatorDoorHole } from '../geometry/core-geo.js';
import type { PlacementBuilder } from './builder.js';
import { GLAZED_ROOMS, type RoomFinish } from './finish.js';
import { shellOwnsFacade } from '../architecture/recipes.js';

/** Fixed frame piece: corners are one cell, edges one cell wide. */
const PIECE = 0.5;
/** The shortest run and height a nine-slice frame fits; anything less is a plain field. */
const MIN_FRAME = 3 * PIECE;
/** A partition casing stands just proud of the frames on both faces. */
const CASING_MEMBER = 0.08;
/** A light line stops this far short of the corners. */
const LINE_GAP = 0.02;
/** The bar stands proud of the frame face, off the partition line. */
const LINE_OFFSET = 0.09;
/** A lined boundary run clears this much beside every opening it passes. */
const OPENING_MARGIN = 0.06;
const LINE_LUMENS_PER_METRE = 55;

/** Public rooms an office's glazed partition looks onto. */
const GLAZED_ONTO: ReadonlySet<RoomKind> = new Set(["corridor", "elevator_lobby", "concourse", "office_open", "reception", "lounge"]);

interface Run { a: number; b: number; room: string; kind: RoomKind; side: 1 | -1; draw: boolean }
interface Line { axis: 'H' | 'V'; c: number; runs: Run[]; holes: WallHole[]; boundary: boolean }

/** Every partition face of a floor: nine-slice panel frames with light lines where a run
 *  fits one, plain fields elsewhere, glass fields between an office and the public space
 *  it looks onto. Returns the light records of the lines it built. */
export function walls(
    builder: PlacementBuilder, floor: FloorInterior, uv: UvFloorData, core: CorePlan, bp: BlueprintFloor,
    request: InteriorRequest, finishOf: (room: string, kind: RoomKind) => RoomFinish, tag: string,
    shared: readonly BlueprintFloor[] = [bp],
): LightFixture[] {
    let lineCount = 0;
    const nextLineId = () => `${tag}-wl${lineCount++}`;
    const frame = core.frame, depth = facadeDepth(request.blueprint.facade), facade = new Facade(bp, request.blueprint.facade);
    const buildable = constructionPlate(bp, frame, depth), plate = polygonBounds(buildable);
    const height = floor.ceilingElevation - floor.elevation;
    const lines = new Map<string, Line>();
    const line = (axis: 'H' | 'V', c: number, boundary = false): Line => {
        const key = `${boundary ? 'B' : 'P'}:${axis}:${c.toFixed(6)}`;
        let value = lines.get(key);
        if (!value) {
            value = { axis, c, runs: [], holes: [], boundary };
            lines.set(key, value);
        }
        return value;
    };
    // The core's shafts and the sealed voids own their faces too: a stairwell's are drawn in the
    // corridor's finish, a lift shaft's and a void's are never seen.
    type Owner = PlanRoom & { draw: boolean; structural?: boolean };
    const pseudo = (id: string, rect: PlanRoom['rect'], draw: boolean): Owner => ({ id, kind: 'mechanical_room', rect, doors: [], draw, structural: true });
    const owners: Owner[] = [
        ...uv.rooms.map(room => ({ ...room, draw: true })),
        pseudo('stair-a', core.stairA, true), ...(core.stairB ? [pseudo('stair-b', core.stairB, true)] : []),
        pseudo('riser', core.riser, false), ...core.elevators.map(e => pseudo(e.id, e.rect, false)),
        ...uv.sealed.map((rect, i) => pseudo(`sealed:${i}`, rect, false)),
    ];
    for (const room of owners) {
        for (const raw of roomSegments(room, buildable)) {
            // The paired facade is already closed by Exterior. The rectangular room
            // envelope is an open perimeter band, not a wall to float behind its glass.
            // Core solids keep their enclosing walls even when they meet that boundary.
            if (raw.boundary && shellOwnsFacade(request, bp) && !room.structural) continue;
            // The shell's own face carries no partition reservation: its openings cut it instead.
            const segment = raw.boundary || room.structural ? raw : reserveFacadeEnds(raw, facade, bp, frame, depth);
            if (!segment || !segment.edge) continue;
            const a = Math.max(segment.a, segment.axis === 'H' ? plate.x : plate.z), b = Math.min(segment.b, segment.axis === 'H' ? plate.x + plate.w : plate.z + plate.d);
            if (b <= a + 1e-6) continue;
            const side = segment.edge === 'v0' || segment.edge === 'u0' ? 1 : -1;
            // Core enclosures remain walls at the room-envelope boundary. Exterior
            // windows cut facade linings, never the stairwell behind that facade.
            line(segment.axis, segment.c, !!segment.boundary && !room.structural).runs.push({ a, b, room: room.id, kind: room.kind, side, draw: room.draw });
        }
        for (const door of room.doors) {
            if (door.openFront) continue;
            const [u, v] = doorUvPoint(door, room);
            let head = doorHeadHeight(door.leaves, height);
            const axis = door.edge.startsWith('v') ? 'H' : 'V', c = axis === 'H' ? v : u;
            if (door.to === 'outside') {
                const world = uvToWorld([u, v], frame);
                const sources = bp.openings.filter(o => o.kind !== 'window').map(opening => {
                    const p = edgePoint(edgeFrame(bp.outline, opening.edge), opening.offset + opening.width / 2, 0);
                    return { opening, distance: Math.hypot(p[0] - world[0], p[1] - world[1]) };
                }).sort((a,b) => a.distance-b.distance);
                if (sources[0]) head = Math.min(height, openingSpan(sources[0].opening).height);
            }
            // Exterior connections also cut snapped room ends that lie farther from the
            // construction boundary than a lining. Their published passage remains real.
            const owner = [...lines.values()].find(l => l.axis === axis && Math.abs(l.c-c)<1e-6 && l.runs.some(run => run.room === room.id));
            (owner ?? line(axis,c)).holes.push({ at: axis === 'H' ? u : v, width: door.width, y0: 0, y1: head });
        }
    }
    for (const h of [stairEntryHole(core, 'a', 0), ...(core.stairB ? [stairEntryHole(core, 'b', 0)] : []), ...core.elevators.map((_, i) => elevatorDoorHole(core, i, 0))])
        line(h.axis, h.c).holes.push(h.hole);
    // Every opening any floor sharing this layout puts in the shell cuts the lining, so one
    // lined run serves a floor whose windows sit somewhere else.
    const boundaries = [...lines.values()].filter(l => l.boundary);
    projectShellCuts(shared, frame, height, boundaries);

    const kinds = new Map(owners.map(room => [room.id, room.kind]));
    const lights: LightFixture[] = [];
    for (const l of lines.values()) {
        const holes = canonicalHoles(l.holes);
        for (const run of l.runs) {
            if (!run.draw) continue;
            const baseFinish = finishOf(run.room, run.kind);
            // A stair's structural enclosure reaches its flights at every height.
            // The thin backing behind decorative frame joints leaves an open channel
            // beside a flight; use the full-depth service finish for every tier.
            const finish = run.room.startsWith('stair-') ? { ...baseFinish, frame: undefined } : baseFinish;
            // Stairwell walls close the full storey, including the ceiling service band.
            const runHeight = run.room.startsWith('stair-') ? bp.height : height;
            const face = new Face(builder, l, run, frame, runHeight, floor.elevation, finish, nextLineId, lights);
            // The other side of this run: a glazed office looks through glass onto public space.
            const across = l.runs.find(other => other.side !== run.side && other.a < run.b - 1e-6 && other.b > run.a + 1e-6);
            const glazed = !!finish.frame && GLAZED_ROOMS.has(run.kind) && !!across && GLAZED_ONTO.has(kinds.get(across.room)!);
            const mirror = !!finish.frame && !!across && GLAZED_ROOMS.has(across.kind) && GLAZED_ONTO.has(run.kind);
            // Glass is one plate seen from both rooms: the office side owns it, the public side keeps its frame.
            let cursor = run.a;
            for (const hole of holes) {
                const casing = l.boundary ? 0 : CASING_MEMBER;
                const lo = Math.max(run.a, hole.at - hole.width / 2 - casing), hi = Math.min(run.b, hole.at + hole.width / 2 + casing);
                const head = hole.y1 + casing;
                if (hi <= lo + 1e-6) continue;
                if (lo > cursor + 1e-6) face.build(cursor, lo, glazed, mirror);
                if (hole.y0 > 0.05) face.plain(lo, hi, 0, hole.y0);
                if (runHeight - head > 0.05) face.plain(lo, hi, head, runHeight);
                cursor = Math.max(cursor, hi);
            }
            if (run.b > cursor + 1e-6) face.build(cursor, run.b, glazed, mirror);
        }
    }
    for (const l of lines.values()) {
        if (l.boundary) continue;
        for (const h of canonicalHoles(l.holes)) {
            const inside = (r: Run) => h.at - h.width / 2 >= r.a - .01 && h.at + h.width / 2 <= r.b + .01;
            const owner = l.runs.find(r => r.draw && inside(r)) ?? l.runs.find(inside);
            if (!owner) continue;
            const rotation = -frame.angleDeg * Math.PI / 180 + (l.axis === 'V' ? -Math.PI / 2 : 0);
            for (const t of [h.at - h.width / 2 - CASING_MEMBER / 2, h.at + h.width / 2 + CASING_MEMBER / 2]) {
                const [x, z] = uvToWorld(l.axis === 'H' ? [t, l.c] : [l.c, t], frame);
                builder.module('door-jamb', owner.room, [x, h.y0, z], [1, (h.y1 - h.y0) / .5, 1], rotation);
            }
            const [x, z] = uvToWorld(l.axis === 'H' ? [h.at, l.c] : [l.c, h.at], frame);
            builder.module('door-header', owner.room, [x, h.y1, z], [(h.width + 2 * CASING_MEMBER) / .5, 1, 1], rotation);
        }
    }
    return lights;
}

/** Projects openings along their inward normals onto the room's axis-aligned boundary
 *  linings, including curved facade segments and independently snapped adjacent rooms. */
function projectShellCuts(floors: readonly BlueprintFloor[], frame: Frame, height: number, boundaries: Line[]): void {
    for (const bp of floors) {
        for (const opening of bp.openings) {
            const span = openingSpan(opening);
            const face = edgeFrame(bp.outline, opening.edge);
            const a = worldToUv(edgePoint(face, span.from, 0), frame), b = worldToUv(edgePoint(face, span.to, 0), frame);
            const inward = worldToUv(edgePoint(face, span.from, 1), frame).map((v, i) => v - a[i]!) as Point;
            const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            // The room envelope can be metres behind recessed or curved glazing. Project
            // the published opening inward onto each facing room boundary. Adjacent rooms
            // can snap their linings to slightly different depths along one opening.
            const candidates = boundaries.flatMap(line => {
                const across = line.axis === 'H' ? 1 : 0, along = 1 - across;
                if (Math.abs(inward[across]!) < 1e-6) return [];
                const distance = (line.c - mid[across]!) / inward[across]!;
                if (distance < -1e-6) return [];
                const project = (p: Point) => p[along]! + (line.c - p[across]!) / inward[across]! * inward[along]!;
                const lo = Math.min(project(a), project(b)) - OPENING_MARGIN;
                const hi = Math.max(project(a), project(b)) + OPENING_MARGIN;
                if (!line.runs.some(run => run.side * inward[across]! > 0
                    && run.a < hi && run.b > lo)) return [];
                return [{ line, distance, lo, hi }];
            });
            for (const owner of candidates) owner.line.holes.push({ at: (owner.lo + owner.hi) / 2, width: owner.hi - owner.lo,
                y0: span.sill, y1: Math.min(height, span.sill + span.height) });
        }
    }
}

/** Glazing and usable door passages remain clear through the inset room lining. */
function openingSpan(opening: Opening): { from: number; to: number; sill: number; height: number } {
    const field = opening.kind === 'window' ? opening.glazing ?? opening : opening.door?.clearance ?? opening;
    const sill = opening.kind === 'window' ? field.sill ?? 0 : 0;
    return { from: field.offset, to: field.offset + field.width, sill, height: field.height };
}

/** One room's face of one partition run: its pieces stand on the line and face the room. */
class Face {
    private readonly rotation: number;

    constructor(
        private readonly builder: PlacementBuilder, private readonly line: Line, private readonly run: Run,
        private readonly frame: Frame, private readonly height: number, private readonly elevation: number,
        private readonly finish: RoomFinish, private readonly nextId: () => string, private readonly lights: LightFixture[],
    ) {
        // Local +z of a wall piece points into its room: along the line's normal on the run's side.
        const d: Point = line.axis === 'H' ? [0, run.side] : [run.side, 0];
        const w = [d[0] * frame.cos - d[1] * frame.sin, d[0] * frame.sin + d[1] * frame.cos];
        this.rotation = Math.atan2(w[0]!, w[1]!);
    }

    /** A run between holes: a nine-slice frame where one fits, a plain field otherwise. The
     *  field is one fitted backing over the whole run; the four corners, two rails and two
     *  stiles stand on it, each a shadow gap short of its cell. */
    build(a: number, b: number, glazed: boolean, mirror: boolean): void {
        const length = b - a, frame = this.finish.frame;
        if (!frame || length < MIN_FRAME - 1e-6 || this.height < MIN_FRAME - 1e-6) {
            this.plain(a, b, 0, this.height);
            return;
        }
        // Across the partition from an office's own glass, nothing stands: the plate is shared.
        if (mirror) return;
        const mid = (a + b) / 2, top = this.height - PIECE, inner = length - 2 * PIECE, tall = this.height - 2 * PIECE;
        this.piece(glazed ? 'wall-panel-field-glass' : frame.field, mid, 0, [length / PIECE, this.height / PIECE, 1]);
        for (const t of [a + PIECE / 2, b - PIECE / 2]) for (const y of [0, top]) this.piece(frame.corner, t, y, [1, 1, 1]);
        for (const y of [0, top]) this.piece(frame.rail, mid, y, [inner / PIECE, 1, 1]);
        for (const t of [a + PIECE / 2, b - PIECE / 2]) this.piece(frame.stile, t, PIECE, [1, tall / PIECE, 1]);
        if (glazed) return;
        for (const [y, facing] of [[PIECE, 'down'], [top, 'up']] as const) this.lightLine(mid, y, inner - 2 * LINE_GAP, facing);
    }

    /** A plain field: one fitted piece over the whole run and height. */
    plain(a: number, b: number, y0: number, y1: number): void {
        this.piece(this.finish.field, (a + b) / 2, y0, [(b - a) / PIECE, (y1 - y0) / PIECE, 1]);
    }

    private at(t: number, y: number, proud = 0): [number, number, number] {
        const off = proud * this.run.side;
        const [x, z] = uvToWorld(this.line.axis === 'H' ? [t, this.line.c + off] : [this.line.c + off, t], this.frame);
        return [x, y, z];
    }

    private piece(module: string, t: number, y: number, scale: [number, number, number]): void {
        this.builder.module(module, this.run.room, this.at(t, y), scale, this.rotation);
    }

    /** The lit joint between an edge and the field: emissive geometry and its light record. */
    private lightLine(t: number, y: number, length: number, facing: 'up' | 'down'): void {
        const frame = this.finish.frame!, id = this.nextId();
        const position = this.at(t, y, LINE_OFFSET);
        this.builder.module(frame.line, this.run.room, position, [length / PIECE, 1, 1], this.rotation, { id });
        const angleDeg = (((this.line.axis === 'H' ? 0 : 90) + this.frame.angleDeg) % 360 + 360) % 360;
        // Records stand in building-local metres like the room plan's, so the layout writer
        // takes the floor's elevation off every one the same way.
        this.lights.push({
            id, kind: 'cove', room: this.run.room,
            position: [position[0], position[1] + this.elevation, position[2]].map(v => Math.round(v * 1000) / 1000) as [number, number, number],
            length: Math.round(length * 1000) / 1000, angleDeg: Math.round(angleDeg * 100) / 100,
            intensity: Math.round(length * LINE_LUMENS_PER_METRE), colorTemperatureK: frame.kelvin,
            ...(frame.color ? { color: frame.color } : {}),
            range: 2.5, beamDeg: 170, diffuse: 0.9, facing,
        });
    }
}
