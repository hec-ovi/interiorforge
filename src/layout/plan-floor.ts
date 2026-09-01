import type { Point } from "../core/geom.js";
import { clipPolygonToRect, isCcw, polygonBounds } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import { createRng } from "../core/rng.js";
import type {
  BlueprintFloor, Door, FloorInterior, FloorKind, InteriorRequest, Room,
} from "../core/types.js";
import { CELL, DOOR, ELEVATOR } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { buildFrame, VENUE_KINDS } from "./frame.js";
import { furnish } from "./furnish.js";
import { validateAndRepair } from "./validate-floor.js";
import type { PlanDoor, PlanFurniture, PlanRoom } from "./plan-types.js";
import {
  attachOutsideDoors, fillCoreBacking, fillOfficeStrip, fillUnitStrip, fillVenue, idGen,
} from "./rooms.js";
import type { Axis, UvRect } from "./uv.js";
import { toUvPolygon, toWorldPoint } from "./uv.js";

export interface PlannedFloor {
  interior: FloorInterior;
  /** wall-aware walkable grid, world space */
  grid: WalkGrid;
}

export function planFloor(
  request: InteriorRequest, core: CorePlan, floor: BlueprintFloor, kind: FloorKind, isSpanUpper: boolean,
): PlannedFloor {
  const axis = core.axis;
  const uvOutline = toUvPolygon(floor.outline, axis);
  const ids = idGen(floor.index);
  const rng = createRng(request.seed, "floor", floor.index);

  if (isSpanUpper) {
    const b = polygonBounds(floor.outline);
    return {
      interior: {
        floor: floor.index, kind, elevation: floor.elevation, height: floor.height,
        core: coreToWorld(core, floor, []), rooms: [], furniture: [],
      },
      // upper half of a double-height space: no slab, nothing walkable
      grid: new WalkGrid([b.x, b.z], CELL, Math.ceil(b.w / CELL), Math.ceil(b.d / CELL)),
    };
  }

  const frame = buildFrame(core, floor);
  const isVenue = VENUE_KINDS.has(kind);

  const corridorRoom: PlanRoom = {
    id: `f${floor.index < 0 ? `m${-floor.index}` : floor.index}-corridor`,
    kind: isVenue ? "elevator_lobby" : "corridor",
    rect: frame.corridor,
    doors: [],
  };
  const rooms: PlanRoom[] = [corridorRoom];

  const backing = fillCoreBacking(core, frame, kind, ids, corridorRoom);
  rooms.push(...backing.rooms);

  if (isVenue) {
    rooms.push(...fillVenue(frame, corridorRoom, kind, rng, ids));
  } else if (kind === "office" || kind === "corpo_office") {
    rooms.push(...fillOfficeStrip(frame.south, "v1", corridorRoom, kind === "corpo_office", rng, ids, `f${floor.index}-s`));
    frame.northSegments.forEach((seg, i) => {
      rooms.push(...fillOfficeStrip(seg, "v0", corridorRoom, false, rng, ids, `f${floor.index}-n${i}`));
    });
  } else {
    rooms.push(...fillUnitStrip(frame.south, "v1", corridorRoom, kind, rng, ids, `f${floor.index}-s`));
    frame.northSegments.forEach((seg, i) => {
      rooms.push(...fillUnitStrip(seg, "v0", corridorRoom, kind, rng, ids, `f${floor.index}-n${i}`));
    });
  }

  // exterior doors (entrances, balcony doors) land on whichever room faces them
  const exteriorDoors = floor.openings
    .filter((o) => o.kind === "door" || o.kind === "balconyDoor")
    .map((o) => {
      const world = doorWorldPoint(floor, o.edge, o.offset + o.width / 2);
      const leaves = Math.min(4, Math.max(1, Math.round(o.width / DOOR.single))) as 1 | 2 | 3 | 4;
      return { at: toUvPolygon([world], axis)[0] as [number, number], width: o.width, leaves };
    });
  attachOutsideDoors(rooms, exteriorDoors, ids);

  const furniture = furnish(rooms, kind, rng, ids, uvOutline);

  const grid = validateAndRepair(
    floor.outline, rooms, furniture, backing.sealed, core, axis, floor.index, ids,
  );

  return {
    interior: {
      floor: floor.index, kind, elevation: floor.elevation, height: floor.height,
      core: coreToWorld(core, floor, backing.sealed),
      rooms: rooms.map((r) => roomToWorld(r, uvOutline, axis)),
      furniture: furniture.map((f) => furnitureToWorld(f, axis)),
    },
    grid,
  };
}

function doorWorldPoint(floor: BlueprintFloor, edge: number, along: number): Point {
  const p0 = floor.outline[edge]!;
  const p1 = floor.outline[(edge + 1) % floor.outline.length]!;
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  return [p0[0] + ((p1[0] - p0[0]) * along) / len, p0[1] + ((p1[1] - p0[1]) * along) / len];
}

function coreToWorld(core: CorePlan, floor: BlueprintFloor, sealed: UvRect[]): FloorInterior["core"] {
  const axis = core.axis;
  // rect edge indexes: 0 = zMin, 1 = xMax, 2 = zMax, 3 = xMin; core faces the corridor at uv v0
  const faceEdge = axis === "x" ? 0 : 3;
  const stairEntryA: Point = [core.stairA ? uvStairAEntryU(core) : 0, core.vFace - 0.6];
  const stairs = [{
    id: "stair-a",
    rect: core.stairA,
    style: core.stairStyle,
    entry: toWorldPoint(stairEntryA, axis),
  }];
  if (core.stairB) {
    const uv = { u: axis === "x" ? core.stairB.x : core.stairB.z, v: axis === "x" ? core.stairB.z : core.stairB.x };
    stairs.push({
      id: "stair-b",
      rect: core.stairB,
      style: core.stairStyle,
      entry: toWorldPoint([uv.u - 0.6, core.vFace - 1.25], axis),
    });
  }
  return {
    elevators: core.elevators.map((e) => ({ id: e.id, rect: e.rect, doorEdge: faceEdge as 0 | 1 | 2 | 3 })),
    stairs,
    shafts: [core.riser, ...sealed.map((s) => rectToWorld(s, axis))],
  };
}

function uvStairAEntryU(core: CorePlan): number {
  const uv = core.axis === "x"
    ? { u: core.stairA.x, lu: core.stairA.w }
    : { u: core.stairA.z, lu: core.stairA.d };
  return uv.u + uv.lu - 0.7;
}

function rectToWorld(r: UvRect, axis: Axis) {
  return axis === "x" ? { x: r.u, z: r.v, w: r.lu, d: r.lv } : { x: r.v, z: r.u, w: r.lv, d: r.lu };
}

function roomToWorld(room: PlanRoom, uvOutline: Point[], axis: Axis): Room {
  const clipped = clipPolygonToRect(uvOutline, {
    x: room.rect.u, z: room.rect.v, w: room.rect.lu, d: room.rect.lv,
  });
  const polyUv = clipped.length >= 3 ? clipped : rectPoly(room.rect);
  let polygon = polyUv.map((p) => toWorldPoint(p, axis));
  if (!isCcw(polygon)) polygon = polygon.reverse();
  return {
    id: room.id,
    kind: room.kind,
    polygon,
    ...(room.unit ? { unit: room.unit } : {}),
    doors: room.doors.map((d) => doorToWorld(d, room, axis)),
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

function doorToWorld(door: PlanDoor, room: PlanRoom, axis: Axis): Door {
  const alongU = door.edge === "v0" || door.edge === "v1";
  const uvAngle = alongU ? 0 : 90;
  const angleDeg = axis === "x" ? uvAngle : 90 - uvAngle;
  return {
    id: door.id,
    to: door.to,
    leaves: door.leaves,
    width: door.width,
    position: toWorldPoint(doorUvPoint(door, room), axis),
    angleDeg,
  };
}

function furnitureToWorld(f: PlanFurniture, axis: Axis) {
  const rotationDeg = axis === "x" ? f.rotationDeg : (f.rotationDeg + 90) % 360;
  return {
    id: f.id,
    kind: f.kind,
    room: f.room,
    position: toWorldPoint(f.at, axis),
    rotationDeg,
    size: f.size,
  };
}

/** Elevator wait point on the corridor side of a shaft, uv space. */
export function elevatorWaitUv(core: CorePlan, elevatorIndex: number): Point {
  const rect = core.elevators[elevatorIndex]!.rect;
  const u = (core.axis === "x" ? rect.x : rect.z) + ELEVATOR.shaft / 2;
  return [u, core.vFace - 0.8];
}
