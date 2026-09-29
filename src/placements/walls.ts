import { polygonBounds } from '../core/geom.js';
import type { Point } from '../core/geom.js';
import type { BlueprintFloor, FloorInterior, InteriorRequest, LightFixture, RoomKind } from '../core/types.js';
import type { CorePlan } from '../layout/core-plan.js';
import type { UvFloorData } from '../layout/plan-floor.js';
import { doorUvPoint } from '../layout/plan-floor.js';
import type { PlanRoom } from '../layout/plan-types.js';
import { Facade } from '../layout/openings.js';
import { constructionPlate, facadeDepth, faceSteps } from '../layout/shell.js';
import type { Frame, UvRect } from '../layout/uv.js';
import { uvToWorld, worldToUv } from '../layout/uv.js';
import { edgeFrame, edgePoint } from '../geometry/shell-fit.js';
import { doorHeadHeight, mergeHoles, openingSpan, outsideDoorHead, roomSegments, reserveFacadeEnds, wallCuts, type WallHole } from '../geometry/walls.js';
import { stairEntryHole } from '../geometry/stairs.js';
import { elevatorDoorHole } from '../geometry/core-geo.js';
import type { PlacementBuilder } from './builder.js';
import { GLAZED_ONTO, GLAZED_ROOMS, type RoomFinish } from './finish.js';
import { shellOwnsFacade } from '../architecture/recipes.js';
import { PUBLIC_PORTAL, placeLuxuryPortal } from '../styles/luxury/portals.js';
import { privacyReturns } from '../layout/privacy-returns.js';
import { duplexAirOwners, duplexPerimeterSegment, duplexWallSegments, duplexVoids } from './duplex.js';
import { isLoft1702Wall, LOFT1702_FINISH, placeLoft1702Wall } from '../styles/luxury/loft-finish.js';
import { duplexCoveSpans } from './duplex-finish.js';
import { gridOrigin } from '../layout/tile-fit.js';
import { GLAZING, PANELS, PORTALS, STYLES } from '../styles/reference/registry.js';
import { placePanelSystem } from '../styles/systems/panel.js';
import { placeGlazing } from '../styles/systems/glazing.js';
import { placePortal, portalCut, portalEligible } from '../styles/systems/portal.js';
import type { PanelSystem, PortalSpec, WallFace } from '../styles/systems/types.js';
import type { Placement } from './types.js';

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

interface Run { a: number; b: number; room: string; kind: RoomKind; side: 1 | -1; draw: boolean; air?: number }
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
    // Rooms reach the shell's face once the building is planned; the planned plate remains
    // what the privacy returns close against where a room did not reach it.
    const planned = constructionPlate(bp, frame, depth), buildable = uv.face ?? planned, plate = polygonBounds(buildable);
    // A curved or chamfered facade keeps its own face: the steps the rooms reach it by are
    // no wall of their own.
    const steps = uv.face ? faceSteps(uv.face, uv.outline) : undefined;
    const stepped = (segment: { axis: 'H' | 'V'; c: number; a: number; b: number }) => !!steps && (segment.axis === 'H'
        ? steps.edge([segment.a, segment.c], [segment.b, segment.c]) : steps.edge([segment.c, segment.a], [segment.c, segment.b]));
    const height = floor.ceilingElevation - floor.elevation;
    const ceilingHoles = duplexVoids(floor, frame, 'lower');
    const grid = gridOrigin(uv.outline);
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
    type Owner = PlanRoom & { draw: boolean; structural?: boolean; air?: number; perimeter?: PlanRoom['rect']; open?: PlanRoom['rect'] };
    const pseudo = (id: string, rect: PlanRoom['rect'], draw: boolean, kind: RoomKind = 'mechanical_room'): Owner => ({ id, kind, rect, doors: [], draw, structural: true });
    // The band a loft void reaches the shell across is the void's air too: on the upper floor
    // it closes its sides from the lower ceiling up, never the side it opens to the void by.
    const ringAir = (uv.openAir ?? []).filter(item => item.level === 'upper').map(item => {
        const b = polygonBounds(item.polygon);
        return { id: `${item.slice}-air-0`, kind: 'living' as const, unit: item.unit, polygon: item.polygon,
            rect: { u: b.x, v: b.z, lu: b.w, lv: b.d }, doors: [], draw: true, air: item.gap, open: item.void };
    });
    const owners: Owner[] = [
        ...uv.rooms.map(room => ({ ...room, draw: true })),
        ...duplexAirOwners(floor, frame).map(room => ({ ...room, draw: true })),
        ...ringAir,
        pseudo('stair-a', core.stairA, true, 'corridor'), ...(core.stairB ? [pseudo('stair-b', core.stairB, true, 'corridor')] : []),
        pseudo('riser', core.riser, false), ...core.elevators.map(e => pseudo(e.id, e.rect, false)),
        ...uv.sealed.map((rect, i) => pseudo(`sealed:${i}`, rect, false)),
    ];
    for (const room of owners) {
        const segments = roomSegments(room, buildable).filter(segment => !segment.boundary || !stepped(segment));
        const ownedSegments = room.open
            ? segments.filter(segment => !segment.boundary && !alongRect(segment, room.open!))
            : room.air !== undefined
            ? segments.filter(segment => segment.boundary || duplexPerimeterSegment(segment, room.perimeter!))
            : segments.flatMap(segment => duplexWallSegments(floor, frame, segment, room.unit));
        for (const raw of ownedSegments) {
            // The paired facade is already closed by Exterior. The rectangular room
            // envelope is an open perimeter band, not a wall to float behind its glass.
            // Core solids keep their enclosing walls even when they meet that boundary.
            if (raw.boundary && shellOwnsFacade(request, bp) && !room.structural) continue;
            // The shell's own face carries no partition reservation: its openings cut it instead.
            const segment = raw.boundary || room.structural ? raw : reserveFacadeEnds(raw, facade, bp, frame, depth, !uv.face);
            if (!segment || !segment.edge) continue;
            const a = Math.max(segment.a, segment.axis === 'H' ? plate.x : plate.z), b = Math.min(segment.b, segment.axis === 'H' ? plate.x + plate.w : plate.z + plate.d);
            if (b <= a + 1e-6) continue;
            const side = segment.edge === 'v0' || segment.edge === 'u0' ? 1 : -1;
            // Core enclosures remain walls at the room-envelope boundary. Exterior
            // windows cut facade linings, never the stairwell behind that facade.
            line(segment.axis, segment.c, !!segment.boundary && !room.structural).runs.push({ a, b, room: room.id, kind: room.kind, side, draw: room.draw,
                ...(room.air === undefined ? {} : { air: room.air }) });
        }
        for (const door of room.doors) {
            if (door.openFront) continue;
            const [u, v] = doorUvPoint(door, room);
            const head = (door.to === 'outside' ? outsideDoorHead(bp, uvToWorld([u, v], frame), height) : null) ?? doorHeadHeight(door.leaves, height);
            const axis = door.edge.startsWith('v') ? 'H' : 'V', c = axis === 'H' ? v : u;
            // Exterior connections also cut snapped room ends that lie farther from the
            // construction boundary than a lining. Their published passage remains real.
            const owner = [...lines.values()].find(l => l.axis === axis && Math.abs(l.c-c)<1e-6 && l.runs.some(run => run.room === room.id));
            (owner ?? line(axis,c)).holes.push({ at: axis === 'H' ? u : v, width: door.width, y0: 0, y1: head });
        }
    }
    const stairHoles = [stairEntryHole(core, 'a', 0), ...(core.stairB ? [stairEntryHole(core, 'b', 0)] : [])];
    for (const entry of stairHoles) {
        // A broad public stair reads as an open portal, with a head proportioned to
        // its floor instead of the low domestic doorway formerly masking both lanes.
        if (entry.hole.width > 3) entry.hole.y1 = Math.min(bp.height - .15, 2.8);
    }
    for (const h of [...stairHoles, ...core.elevators.map((_, i) => elevatorDoorHole(core, i, 0))])
        line(h.axis, h.c).holes.push(h.hole);
    // Every opening any floor sharing this layout puts in the shell cuts the lining, so one
    // lined run serves a floor whose windows sit somewhere else.
    const boundaries = [...lines.values()].filter(l => l.boundary);
    projectShellCuts(shared, frame, height, boundaries);

    const kinds = new Map(owners.map(room => [room.id, room.kind]));
    const publicKinds = new Set<RoomKind>(['reception', 'lounge', 'corridor', 'elevator_lobby', 'concourse', 'dining_area', 'bar', 'living', 'studio_main']);
    const portal = (l: Line, h: WallHole): boolean => {
        if (l.boundary || h.y0 !== 0 || h.width < 1.2 || h.y1 < 1.9
            || height < h.y1 + PUBLIC_PORTAL.radius + PUBLIC_PORTAL.band + .01) return false;
        const peers = l.runs.filter(r => r.draw && h.at - h.width / 2 >= r.a - .01 && h.at + h.width / 2 <= r.b + .01);
        if (peers.length < 2 || peers.some(r => !publicKinds.has(r.kind) || r.room.startsWith('stair-'))) return false;
        // Main apartment entries retain the moving-door owner's existing casing IDs.
        const units = peers.map(r => uv.rooms.find(room => room.id === r.room)?.unit);
        if (units.some(Boolean) && new Set(units).size > 1) return false;
        if (peers.some(r => finishOf(r.room, r.kind).family !== 'luxury')) return false;
        const pad = PUBLIC_PORTAL.band;
        if (!peers.every(r => h.at - h.width / 2 - pad >= r.a - .01 && h.at + h.width / 2 + pad <= r.b + .01)) return false;
        return !mergeHoles(l.holes, CASING_MEMBER).some(other => Math.abs(other.at - h.at) > 1e-6
            && Math.abs(other.at - h.at) < (other.width + h.width) / 2 + pad + CASING_MEMBER + .01);
    };
    // A reference portal frames a wide opening between two rooms whose finishes name the
    // same PortalSpec; the luxury public portal frames the other openings it fits.
    const layersOf = (spec: PortalSpec): PortalSpec[] => (spec.layers ?? []).map(id => PORTALS.get(id)).filter((s): s is PortalSpec => !!s);
    const referencePortal = (l: Line, h: WallHole): PortalSpec | undefined => {
        if (l.boundary || h.y0 !== 0) return undefined;
        const peers = l.runs.filter(r => r.draw && h.at - h.width / 2 >= r.a - .01 && h.at + h.width / 2 <= r.b + .01);
        if (peers.length < 2 || peers.some(r => r.room.startsWith('stair-'))) return undefined;
        const ids = new Set(peers.map(r => finishOf(r.room, r.kind).portal));
        const spec = ids.size === 1 ? PORTALS.get([...ids][0] ?? '') : undefined;
        if (!spec) return undefined;
        const units = peers.map(r => uv.rooms.find(room => room.id === r.room)?.unit);
        if (units.some(Boolean) && new Set(units).size > 1) return undefined;
        const cut = portalCut(spec, layersOf(spec), h), pad = (cut.width - h.width) / 2;
        if (!peers.every(r => cut.at - cut.width / 2 >= r.a - .01 && cut.at + cut.width / 2 <= r.b + .01)) return undefined;
        if (mergeHoles(l.holes, CASING_MEMBER).some(other => Math.abs(other.at - h.at) > 1e-6
            && Math.abs(other.at - h.at) < (other.width + h.width) / 2 + pad + CASING_MEMBER + .01)) return undefined;
        return portalEligible(spec, peers.map(r => ({ room: r.room, kind: r.kind })), h, height, layersOf(spec)) ? spec : undefined;
    };
    const chosen = new Map<string, PortalSpec | 'luxury' | null>();
    const portalOf = (l: Line, h: WallHole): PortalSpec | 'luxury' | null => {
        const key = `${l.boundary}:${l.axis}:${l.c.toFixed(6)}:${h.at.toFixed(6)}:${h.width.toFixed(6)}:${h.y0.toFixed(6)}:${h.y1.toFixed(6)}`;
        if (!chosen.has(key)) chosen.set(key, referencePortal(l, h) ?? (portal(l, h) ? 'luxury' : null));
        return chosen.get(key)!;
    };
    const styleOfRoom = (room: string) => STYLES.get(finishOf(room, kinds.get(room) ?? 'corridor').style ?? '');
    const lights: LightFixture[] = [];
    for (const l of lines.values()) {
        // A partition frames each opening once in its casing; the lining cuts the union of
        // everything its line carries, so no stretch takes two heads or a sill across a door.
        const casing = l.boundary ? 0 : CASING_MEMBER;
        const holes = l.boundary ? l.holes : mergeHoles(l.holes, casing);
        const cuts = wallCuts(holes.map(h => {
            const chosenPortal = portalOf(l, h);
            return chosenPortal === 'luxury'
                ? { ...h, width: h.width + 2 * PUBLIC_PORTAL.band, y1: h.y1 + PUBLIC_PORTAL.radius + PUBLIC_PORTAL.band }
                : chosenPortal ? portalCut(chosenPortal, layersOf(chosenPortal), h)
                : { ...h, width: h.width + 2 * casing, y1: h.y1 + casing };
        }));
        for (const run of l.runs) {
            if (!run.draw) continue;
            const baseFinish = finishOf(run.room, run.kind);
            const stair = run.room.startsWith('stair-');
            // A stair's structural enclosure reaches its flights at every height.
            // The thin backing behind decorative frame joints leaves an open channel
            // beside a flight; use the full-depth service finish for every tier.
            const finish = stair ? { ...baseFinish, frame: undefined } : baseFinish;
            // Stairwell walls close the full storey, including the ceiling service band.
            const runHeight = stair ? bp.height : height;
            // The other side of this run: a glazed office looks through glass onto public space.
            const across = l.runs.find(other => other.side !== run.side && other.a < run.b - 1e-6 && other.b > run.a + 1e-6);
            // A common room's style may line the runs it shares with a dwelling in its frontage panels.
            const frontageId = styleOfRoom(run.room)?.frontage;
            const dwellingAcross = !!across && !!uv.rooms.find(room => room.id === across.room)?.unit && !uv.rooms.find(room => room.id === run.room)?.unit;
            const panel: PanelSystem | null | undefined = stair ? null : frontageId && dwellingAcross ? PANELS.get(frontageId) : undefined;
            const face = new Face(builder, l, run, frame, runHeight, floor.elevation, finish, nextLineId, lights, ceilingHoles, { ceilingY: height, grid, panel });
            const legacy = finish.family === 'luxury' || finish.family === 'corporate' || !!finish.frame;
            const glass = finish.glazing ? GLAZING.get(finish.glazing) : undefined;
            // Whether a stretch of this run is glass, judged by the room across that stretch:
            // a long run can face an office's glass along one part and a lift core along the
            // next, and only the part facing the glass is the glazed room's plate.
            const glazing = (other: Run | undefined) => {
                const acrossFinish = other ? finishOf(other.room, other.kind) : undefined;
                const acrossGlass = acrossFinish?.glazing ? GLAZING.get(acrossFinish.glazing) : undefined;
                const glazed = !!other && (glass ? glass.rooms.includes(run.kind) && glass.onto.includes(kinds.get(other.room)!)
                    : legacy && GLAZED_ROOMS.has(run.kind) && GLAZED_ONTO.has(kinds.get(other.room)!));
                const mirror = !!other && (acrossGlass ? acrossGlass.rooms.includes(other.kind) && acrossGlass.onto.includes(run.kind)
                    : legacy && GLAZED_ROOMS.has(other.kind) && GLAZED_ONTO.has(run.kind));
                return { glazed, mirror, acrossGlass: !!acrossGlass };
            };
            const opposite = l.runs.filter(other => other.side !== run.side && other.a < run.b - 1e-6 && other.b > run.a + 1e-6);
            const place = (a: number, b: number, other: Run | undefined) => {
                const { glazed, mirror, acrossGlass } = glazing(other);
                if (run.air !== undefined) face.plain(a, b, -run.air, runHeight);
                else if (glass && glazed) placeGlazing(face, glass, a, b);
                // Glass is one plate seen from both rooms: the glazed room's system owns it.
                else if (!(acrossGlass && mirror)) face.build(a, b, glazed, mirror);
            };
            const build = (a: number, b: number) => {
                // Split a fragment where the room across it changes, and build each stretch by
                // the glass it faces; a fragment that agrees with the run's own neighbour
                // throughout is built whole, as before.
                const ends = [a, ...opposite.flatMap(other => [other.a, other.b]).filter(t => t > a + 1e-6 && t < b - 1e-6).sort((x, y) => x - y), b]
                    .filter((t, k, all) => k === 0 || t > all[k - 1]! + 1e-6);
                const parts = ends.slice(1).map((to, k) => {
                    const from = ends[k]!, other = opposite.find(o => o.a < to - 1e-6 && o.b > from + 1e-6);
                    return { from, to, other, key: JSON.stringify(glazing(other)) };
                });
                const own = JSON.stringify(glazing(across));
                if (parts.every(part => part.key === own)) return place(a, b, across);
                for (let k = 0; k < parts.length;) {
                    let last = k;
                    while (last + 1 < parts.length && parts[last + 1]!.key === parts[k]!.key) last++;
                    place(parts[k]!.from, parts[last]!.to, parts[k]!.other);
                    k = last + 1;
                }
            };
            // Glass is one plate seen from both rooms: the office side owns it, the public side keeps its frame.
            let cursor = run.a;
            for (const cut of cuts) {
                const lo = Math.max(run.a, cut.a), hi = Math.min(run.b, cut.b);
                if (hi <= lo + 1e-6) continue;
                if (lo > cursor + 1e-6) build(cursor, lo);
                let wall = -(run.air ?? 0);
                for (const [y0, y1] of cut.open) {
                    if (y0 - wall > 0.05) face.plain(lo, hi, wall, y0);
                    wall = Math.max(wall, y1);
                }
                if (runHeight - wall > 0.05) face.plain(lo, hi, wall, runHeight);
                cursor = Math.max(cursor, hi);
            }
            if (run.b > cursor + 1e-6) build(cursor, run.b);
        }
    }
    if ((floor.kind === 'apartment' || floor.kind === 'residence_studio') && shellOwnsFacade(request, bp))
      for (const closure of privacyReturns(uv.rooms, planned, bp, request.blueprint.facade, frame)) {
        const l: Line = { axis: closure.axis, c: closure.c, runs: [], holes: [], boundary: false };
        // A return is a real two-faced opaque partition, using existing wall
        // modules and the shared room finish. It reaches the structural soffit.
        for (const side of [1, -1] as const) {
            const run: Run = { ...closure, side, draw: true };
            const finish = { ...finishOf(closure.room, closure.kind), frame: undefined };
            const face = new Face(builder, l, run, frame, bp.height, floor.elevation, finish, nextLineId, lights, [], { ceilingY: height, grid });
            face.plain(closure.a - .02, closure.b + .02, 0, bp.height);
        }
    }
    for (const l of lines.values()) {
        if (l.boundary) continue;
        for (const h of mergeHoles(l.holes, CASING_MEMBER)) {
            const matches = (entry: ReturnType<typeof stairEntryHole>) => entry.axis === l.axis
                && Math.abs(entry.c - l.c) < 1e-6 && Math.abs(entry.hole.at - h.at) < 1e-6;
            // Lift-specific fitted members own this complete reveal and casing.
            if (core.elevators.some((_, i) => matches(elevatorDoorHole(core, i, 0)))) continue;
            const inside = (r: Run) => h.at - h.width / 2 >= r.a - .01 && h.at + h.width / 2 <= r.b + .01;
            const owner = l.runs.find(r => r.draw && inside(r)) ?? l.runs.find(inside);
            if (!owner) continue;
            const chosenPortal = portalOf(l, h);
            if (chosenPortal === 'luxury') {
                placeLuxuryPortal(builder, owner.room, l.axis, l.c, h.at, h.width, h.y1, frame);
                continue;
            }
            if (chosenPortal) {
                // One call places the portal and its concentric outer layers.
                lights.push(...placePortal(builder, chosenPortal, owner.room, l.axis, l.c, h.at, h.width, h.y1, frame,
                    { layers: layersOf(chosenPortal), elevation: floor.elevation }));
                continue;
            }
            const ownerFinish = finishOf(owner.room, owner.kind);
            // Core thresholds retain the stable member IDs used by stair walking
            // consumers. Room passages may vary their casing without changing bounds.
            const coreEntry = [stairEntryHole(core, 'a', 0), ...(core.stairB ? [stairEntryHole(core, 'b', 0)] : [])].some(matches);
            const suffix = coreEntry ? '' : `-${ownerFinish.casing ?? ownerFinish.family}`;
            const rotation = -frame.angleDeg * Math.PI / 180 + (l.axis === 'V' ? -Math.PI / 2 : 0);
            for (const t of [h.at - h.width / 2 - CASING_MEMBER / 2, h.at + h.width / 2 + CASING_MEMBER / 2]) {
                const [x, z] = uvToWorld(l.axis === 'H' ? [t, l.c] : [l.c, t], frame);
                builder.module(`door-jamb${suffix}`, owner.room, [x, h.y0, z], [1, (h.y1 - h.y0) / .5, 1], rotation);
            }
            const [x, z] = uvToWorld(l.axis === 'H' ? [h.at, l.c] : [l.c, h.at], frame);
            builder.module(`door-header${suffix}`, owner.room, [x, h.y1, z], [(h.width + 2 * CASING_MEMBER) / .5, 1, 1], rotation);
        }
    }
    return lights;
}

/** Whether a segment runs along one of a rectangle's sides, within its span. */
function alongRect(segment: { axis: 'H' | 'V'; c: number; a: number; b: number }, rect: UvRect): boolean {
    const [low, high, from, to] = segment.axis === 'H' ? [rect.v, rect.v + rect.lv, rect.u, rect.u + rect.lu] : [rect.u, rect.u + rect.lu, rect.v, rect.v + rect.lv];
    return Math.min(Math.abs(segment.c - low), Math.abs(segment.c - high)) < 1e-6 && segment.a >= from - 1e-6 && segment.b <= to + 1e-6;
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

/** One room's face of one partition run: its pieces stand on the line and face the room.
 *  A finish whose field is a registered panel system builds every fragment through it. */
class Face implements WallFace {
    readonly rotation: number;
    readonly along: 1 | -1;
    readonly room: string;
    readonly kind: RoomKind;
    readonly axis: 'H' | 'V';
    readonly c: number;
    readonly side: 1 | -1;
    readonly ceilingY: number;
    readonly gridOrigin: number;
    private readonly panel: PanelSystem | undefined;

    constructor(
        readonly builder: PlacementBuilder, private readonly line: Line, private readonly run: Run,
        readonly frame: Frame, readonly height: number, readonly elevation: number,
        private readonly finish: RoomFinish, readonly nextId: () => string, readonly lights: LightFixture[],
        private readonly ceilingHoles: readonly UvRect[] = [],
        options: { ceilingY?: number; grid?: Point; panel?: PanelSystem | null } = {},
    ) {
        // Local +z of a wall piece points into its room: along the line's normal on the run's side.
        const d: Point = line.axis === 'H' ? [0, run.side] : [run.side, 0];
        const w = [d[0] * frame.cos - d[1] * frame.sin, d[0] * frame.sin + d[1] * frame.cos];
        this.rotation = Math.atan2(w[0]!, w[1]!);
        // Piece-local +x may run against the line: phase every repeat from the same end.
        const tangent = [Math.cos(this.rotation), -Math.sin(this.rotation)];
        const along = line.axis === 'H'
            ? tangent[0]! * frame.cos + tangent[1]! * frame.sin
            : -tangent[0]! * frame.sin + tangent[1]! * frame.cos;
        this.along = along > 0 ? 1 : -1;
        this.room = run.room;
        this.kind = run.kind;
        this.axis = line.axis;
        this.c = line.c;
        this.side = run.side;
        this.ceilingY = options.ceilingY ?? height;
        this.gridOrigin = options.grid ? (line.axis === 'H' ? options.grid[0] : options.grid[1]) : 0;
        this.panel = options.panel === null ? undefined : options.panel ?? PANELS.get(finish.field);
    }

    /** A run between holes: a nine-slice frame where one fits, a plain field otherwise. The
     *  field is one fitted backing over the whole run; the four corners, two rails and two
     *  stiles stand on it, each a shadow gap short of its cell. */
    build(a: number, b: number, glazed: boolean, mirror: boolean): void {
        const length = b - a, frame = this.finish.frame;
        // Office glazing keeps slim real mullions after removing the old .5 m
        // decorative frame. One side owns the shared glass and unlit metalwork.
        if ((this.finish.family === 'luxury' || this.finish.family === 'corporate') && (glazed || mirror)) {
            if (mirror) return;
            const mid = (a + b) / 2;
            this.piece('wall-panel-field-glass', mid, 0, [length / PIECE, this.height / PIECE, 1]);
            for (const t of [a + .0125, b - .0125])
                this.piece('wall-meridian-glass-stile', t, 0, [1, this.height / PIECE, 1]);
            for (const y of [0, this.height - .025])
                this.piece('wall-meridian-glass-rail', mid, y, [length / PIECE, 1, 1]);
            return;
        }
        // A panel system replaces the nine-slice frame on every face of the room.
        if (this.panel) {
            if (!mirror) this.plain(a, b, 0, this.height);
            return;
        }
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

    /** A plain field: one fitted piece over the whole run and height; a panel system's
     *  columns, fills and bands where the finish names one. */
    plain(a: number, b: number, y0: number, y1: number): void {
        if (this.panel) {
            placePanelSystem(this, this.panel, a, b, y0, y1);
            return;
        }
        if (isLoft1702Wall(this.finish.field)) {
            placeLoft1702Wall(this.builder, this.run.room, this.at((a + b) / 2, y0), b - a, y1 - y0, this.rotation,
                { phase: this.along > 0 ? a : -b, wet: this.finish.field === LOFT1702_FINISH.wetWall });
            if (this.finish.field === LOFT1702_FINISH.wall && ['living', 'corridor'].includes(this.run.kind)
                && Math.abs(y1 - this.height) < 1e-6 && y1 - y0 >= .3) {
                for (const [from, to] of duplexCoveSpans(a, b, this.line.axis, this.line.c, this.run.side, this.ceilingHoles))
                    if (to - from > .44) this.loftCove((from + to) / 2, this.height - .24, to - from - .04);
            }
            return;
        }
        if (!['wall-field-meridian-mineral', 'wall-field-meridian-ivory', 'wall-field-meridian-walnut'].includes(this.finish.field)) {
            this.piece(this.finish.field, (a + b) / 2, y0, [(b - a) / PIECE, (y1 - y0) / PIECE, 1]);
            return;
        }
        // Continuous full-depth backing keeps the partition sealed behind the
        // narrow joints. Broad 1.5–2 m panels have no luminous perimeter frame.
        this.piece('wall-field-meridian-backing', (a + b) / 2, y0, [(b - a) / PIECE, (y1 - y0) / PIECE, 1]);
        const skirt = y0 >= -1e-6 && y0 < .001 && y1 > .3;
        const bottom = skirt ? .102 : y0;
        const count = Math.max(1, Math.ceil((b - a) / 2));
        const width = (b - a) / count;
        for (let i = 0; i < count; i++) {
            const from = a + i * width + (i ? .002 : 0);
            const to = a + (i + 1) * width - (i + 1 < count ? .002 : 0);
            this.piece(this.finish.field, (from + to) / 2, bottom, [(to - from) / PIECE, (y1 - bottom) / PIECE, 1]);
        }
        if (skirt) this.piece('wall-meridian-skirting', (a + b) / 2, 0, [(b - a) / PIECE, 1, 1]);
    }

    at(t: number, y: number, proud = 0): [number, number, number] {
        const off = proud * this.run.side;
        const [x, z] = uvToWorld(this.line.axis === 'H' ? [t, this.line.c + off] : [this.line.c + off, t], this.frame);
        return [x, y, z];
    }

    piece(module: string, t: number, y: number, scale: [number, number, number], extra: { id?: string; proud?: number } = {}): Placement {
        return this.builder.module(module, this.run.room, this.at(t, y, extra.proud ?? 0), scale, this.rotation, extra.id ? { id: extra.id } : {});
    }

    /** Physical wall pocket and matching restrained red source, both facing
     * this room. Bedroom and wet-room lighting remains warm task lighting. */
    private loftCove(t: number, y: number, length: number): void {
        const id = this.nextId(), position = this.at(t, y, .149);
        this.builder.module(LOFT1702_FINISH.cove, this.run.room, position, [length / PIECE, 1, 1], this.rotation, { id });
        this.lights.push({ id, kind: 'cove', room: this.run.room,
            position: [position[0], position[1] + this.elevation, position[2]], length,
            axis: [Math.cos(this.rotation), 0, -Math.sin(this.rotation)], direction: [0, 1, 0],
            angleDeg: (-this.rotation * 180 / Math.PI + 360) % 360,
            intensity: length * LOFT1702_FINISH.coveLumensPerMetre,
            color: [...LOFT1702_FINISH.coveColor], colorTemperatureK: 2700,
            range: 2.5, beamDeg: 170, diffuse: .9, facing: 'up' });
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
