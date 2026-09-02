import type { Point } from "../core/geom.js";
import { clipPolygonToRect, isCcw, polygonBounds } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import { createRng } from "../core/rng.js";
import type {
  BlueprintFloor, Door, FloorInterior, FloorKind, InteriorRequest, Room,
} from "../core/types.js";
import { CELL, ceilingClear, DOOR, ELEVATOR, ROOM } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { stairAccess } from "./core-plan.js";
import { buildFrame, HALL_FLOOR_KINDS, VENUE_KINDS } from "./frame.js";
import { furnish } from "./furnish.js";
import { planLights } from "./lighting.js";
import { alignPartitionsToPiers } from "./pier-align.js";
import { fitPartitionsToGrid } from "./tile-fit.js";
import type { PlanDoor, PlanFurniture, PlanRoom } from "./plan-types.js";
import {
  attachOutsideDoors, clipRatio, fillCoreBacking, fillOfficeStrip, fillServiceSegment,
  fillShopStrip, fillUnitStrip, fillVenue, idGen,
} from "./rooms.js";
import { floorBounds } from "./shell.js";
import type { Frame, UvRect } from "./uv.js";
import { toWorldPolygon, uvRectToFrameRect, uvToWorld, worldToUv } from "./uv.js";
import { validateAndRepair } from "./validate-floor.js";

/** uv-space working data a floor keeps for geometry and npc passes */
export interface UvFloorData {
  outline: Point[];
  rooms: PlanRoom[];
  furniture: PlanFurniture[];
  sealed: UvRect[];
}

export interface PlannedFloor {
  interior: FloorInterior;
  /** wall-aware walkable grid, world space */
  grid: WalkGrid;
  uv: UvFloorData;
}

export function planFloor(
  request: InteriorRequest, core: CorePlan, floor: BlueprintFloor, kind: FloorKind,
  isSpanUpper: boolean, spaceHeight: number,
): PlannedFloor {
  const frame = core.frame;
  const uvOutline = floor.outline.map((p) => worldToUv(p, frame));
  const bounds = floorBounds(uvOutline, request.blueprint.facade);
  const ids = idGen(floor.index);
  const rng = createRng(request.seed, "floor", floor.index);

  if (isSpanUpper) {
    const b = polygonBounds(floor.outline);
    return {
      interior: {
        floor: floor.index, kind, elevation: floor.elevation, height: floor.height,
        coreAngleDeg: frame.angleDeg,
        core: coreToWorld(core, []), rooms: [], furniture: [], lights: [],
      },
      // upper half of a double-height space: no slab, nothing walkable
      grid: new WalkGrid([b.x, b.z], CELL, Math.ceil(b.w / CELL), Math.ceil(b.d / CELL)),
      uv: { outline: uvOutline, rooms: [], furniture: [], sealed: [] },
    };
  }

  const floorFrame = buildFrame(core, floor);
  const isHall = HALL_FLOOR_KINDS.has(kind);
  const isMall = kind === "mall_floor";
  const isOffice = kind === "office" || kind === "corpo_office";

  // strip segments with no corridor contact (e.g. behind the inline stair) are enclaves:
  // sealed service voids, never rooms
  const extraSealed: UvRect[] = [];
  const corridorU = floorFrame.corridor;
  floorFrame.northSegments = floorFrame.northSegments.filter((seg) => {
    const contact = Math.min(seg.u + seg.lu, corridorU.u + corridorU.lu) - Math.max(seg.u, corridorU.u);
    if (contact < 1.6) {
      extraSealed.push(seg);
      return false;
    }
    return true;
  });

  const corridorRoom: PlanRoom = {
    id: `f${floor.index < 0 ? `m${-floor.index}` : floor.index}-corridor`,
    kind: isMall ? "concourse" : VENUE_KINDS.has(kind) ? "elevator_lobby" : "corridor",
    rect: floorFrame.corridor,
    doors: [],
  };
  let rooms: PlanRoom[] = [corridorRoom];

  const backing = fillCoreBacking(core, floorFrame, kind, ids, corridorRoom, uvOutline);
  rooms.push(...backing.rooms);

  // one strip of the floor: offices, shop units or homes, by floor kind
  const fillStrip = (seg: UvRect, side: "v0" | "v1", unit: string, corpo = false): void => {
    if (isOffice) {
      rooms.push(...fillOfficeStrip(seg, side, corridorRoom, corpo, rng, ids, unit));
      return;
    }
    const fill = isMall
      ? fillShopStrip(seg, side, corridorRoom, rng, ids, unit, uvOutline)
      : fillUnitStrip(seg, side, corridorRoom, kind, rng, ids, unit, uvOutline);
    rooms.push(...fill.rooms);
    extraSealed.push(...fill.sealed);
  };

  if (isHall) {
    rooms.push(...fillVenue(floorFrame, corridorRoom, kind, rng, ids));
  } else {
    fillStrip(floorFrame.south, "v1", `f${floor.index}-s`, kind === "corpo_office");
    // segments too shallow for units or offices carry shared service rooms off the corridor
    floorFrame.northSegments.forEach((seg, i) => {
      if (seg.lv < ROOM.minStripDepth) {
        const service = fillServiceSegment(seg, corridorRoom, ids, uvOutline);
        if (service.length > 0) rooms.push(...service);
        else extraSealed.push(seg);
        return;
      }
      fillStrip(seg, "v0", `f${floor.index}-n${i}`);
    });
  }

  // rooms mostly outside an irregular outline are void: drop them and their doors
  const dropped = new Set(
    rooms.filter((r) => r !== corridorRoom && clipRatio(r.rect, uvOutline) < 0.35).map((r) => r.id),
  );
  if (dropped.size > 0) {
    rooms = rooms.filter((r) => !dropped.has(r.id));
    for (const r of rooms) r.doors = r.doors.filter((d) => !dropped.has(d.to));
  }

  // partitions must not cut a window: wall lines slide onto the piers between openings
  alignPartitionsToPiers(rooms, [...backing.sealed, ...extraSealed], floor, core, uvOutline);
  // then onto the interior grid, half the exterior panel, counted from the outline's corner
  fitPartitionsToGrid(rooms, [...backing.sealed, ...extraSealed], floor, core, uvOutline);

  // exterior doors (entrances, balcony doors) land on whichever room faces them
  const exteriorDoors = floor.openings
    .filter((o) => o.kind === "door" || o.kind === "balconyDoor")
    .map((o) => {
      const world = doorWorldPoint(floor, o.edge, o.offset + o.width / 2);
      const leaves = Math.min(4, Math.max(1, Math.round(o.width / DOOR.single))) as 1 | 2 | 3 | 4;
      return { at: worldToUv(world, frame) as [number, number], width: o.width, leaves };
    });
  attachOutsideDoors(rooms, exteriorDoors, ids);

  const furniture = furnish(rooms, kind, rng, ids, bounds);

  const sealed = [...backing.sealed, ...extraSealed.filter((s) => clipRatio(s, uvOutline) > 0.05)];
  const grid = validateAndRepair(
    floor.outline, bounds, rooms, furniture, sealed, core, floor.index, ids,
  );

  return {
    interior: {
      floor: floor.index, kind, elevation: floor.elevation, height: floor.height,
      coreAngleDeg: frame.angleDeg,
      core: coreToWorld(core, sealed),
      rooms: rooms.map((r) => roomToWorld(r, uvOutline, frame)),
      furniture: furniture.map((f) => furnitureToWorld(f, frame)),
      lights: planLights(rooms, core, bounds.inner, floor.elevation + ceilingClear(spaceHeight), floor.elevation + spaceHeight / 2, ids),
    },
    grid,
    uv: { outline: uvOutline, rooms, furniture, sealed },
  };
}

function doorWorldPoint(floor: BlueprintFloor, edge: number, along: number): Point {
  const p0 = floor.outline[edge]!;
  const p1 = floor.outline[(edge + 1) % floor.outline.length]!;
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  return [p0[0] + ((p1[0] - p0[0]) * along) / len, p0[1] + ((p1[1] - p0[1]) * along) / len];
}

/** Frame-space stair entry points, exported for nav and validation. */
export function stairEntryUv(core: CorePlan, stair: "a" | "b"): Point {
  return stairAccess(core, stair).entry;
}

/** Frame-space elevator wait point in front of a shaft. */
export function elevatorWaitUv(core: CorePlan, elevatorIndex: number): Point {
  const rect = core.elevators[elevatorIndex]!.rect;
  return [rect.u + ELEVATOR.shaft / 2, core.vFace - 0.8];
}

function coreToWorld(core: CorePlan, sealed: UvRect[]): FloorInterior["core"] {
  const frame = core.frame;
  const stairs = [{
    id: "stair-a",
    rect: uvRectToFrameRect(core.stairA, frame),
    style: core.stairStyle,
    entry: uvToWorld(stairEntryUv(core, "a"), frame),
  }];
  if (core.stairB) {
    stairs.push({
      id: "stair-b",
      rect: uvRectToFrameRect(core.stairB, frame),
      style: core.stairStyle,
      entry: uvToWorld(stairEntryUv(core, "b"), frame),
    });
  }
  return {
    // door edge 0 = the frame's low-v side, always the corridor face
    elevators: core.elevators.map((e) => ({ id: e.id, rect: uvRectToFrameRect(e.rect, frame), doorEdge: 0 as const })),
    stairs,
    shafts: [uvRectToFrameRect(core.riser, frame), ...sealed.map((s) => uvRectToFrameRect(s, frame))],
  };
}

function roomToWorld(room: PlanRoom, uvOutline: Point[], frame: Frame): Room {
  const clipped = clipPolygonToRect(uvOutline, {
    x: room.rect.u, z: room.rect.v, w: room.rect.lu, d: room.rect.lv,
  });
  const polyUv = clipped.length >= 3 ? clipped : rectPoly(room.rect);
  let polygon = toWorldPolygon(polyUv, frame).map(roundPoint);
  if (!isCcw(polygon)) polygon = polygon.reverse();
  return {
    id: room.id,
    kind: room.kind,
    polygon,
    ...(room.unit ? { unit: room.unit } : {}),
    doors: room.doors.map((d) => doorToWorld(d, room, frame)),
  };
}

function rectPoly(r: UvRect): Point[] {
  return [[r.u, r.v], [r.u + r.lu, r.v], [r.u + r.lu, r.v + r.lv], [r.u, r.v + r.lv]];
}

export function doorUvPoint(door: PlanDoor, room: PlanRoom): Point {
  const r = room.rect;
  switch (door.edge) {
    case "v0": return [door.at, r.v];
    case "v1": return [door.at, r.v + r.lv];
    case "u0": return [r.u, door.at];
    case "u1": return [r.u + r.lu, door.at];
  }
}

function doorToWorld(door: PlanDoor, room: PlanRoom, frame: Frame): Door {
  const alongU = door.edge === "v0" || door.edge === "v1";
  const uvAngle = alongU ? 0 : 90;
  return {
    id: door.id,
    to: door.to,
    leaves: door.leaves,
    width: door.width,
    position: roundPoint(uvToWorld(doorUvPoint(door, room), frame)),
    angleDeg: norm360(uvAngle + frame.angleDeg),
  };
}

function furnitureToWorld(f: PlanFurniture, frame: Frame) {
  return {
    id: f.id,
    kind: f.kind,
    room: f.room,
    position: roundPoint(uvToWorld(f.at, frame)),
    rotationDeg: norm360(f.rotationDeg + frame.angleDeg),
    size: f.size,
    ...(f.elevation === undefined ? {} : { elevation: f.elevation }),
  };
}

function norm360(deg: number): number {
  return Math.round(((deg % 360) + 360) % 360 * 100) / 100;
}

function roundPoint([x, z]: Point): Point {
  return [Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000];
}
