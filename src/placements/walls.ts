import { polygonBounds } from '../core/geom.js';
import type { Point } from '../core/geom.js';
import type { BlueprintFloor, FloorInterior, InteriorRequest, LightFixture, RoomKind } from '../core/types.js';
import type { CorePlan } from '../layout/core-plan.js';
import type { UvFloorData } from '../layout/plan-floor.js';
import { doorUvPoint } from '../layout/plan-floor.js';
import type { PlanRoom } from '../layout/plan-types.js';
import { Facade } from '../layout/openings.js';
import { constructionPlate, facadeDepth } from '../layout/shell.js';
import type { Frame } from '../layout/uv.js';
import { uvToWorld } from '../layout/uv.js';
import { canonicalHoles, doorHeadHeight, roomSegments, reserveFacadeEnds, type WallHole } from '../geometry/walls.js';
import { stairEntryHole } from '../geometry/stairs.js';
import { elevatorDoorHole } from '../geometry/core-geo.js';
import type { PlacementBuilder } from './builder.js';
import { GLAZED_ROOMS, type RoomFinish } from './finish.js';
import { PANEL } from './surfaces.js';

/** Fixed frame piece: corners are one cell, edges one cell wide. */
const PIECE = 0.5;
/** The shortest run and height a nine-slice frame fits; anything less is a plain field. */
const MIN_FRAME = 3 * PIECE;
/** A partition casing stands just proud of the frames on both faces. */
const CASING_DEPTH = 0.2;
/** A light line stops this far short of the corners. */
const LINE_GAP = 0.02;
/** The lens sits in the recess joint, this far off the partition line. */
const LINE_OFFSET = 0.06;
const LINE_LUMENS_PER_METRE = 55;

/** Public rooms an office's glazed partition looks onto. */
const GLAZED_ONTO: ReadonlySet<RoomKind> = new Set(["corridor", "elevator_lobby", "concourse", "office_open", "reception", "lounge"]);

interface Run { a: number; b: number; room: string; kind: RoomKind; side: 1 | -1; draw: boolean }
interface Line { axis: 'H' | 'V'; c: number; runs: Run[]; holes: WallHole[] }

/** Every partition face of a floor: nine-slice panel frames with light lines where a run
 *  fits one, plain fields elsewhere, glass fields between an office and the public space
 *  it looks onto. Returns the light records of the lines it built. */
export function walls(
    builder: PlacementBuilder, floor: FloorInterior, uv: UvFloorData, core: CorePlan, bp: BlueprintFloor,
    request: InteriorRequest, finishOf: (room: string, kind: RoomKind) => RoomFinish, tag: string,
): LightFixture[] {
    let lineCount = 0;
    const nextLineId = () => `${tag}-wl${lineCount++}`;
    const frame = core.frame, depth = facadeDepth(request.blueprint.facade), facade = new Facade(bp, request.blueprint.facade);
    const buildable = constructionPlate(bp, frame, depth), plate = polygonBounds(buildable);
    const height = floor.ceilingElevation - floor.elevation;
    const lines = new Map<string, Line>();
    const line = (axis: 'H' | 'V', c: number): Line => {
        const key = `${axis}:${c.toFixed(6)}`;
        let value = lines.get(key);
        if (!value) {
            value = { axis, c, runs: [], holes: [] };
            lines.set(key, value);
        }
        return value;
    };
    // The core's shafts and the sealed voids own their faces too: a stairwell's are drawn in the
    // corridor's finish, a lift shaft's and a void's are never seen.
    type Owner = PlanRoom & { draw: boolean };
    const pseudo = (id: string, rect: PlanRoom['rect'], draw: boolean): Owner => ({ id, kind: 'mechanical_room', rect, doors: [], draw });
    const owners: Owner[] = [
        ...uv.rooms.map(room => ({ ...room, draw: true })),
        pseudo('stair-a', core.stairA, true), ...(core.stairB ? [pseudo('stair-b', core.stairB, true)] : []),
        pseudo('riser', core.riser, false), ...core.elevators.map(e => pseudo(e.id, e.rect, false)),
        ...uv.sealed.map((rect, i) => pseudo(`sealed:${i}`, rect, false)),
    ];
    for (const room of owners) {
        for (const raw of roomSegments(room, buildable)) {
            const segment = reserveFacadeEnds(raw, facade, bp, frame, depth);
            if (!segment || !segment.edge) continue;
            const a = Math.max(segment.a, segment.axis === 'H' ? plate.x : plate.z), b = Math.min(segment.b, segment.axis === 'H' ? plate.x + plate.w : plate.z + plate.d);
            if (b <= a + 1e-6) continue;
            const side = segment.edge === 'v0' || segment.edge === 'u0' ? 1 : -1;
            line(segment.axis, segment.c).runs.push({ a, b, room: room.id, kind: room.kind, side, draw: room.draw });
        }
        for (const door of room.doors) {
            if (door.to === 'outside' || door.openFront) continue;
            const [u, v] = doorUvPoint(door, room), head = doorHeadHeight(door.leaves, height);
            line(door.edge.startsWith('v') ? 'H' : 'V', door.edge.startsWith('v') ? v : u).holes.push({ at: door.edge.startsWith('v') ? u : v, width: door.width, y0: 0, y1: head });
        }
    }
    for (const h of [stairEntryHole(core, 'a', 0), ...(core.stairB ? [stairEntryHole(core, 'b', 0)] : []), ...core.elevators.map((_, i) => elevatorDoorHole(core, i, 0))])
        line(h.axis, h.c).holes.push(h.hole);

    const kinds = new Map(owners.map(room => [room.id, room.kind]));
    const lights: LightFixture[] = [];
    for (const l of lines.values()) {
        const holes = canonicalHoles(l.holes);
        for (const run of l.runs) {
            if (!run.draw) continue;
            const finish = finishOf(run.room, run.kind);
            const face = new Face(builder, l, run, frame, height, floor.elevation, finish, nextLineId, lights);
            // The other side of this run: a glazed office looks through glass onto public space.
            const across = l.runs.find(other => other.side !== run.side && other.a < run.b - 1e-6 && other.b > run.a + 1e-6);
            const glazed = !!finish.frame && GLAZED_ROOMS.has(run.kind) && !!across && GLAZED_ONTO.has(kinds.get(across.room)!);
            const mirror = !!finish.frame && !!across && GLAZED_ROOMS.has(across.kind) && GLAZED_ONTO.has(run.kind);
            // Glass is one plate seen from both rooms: the office side owns it, the public side keeps its frame.
            let cursor = run.a;
            for (const hole of holes) {
                const lo = Math.max(run.a, hole.at - hole.width / 2), hi = Math.min(run.b, hole.at + hole.width / 2);
                if (hi <= lo + 1e-6) continue;
                if (lo > cursor + 1e-6) face.build(cursor, lo, glazed, mirror);
                if (height - hole.y1 > 0.05) face.plain(lo, hi, hole.y1, height);
                cursor = Math.max(cursor, hi);
            }
            if (run.b > cursor + 1e-6) face.build(cursor, run.b, glazed, mirror);
        }
    }
    for (const l of lines.values()) {
        for (const h of canonicalHoles(l.holes)) {
            const inside = (r: Run) => h.at - h.width / 2 >= r.a - .01 && h.at + h.width / 2 <= r.b + .01;
            const owner = l.runs.find(r => r.draw && inside(r)) ?? l.runs.find(inside);
            if (!owner) continue;
            const [x, z] = uvToWorld(l.axis === 'H' ? [h.at, l.c] : [l.c, h.at], frame);
            builder.module('door-frame', owner.room, [x, 0, z], [h.width, h.y1 / 2.5, CASING_DEPTH / .14], -frame.angleDeg * Math.PI / 180 + (l.axis === 'V' ? -Math.PI / 2 : 0));
        }
    }
    return lights;
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

    /** A run between holes: a nine-slice frame where one fits, a plain field otherwise. */
    build(a: number, b: number, glazed: boolean, mirror: boolean): void {
        const length = b - a, frame = this.finish.frame;
        if (!frame || length < MIN_FRAME - 1e-6 || this.height < MIN_FRAME - 1e-6) {
            this.plain(a, b, 0, this.height);
            return;
        }
        // Across the partition from an office's own glass, nothing stands: the plate is shared.
        if (mirror) return;
        const mid = (a + b) / 2, top = this.height - PIECE, inner = length - 2 * PIECE, tall = this.height - 2 * PIECE;
        for (const t of [a + PIECE / 2, b - PIECE / 2]) for (const y of [0, top]) this.piece(frame.corner, t, y, [1, 1, 1]);
        for (const y of [0, top]) this.piece(frame.edge, mid, y, [inner / PIECE, 1, 1]);
        for (const t of [a + PIECE / 2, b - PIECE / 2]) this.piece(frame.edge, t, PIECE, [1, tall / PIECE, 1]);
        const count = Math.max(1, Math.ceil(inner / PANEL - 1e-9)), width = inner / count;
        for (let i = 0; i < count; i++) {
            this.piece(glazed ? 'wall-panel-field-glass' : frame.field, a + PIECE + width * (i + 0.5), PIECE, [width / PIECE, tall / PIECE, 1]);
        }
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
