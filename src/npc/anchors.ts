import type { Point } from "../core/geom.js";
import { polygonBounds, pointInPolygon } from "../core/geom.js";
import type { WalkGrid } from "../core/grid.js";
import type { Anchor, AnchorKind, FloorInterior, Furniture } from "../core/types.js";
import type { CorePlan } from "../layout/index.js";
import { elevatorWaitUv } from "../layout/index.js";
import { uvToWorld } from "../layout/uv.js";

const APPROACH = 0.9; // an anchor needs a walkable cell within this radius

/** Facing unit vector for a furniture rotation (0 faces +z). */
export function facingOf(rotationDeg: number): Point {
  const rad = (rotationDeg * Math.PI) / 180;
  return [Math.sin(rad), Math.cos(rad)];
}

const FURNITURE_ANCHORS: Record<string, { kind: AnchorKind; side: "front" | "behind" | "on" }> = {
  desk: { kind: "work_spot", side: "front" },
  reception_desk: { kind: "counter_spot", side: "behind" },
  bar_counter: { kind: "counter_spot", side: "behind" },
  counter: { kind: "counter_spot", side: "behind" },
  bed_double: { kind: "bed", side: "on" },
  bed_single: { kind: "bed", side: "on" },
  toilet: { kind: "toilet", side: "front" },
  gym_machine: { kind: "machine_spot", side: "front" },
  dining_table: { kind: "seat", side: "front" },
  sofa: { kind: "seat", side: "on" },
  bench: { kind: "seat", side: "on" },
  meeting_table: { kind: "seat", side: "front" },
  kitchen_block: { kind: "work_spot", side: "front" },
};

export function floorAnchors(
  floor: FloorInterior, grid: WalkGrid, visited: Uint8Array, roomCenters: Map<string, Point>,
): Anchor[] {
  const anchors: Anchor[] = [];
  let n = 0;
  const tag = floor.floor < 0 ? `m${-floor.floor}` : `${floor.floor}`;
  const add = (kind: AnchorKind, room: string, position: Point, facingDeg: number, furniture?: string) => {
    // validate the exact exported position: rounding may shift the pathfinder's snap cell
    const exported: Point = [round2(position[0]), round2(position[1])];
    if (!hasApproach(grid, visited, exported)) return;
    anchors.push({
      id: `f${tag}-a${n++}`, floor: floor.floor, room, kind,
      position: exported, facingDeg, ...(furniture ? { furniture } : {}),
    });
  };

  // furniture-driven spots
  for (const f of floor.furniture) {
    const spec = FURNITURE_ANCHORS[f.kind];
    if (!spec) continue;
    const facing = facingOf(f.rotationDeg);
    const depth = f.size[1];
    if (spec.side === "on") {
      add(spec.kind, f.room, f.position, f.rotationDeg, f.id);
    } else if (spec.side === "front") {
      const p: Point = [f.position[0] + facing[0] * (depth / 2 + 0.4), f.position[1] + facing[1] * (depth / 2 + 0.4)];
      add(spec.kind, f.room, p, (f.rotationDeg + 180) % 360, f.id);
    } else {
      const p: Point = [f.position[0] - facing[0] * (depth / 2 + 0.45), f.position[1] - facing[1] * (depth / 2 + 0.45)];
      add(spec.kind, f.room, p, f.rotationDeg, f.id);
    }
  }

  for (const room of floor.rooms) {
    const center = roomCenters.get(room.id) ?? fallbackCenter(room.polygon);
    // entrances at exterior doors
    for (const door of room.doors) {
      if (door.to !== "outside") continue;
      const inward = inwardOf(door.position, center);
      add("entrance", room.id, [door.position[0] + inward[0] * 0.8, door.position[1] + inward[1] * 0.8],
        angleOf(inward), undefined);
    }
    // idle spots in social rooms, patrol points in public ones
    if (["living", "lounge", "reception", "office_open", "dining_area", "gym_floor", "studio_main", "terrace_open"].includes(room.kind)) {
      if (pointInPolygon(center, room.polygon)) add("idle_spot", room.id, center, 0);
    }
    if (room.kind === "corridor" || room.kind === "elevator_lobby") {
      add("patrol_point", room.id, center, 0);
      add("cleaning_spot", room.id, center, 180);
    }
    if (room.kind === "reception" || room.kind === "parking_area") {
      add("patrol_point", room.id, center, 45);
    }
  }
  return anchors;
}

function fallbackCenter(polygon: Point[]): Point {
  const b = polygonBounds(polygon);
  return [b.x + b.w / 2, b.z + b.d / 2];
}

/** Elevator waits and stair entries come from the core, one per floor. */
export function coreAnchors(
  floor: FloorInterior, grid: WalkGrid, visited: Uint8Array, corridorRoomId: string, core: CorePlan,
): Anchor[] {
  const anchors: Anchor[] = [];
  const tag = floor.floor < 0 ? `m${-floor.floor}` : `${floor.floor}`;
  let n = 0;
  // wait anchors face the frame's +v direction (into the shaft doors)
  const intoCore = norm360(-core.frame.angleDeg);
  core.elevators.forEach((_, i) => {
    const p = uvToWorld(elevatorWaitUv(core, i), core.frame);
    const exported: Point = [round2(p[0]), round2(p[1])];
    if (!hasApproach(grid, visited, exported)) return;
    anchors.push({
      id: `f${tag}-c${n++}`, floor: floor.floor, room: corridorRoomId, kind: "elevator_wait",
      position: exported, facingDeg: intoCore,
    });
  });
  for (const stair of floor.core.stairs) {
    const exported: Point = [round2(stair.entry[0]), round2(stair.entry[1])];
    if (!hasApproach(grid, visited, exported)) continue;
    anchors.push({
      id: `f${tag}-c${n++}`, floor: floor.floor, room: corridorRoomId, kind: "stair_entry",
      position: exported, facingDeg: intoCore,
    });
  }
  return anchors;
}

function norm360(deg: number): number {
  return Math.round(((deg % 360) + 360) % 360 * 100) / 100;
}

/** The pathfinder snaps a query to the FIRST walkable cell in ring order (find-path.ts
 *  nearestWalkable); an anchor is valid only when that exact cell is corridor-reached,
 *  otherwise findPath would land in an isolated pocket. Iteration order mirrors it. */
function hasApproach(grid: WalkGrid, visited: Uint8Array, p: Point): boolean {
  const [c0, r0] = grid.cellAt(p);
  const reached = (c: number, r: number) => visited[r * grid.cols + c] === 1;
  if (grid.isWalkable(c0, r0)) return reached(c0, r0);
  const radius = Math.ceil(APPROACH / grid.cellSize);
  for (let ring = 1; ring <= radius; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        if (grid.isWalkable(c0 + dc, r0 + dr)) return reached(c0 + dc, r0 + dr);
      }
    }
  }
  return false;
}

function inwardOf(doorPos: Point, roomCenter: Point): Point {
  const dx = roomCenter[0] - doorPos[0];
  const dz = roomCenter[1] - doorPos[1];
  const len = Math.hypot(dx, dz) || 1;
  return [dx / len, dz / len];
}

function angleOf([x, z]: Point): number {
  return Math.round(((Math.atan2(x, z) * 180) / Math.PI + 360) % 360);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function furnitureOf(floor: FloorInterior, id: string): Furniture | undefined {
  return floor.furniture.find((f) => f.id === id);
}
