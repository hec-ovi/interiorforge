import { assertDoorwaysClear, floorDoorways, openFrontClearances } from '../geometry/door-clear.js';
import type { BlueprintFloor, FloorKind, InteriorRequest, RoomKind } from '../core/types.js';
import type { RoofAccessPlan } from '../layout/roof-access.js';
import { baseLanding, entryAtLowEnd } from '../geometry/stairs.js';
import type { BuildingPlan } from '../layout/index.js';
import { roomArea, roomPolygon } from '../layout/room-shape.js';
import { balanceIllumination } from '../layout/lighting.js';
import { uvToWorld, type UvRect } from '../layout/uv.js';
import { constructionPlate, shellWallDepth } from '../layout/shell.js';
import { assertInsideShell } from '../geometry/shell-fit.js';
import { stairClearance } from '../geometry/stair-clearance.js';
import { InteriorError } from '../core/errors.js';
import { PlacementBuilder } from './builder.js';
import { familyOf, roomFinish, type RoomFinish } from './finish.js';
import { ceiling, rectangles, slabs, surface, uncoveredRects } from './surfaces.js';
import { walls } from './walls.js';
import { openings } from './openings.js';
import { stairs, stairLandingRect } from './stairs.js';
import { props } from './props.js';
import { dressDamagedRooms } from '../styles/damaged/dressing.js';
import { placeIndustrialEquipmentFeeds } from '../styles/industrial/feeds.js';
import { luxuryRugForRoom } from '../styles/luxury/rugs.js';
import { dressCorporateWalls } from '../styles/corporate/walls.js';
import { dressCapsuleArchitecture } from '../styles/capsule/architecture.js';
import { capsuleProfile } from '../styles/capsule/profile.js';
import type { ModelPresence } from '../assets/families.js';
import { architectureFinish, interiorRecipe } from '../architecture/recipes.js';
import { WALL } from '../layout/constants.js';
import { subtractRect, thresholds, walkingSlabs } from './thresholds.js';
import { lifts } from './lifts.js';
import { duplexVoids, duplexCeilingRects, duplexGalleryEdges, placeDuplexStructure } from './duplex.js';
import { LOFT1702_FINISH, loft1702Finish, placeLoft1702GalleryFascia } from '../styles/luxury/loft-finish.js';
import { placeDuplexLivingFloor } from './duplex-finish.js';
import { boundaryDistance, polygonBounds } from '../core/geom.js';
import { worldToUv } from '../layout/uv.js';
import type { LevelZone, LightFixture, Room, StyleId } from '../core/types.js';
import type { PlanRoom } from '../layout/plan-types.js';
import { gridOrigin } from '../layout/tile-fit.js';
import { placeBulkheadSides } from '../styles/systems/levels.js';
import { subtractAll } from '../styles/systems/surface-grid.js';
import { isLoftRequest } from '../styles/reference/kinds.js';
import { HOUSINGS, STYLES } from '../styles/reference/registry.js';
import { placeHousings } from '../styles/systems/housing.js';
import type { DressContext, StyleSpec, SurfaceRoom } from '../styles/systems/types.js';

/** Reference fields a planned room carries once the template layer stamps them. */
type StyledPlanRoom = PlanRoom & { style?: StyleId; ceilingDrop?: number; levels?: LevelZone[] };

export function placeLayout(plan: BuildingPlan, bp: BlueprintFloor, request: InteriorRequest, models: ModelPresence, climb: number, roof?: RoofAccessPlan | null, shared: readonly BlueprintFloor[] = [bp]): PlacementBuilder {
    const floor = plan.floors.find(f => f.floor === bp.index)!, uv = plan.uvFloors.get(bp.index)!, core = plan.core;
    const builder = new PlacementBuilder();
    const ceilingY = floor.ceilingElevation - floor.elevation;
    const plate = constructionPlate(bp, core.frame, shellWallDepth(request.blueprint.facade));
    const family = familyOf(request.building.type, request.building.tier);
    const kinds = new Map<string, RoomKind>(floor.rooms.map(room => [room.id, room.kind]));
    const common = floor.rooms.find(room => room.kind === 'corridor' || room.kind === 'elevator_lobby' || room.kind === 'concourse')!;
    const duplexUnits = new Set((floor.duplexes ?? []).map(slice => slice.unit));
    const loftRooms = new Set(isLoftRequest(request)
        ? floor.rooms.filter(room => room.unit && duplexUnits.has(room.unit)).map(room => room.id) : []);
    // A room wearing a registered reference style is finished by it, over the family base.
    const published = new Map<string, Room>(floor.rooms.map(room => [room.id, room]));
    const planned = new Map<string, StyledPlanRoom>(uv.rooms.map(room => [room.id, room as StyledPlanRoom]));
    // The stairwells are published later as common rooms: their walls wear the common style.
    const styleOfRoom = (room: string): StyleSpec | undefined => {
        const own = (id: string) => published.get(id)?.style ?? planned.get(id)?.style;
        const id = own(room) ?? (/^stair-[ab]$/.test(room) ? own(common.id) : undefined);
        return id ? STYLES.get(id) : undefined;
    };
    const finishOf = (room: string, kind: RoomKind = kinds.get(room) ?? common.kind): RoomFinish => {
        const style = styleOfRoom(room);
        const base = loft1702Finish(kind, architectureFinish(request, family, kind, roomFinish(family, kind, floor.kind as FloorKind), !!style),
            { privateRoom: loftRooms.has(room) });
        if (!style) return base;
        const styled = style.finish(kind, floor.kind as FloorKind, base);
        return { ...styled, style: style.id, spot: style.lights?.spot ?? styled.spot, cove: style.lights?.cove ?? styled.cove };
    };
    const tag = `f${bp.index < 0 ? `m${-bp.index}` : bp.index}`;

    const floorRects = uv.rooms.map(room => ({ room, rects: rectangles(roomPolygon(room, plate), room.holes) }));
    // The whole room each surface system phases to, at its own ceiling height: a template
    // room's ceilingDrop never takes a facade room's ceiling below its highest window head.
    const grid = gridOrigin(uv.outline);
    const head = Math.max(0, ...shared.flatMap(level => level.openings.map(opening => opening.sill + opening.height)));
    const surfaceRooms = new Map<string, SurfaceRoom>(floorRects.map(({ room }) => {
        const polygon = roomPolygon(room, plate), b = polygonBounds(polygon), styled = planned.get(room.id)!;
        const facade = polygon.some(point => boundaryDistance(point, plate) < .3);
        const drop = Math.max(0, facade ? Math.min(styled.ceilingDrop ?? 0, ceilingY - head) : styled.ceilingDrop ?? 0);
        const style = published.get(room.id)?.style ?? styled.style;
        return [room.id, {
            id: room.id, kind: room.kind, ...(style ? { style } : {}), polygon, ...(room.holes ? { holes: room.holes } : {}),
            bounds: { u: b.x, v: b.z, lu: b.w, lv: b.d }, gridOrigin: grid, ceilingY, soffitY: bp.height, elevation: floor.elevation,
            ...(styled.levels?.length ? { levels: styled.levels } : {}), ...(drop > 0 ? { ceilingDrop: drop } : {}),
        }];
    }));
    // Planned fixtures follow their room's style: its light colour, its own coves or none,
    // and a lowered ceiling.
    const styledLights = (lights: LightFixture[]) => lights.filter(light => light.furniture || light.kind !== 'cove'
        || styleOfRoom(light.room)?.lights?.plannedCoves !== false);
    floor.lights = styledLights(floor.lights);
    for (const { room, rects } of floorRects) {
        const finish = finishOf(room.id, room.kind), whole = surfaceRooms.get(room.id)!;
        const own = floor.lights.filter(light => !light.furniture && light.room === room.id);
        for (const rect of rects) {
            if (loftRooms.has(room.id) && room.kind === 'living')
                placeDuplexLivingFloor(builder, room.id, rect, uv.carpets.filter(carpet => carpet.room === room.id).map(carpet => carpet.rect), core.frame);
            else floor.lights.push(...slabs(builder, finish.floor, room.id, rect, 0, core.frame, whole));
            const bulkheads = planned.get(room.id)?.bulkheads ?? [];
            for (const part of duplexCeilingRects(floor, core.frame, rect)) {
                for (const open of subtractAll(part, bulkheads.map(item => item.rect)))
                    floor.lights.push(...ceiling(builder, finish, room.id, open, ceilingY, core.frame, whole, own));
                for (const bulkhead of bulkheads) {
                    const under = clipUv(part, bulkhead.rect);
                    if (under) floor.lights.push(...ceiling(builder, finish, room.id, under, ceilingY - bulkhead.drop, core.frame, whole, []));
                }
            }
        }
    }
    const plain = finishOf(common.id);
    for (const rect of uv.sealed) {
        surface(builder, plain.floor, 'sealed', rect, 0, core.frame);
        surface(builder, plain.ceiling, 'sealed', rect, ceilingY, core.frame);
    }
    for (const carpet of uv.carpets) surface(builder,
        loftRooms.has(carpet.room) && kinds.get(carpet.room) === 'living' ? LOFT1702_FINISH.rug
            : family === 'luxury' ? luxuryRugForRoom(kinds.get(carpet.room) ?? common.kind) : 'floor-carpet',
        carpet.room, carpet.rect, 0, core.frame);

    // Every fixture the floor plan lit stands before the walls add their own lines.
    // Architectural coves follow actual opaque wall/ceiling junctions below;
    // generic room-perimeter lines would float over the open lounge void.
    floor.lights = floor.lights.filter(light => light.kind !== 'cove' || light.furniture || !loftRooms.has(light.room));
    const plannedLights = floor.lights.filter(light => !light.furniture);
    if (['steel', 'graphite'].includes(interiorRecipe(request)?.frame ?? '')) {
        for (const light of plannedLights) { light.colorTemperatureK = 4000; delete light.color; }
    }
    // A bulkhead under a pit above: its sides face the room, and the lights under it hang lower.
    for (const room of uv.rooms) for (const bulkhead of room.bulkheads ?? []) {
        const whole = surfaceRooms.get(room.id);
        if (whole) placeBulkheadSides(builder, whole, bulkhead, ceilingY - (whole.ceilingDrop ?? 0), core.frame);
    }
    for (const light of plannedLights) {
        const bulkhead = uv.rooms.find(room => room.id === light.room)?.bulkheads?.find(item => {
            const [u, v] = worldToUv([light.position[0], light.position[2]], core.frame);
            return u > item.rect.u && u < item.rect.u + item.rect.lu && v > item.rect.v && v < item.rect.v + item.rect.lv;
        });
        if (bulkhead) light.position[1] -= bulkhead.drop;
        const style = styleOfRoom(light.room)?.lights, drop = surfaceRooms.get(light.room)?.ceilingDrop ?? 0;
        if (style?.kelvin) light.colorTemperatureK = style.kelvin;
        if (style?.color) light.color = [...style.color];
        if (drop > 0) light.position[1] -= drop;
    }
    floor.lights.push(...walls(builder, floor, uv, core, bp, request, finishOf, tag, shared));
    for (const slice of floor.duplexes ?? []) if (slice.level === 'upper') {
        const room = `${slice.unit}-upper-gallery`;
        for (const [i, edge] of duplexGalleryEdges(slice, core.frame).entries())
            floor.lights.push(...placeLoft1702GalleryFascia(builder, room, edge.a, edge.b, 0, core.frame,
                { normal: [-edge.inward[0], -edge.inward[1]], elevation: floor.elevation, id: `${slice.id}-gallery-fascia-${i}` }));
    }
    // Furniture keeps the lens records of the lit modules it stands as, and no others.
    props(builder, floor, uv, family, models, request);
    if (family === 'industrial') placeIndustrialEquipmentFeeds(builder, floor);
    if (family === 'corporate') dressCorporateWalls(builder, floor);
    if (family === 'capsule' && request.building.interiorStyle !== 'sandra-dorsett')
        dressCapsuleArchitecture(builder, floor, capsuleProfile(request));
    if (family === 'damaged') dressDamagedRooms(builder, floor, uv, core, bp);
    // Each reference style present dresses its own rooms: housings, trims, signage.
    for (const style of STYLES.values()) {
        const rooms = floor.rooms.filter(room => styleOfRoom(room.id) === style);
        if (!rooms.length) continue;
        const context: DressContext = { builder, floor, uv, core, bp, request, rooms, ceilingY, frame: core.frame };
        if (style.dress) floor.lights.push(...style.dress(context));
        for (const id of style.housings ?? []) {
            const housing = HOUSINGS.get(id);
            if (housing) floor.lights.push(...placeHousings(context, housing));
        }
    }
    // Every record the room publishes is in now, so each luminaire takes the share that
    // lands the room in its kind's illuminance band.
    balanceIllumination(uv.rooms.map(room => ({ id: room.id, kind: room.kind, area: roomArea(room, plate) })), floor.lights, request.building.tier);
    openings(builder, bp, floor, request, 'doors', room => finishOf(room).floor);
    const lowest = bp.index === Math.min(...request.blueprint.floors.map(f => f.index));
    const stairFloor = family === 'luxury' ? 'floor-slab-stair-luxury' : plain.floor;
    const runs = stairs(builder, core, climb, stairFloor, !!roof, lowest, family, { fixtures: floor.lights, elevation: floor.elevation });
    // Close the stairwell ceiling wherever this shaft has no onward flight.
    for (const [id, shaft] of [['stair-a', core.stairA], ...(core.stairB ? [['stair-b', core.stairB] as const] : [])] as const) {
        if (climb && (!roof || id === 'stair-a')) continue;
        surface(builder, plain.ceiling, id, { u: shaft.u + WALL / 2, v: shaft.v + WALL / 2,
            lu: shaft.lu - WALL, lv: shaft.lv - WALL }, ceilingY, core.frame);
    }
    if (roof) {
        const landing = baseLanding(core.stairA, entryAtLowEnd(core, 'a'), climb);
        const structuralLanding = stairLandingRect(core.stairA, landing);
        // The arriving flight owns this landing; only the roof-door extension
        // is added here, so there are no coincident top or soffit faces.
        const rect = roof.landingUv;
        for (const uncovered of subtractRect({ u: rect.x, v: rect.z, lu: rect.w, lv: rect.d }, structuralLanding))
            surface(builder, stairFloor, 'stair-a', uncovered, climb, core.frame);
    }
    floor.lights.push(...lifts(builder, core, plain.floor, common.id, Math.min(...request.blueprint.floors.map(f => f.height)), bp.height, floor.elevation,
        styleOfRoom(common.id)?.lift));
    const incomingLandings = lowest ? [] : [core.stairA, ...(core.stairB ? [core.stairB] : [])]
        .map((shaft, i) => stairLandingRect(shaft, baseLanding(shaft, entryAtLowEnd(core, i === 0 ? 'a' : 'b'), 0)));
    thresholds(builder, core.frame, room => finishOf(room).floor, incomingLandings);
    // A leftover thinner than a body, beside the core or between rooms, lies inside the
    // rectangle the rooms and core stand in, where consumers cut their storey plate: it takes
    // the slab and plain ceiling field of the room along its longest side.
    const shafts = [core.stairA, ...(core.stairB ? [core.stairB] : []), core.riser, ...core.elevators.map(e => e.rect),
        ...duplexVoids(floor, core.frame, 'upper')];
    const standing = [...floorRects.flatMap(({ rects }) => rects), ...uv.sealed, ...shafts];
    const envelope = boundsOf(standing);
    for (const rect of envelope ? uncoveredRects(envelope, [...walkingSlabs(builder, core.frame), ...shafts], plate) : []) {
        const owner = floorRects.map(({ room, rects }) => ({ room, side: Math.max(0, ...rects.map(other => sharedSide(rect, other))) }))
            .sort((a, b) => b.side - a.side)[0];
        const room = owner && owner.side > 0 ? owner.room : common, finish = finishOf(room.id, room.kind);
        floor.lights.push(...slabs(builder, finish.floor, room.id, rect, 0, core.frame));
        for (const part of duplexCeilingRects(floor, core.frame, rect)) {
            if (loftRooms.has(room.id)) floor.lights.push(...ceiling(builder, finish, room.id, part, ceilingY, core.frame));
            else surface(builder, finish.ceiling, room.id, part, ceilingY - (surfaceRooms.get(room.id)?.ceilingDrop ?? 0), core.frame);
        }
    }
    for (const slice of floor.duplexes ?? []) {
        const room = `${slice.unit}-${slice.level}-${slice.level === 'lower' ? 'living' : 'gallery'}`;
        placeDuplexStructure(builder, slice, room);
        if (slice.level === 'upper') for (const [index, ring] of [...slice.loungeVoids, slice.stairOpening].entries()) {
            const b = polygonBounds(ring.map(point => worldToUv(point, core.frame))), air = `${slice.id}-air-${index}`;
            floor.lights.push(...ceiling(builder, finishOf(air, 'living'), air, { u: b.x, v: b.z, lu: b.w, lv: b.d }, ceilingY, core.frame));
        }
    }
    for (const light of plannedLights) {
        const finish = finishOf(light.room), position: [number, number, number] = [light.position[0], light.position[1] - floor.elevation, light.position[2]];
        const rotation = -light.angleDeg * Math.PI / 180;
        if (light.kind === 'spot') builder.module(finish.spot, light.room, position, [1, 1, 1], rotation, { id: light.id });
        else builder.module(light.kind === 'cove' ? finish.cove : 'ceiling-led-strip', light.room, position, [Math.max(.5, light.length) / .5, 1, 1], rotation, { id: light.id });
    }
    for (const [id, steps] of runs) {
        const shaft = id === 'stair-a' ? core.stairA : core.stairB!;
        const probe = stairClearance(shaft, core.frame, steps, [builder.mesh]);
        if (probe.clear < 2.1 - 1e-4)
            throw new InteriorError('E_UNREACHABLE_SPACE', `${id} has ${probe.clear.toFixed(3)} m headroom at ${probe.step.y} below ${probe.material} at ${probe.at?.join(",")}`, bp.index);
    }
    assertDoorwaysClear(builder.mesh, [...floorDoorways(uv.rooms, core.frame, 0, ceilingY, bp), ...openFrontClearances({ ...bp, elevation: 0 }, shellWallDepth(request.blueprint.facade))], bp.index);
    assertInsideShell(builder.mesh, [{ ...bp, elevation: 0 }], shellWallDepth(request.blueprint.facade));
    const connectorIds = new Set([...floor.core.stairs, ...floor.core.elevators].map(item => item.id));
    for (const placement of builder.placements) {
        if (connectorIds.has(placement.room))
            placement.connector = placement.room;
        if (!kinds.has(placement.room))
            placement.room = common.id;
    }
    return builder;
}

function boundsOf(rects: readonly UvRect[]): UvRect | null {
    if (!rects.length) return null;
    const u = Math.min(...rects.map(r => r.u)), v = Math.min(...rects.map(r => r.v));
    return { u, v, lu: Math.max(...rects.map(r => r.u + r.lu)) - u, lv: Math.max(...rects.map(r => r.v + r.lv)) - v };
}

/** How long a side two rectangles share, zero when they only meet at a corner or not at all. */
function sharedSide(a: UvRect, b: UvRect): number {
    const along = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
    const touchU = Math.abs(a.u + a.lu - b.u) < 1e-6 || Math.abs(b.u + b.lu - a.u) < 1e-6;
    const touchV = Math.abs(a.v + a.lv - b.v) < 1e-6 || Math.abs(b.v + b.lv - a.v) < 1e-6;
    return Math.max(touchU ? along(a.v, a.v + a.lv, b.v, b.v + b.lv) : 0, touchV ? along(a.u, a.u + a.lu, b.u, b.u + b.lu) : 0);
}

function clipUv(a: UvRect, b: UvRect): UvRect | null {
    const u0 = Math.max(a.u, b.u), u1 = Math.min(a.u + a.lu, b.u + b.lu), v0 = Math.max(a.v, b.v), v1 = Math.min(a.v + a.lv, b.v + b.lv);
    return u1 - u0 > 1e-3 && v1 - v0 > 1e-3 ? { u: u0, v: v0, lu: u1 - u0, lv: v1 - v0 } : null;
}
