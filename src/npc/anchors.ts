import type { Point } from "../core/geom.js";
import { polygonBounds, pointInPolygon } from "../core/geom.js";
import type { WalkGrid } from "../core/grid.js";
import type { Anchor, AnchorKind, FloorInterior, Furniture } from "../core/types.js";
import { SPINE_KINDS } from "../layout/constants.js";
import { DoorKeepOut, ENTRANCE_STANDOFF } from "./keep-out.js";
import type { CorePlan } from "../layout/index.js";
import { elevatorWaitUv } from "../layout/index.js";
import { uvToWorld } from "../layout/uv.js";

/** How far an anchor may be walked out of a doorway or off an unreachable cell. */
const SEARCH = 2.2;

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
  display_rack: { kind: "work_spot", side: "front" },
  // seats are real pieces now: the anchor is on the seat, facing where the seat faces
  chair: { kind: "seat", side: "on" },
  stool: { kind: "seat", side: "on" },
  office_chair: { kind: "seat", side: "on" },
  sofa: { kind: "seat", side: "on" },
  bench: { kind: "seat", side: "on" },
  kitchen_block: { kind: "work_spot", side: "front" },
};

export function floorAnchors(
  floor: FloorInterior, grid: WalkGrid, visited: Uint8Array, roomCenters: Map<string, Point>,
): Anchor[] {
  const anchors: Anchor[] = [];
  let n = 0;
  const tag = floor.floor < 0 ? `m${-floor.floor}` : `${floor.floor}`;
  const keepOut = new DoorKeepOut(floor);
  const add = (kind: AnchorKind, room: string, position: Point, facingDeg: number, furniture?: string) => {
    const snapped = snapToReached(grid, visited, [round2(position[0]), round2(position[1])], keepOut);
    if (!snapped) return;
    anchors.push({
      id: `f${tag}-a${n++}`, floor: floor.floor, room, kind,
      position: snapped, facingDeg, ...(furniture ? { furniture } : {}),
    });
  };

  // furniture-driven spots: preferred side first (front of a desk, behind a counter, the
  // open side of a bed), the opposite side as fallback when that spot is unreachable
  for (const f of floor.furniture) {
    const spec = FURNITURE_ANCHORS[f.kind];
    if (!spec) continue;
    const facing = facingOf(f.rotationDeg);
    const reach = f.size[1] / 2 + 0.4;
    const front: Point = [f.position[0] + facing[0] * reach, f.position[1] + facing[1] * reach];
    const back: Point = [f.position[0] - facing[0] * reach, f.position[1] - facing[1] * reach];
    const candidates: [Point, number][] = spec.side === "behind"
      ? [[back, f.rotationDeg], [front, (f.rotationDeg + 180) % 360]]
      : spec.side === "on"
        ? [[f.position, f.rotationDeg], [front, (f.rotationDeg + 180) % 360]]
        : [[front, (f.rotationDeg + 180) % 360], [back, f.rotationDeg]];
    for (const [p, facingDeg] of candidates) {
      const before = anchors.length;
      add(spec.kind, f.room, p, facingDeg, f.id);
      if (anchors.length > before) break;
    }
  }

  for (const room of floor.rooms) {
    const center = roomCenters.get(room.id) ?? fallbackCenter(room.polygon);
    // entrance anchors only at street level; balcony doors on upper floors are not entries
    for (const door of room.doors) {
      if (door.to !== "outside" || floor.floor !== 0) continue;
      // an entrance anchor stands well inside, never in the opening itself
      const inward = inwardOf(door.position, center);
      const standoff = ENTRANCE_STANDOFF + 0.2;
      add("entrance", room.id, [door.position[0] + inward[0] * standoff, door.position[1] + inward[1] * standoff],
        angleOf(inward), undefined);
    }
    // idle spots in social rooms, patrol points in public ones
    if (["living", "lounge", "reception", "office_open", "dining_area", "sales_floor", "gym_floor", "studio_main", "terrace_open"].includes(room.kind)) {
      if (pointInPolygon(center, room.polygon)) add("idle_spot", room.id, center, 0);
    }
    if (SPINE_KINDS.has(room.kind)) {
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
  const keepOut = new DoorKeepOut(floor);
  const tag = floor.floor < 0 ? `m${-floor.floor}` : `${floor.floor}`;
  let n = 0;
  // wait anchors face the frame's +v direction (into the shaft doors)
  const intoCore = norm360(-core.frame.angleDeg);
  core.elevators.forEach((_, i) => {
    const p = uvToWorld(elevatorWaitUv(core, i), core.frame);
    const snapped = snapToReached(grid, visited, [round2(p[0]), round2(p[1])], keepOut);
    if (!snapped) return;
    anchors.push({
      id: `f${tag}-c${n++}`, floor: floor.floor, room: corridorRoomId, kind: "elevator_wait",
      position: snapped, facingDeg: intoCore,
    });
  });
  for (const stair of floor.core.stairs) {
    const snapped = snapToReached(grid, visited, [round2(stair.entry[0]), round2(stair.entry[1])], keepOut);
    if (!snapped) continue;
    anchors.push({
      id: `f${tag}-c${n++}`, floor: floor.floor, room: corridorRoomId, kind: "stair_entry",
      position: snapped, facingDeg: intoCore,
    });
  }
  return anchors;
}

function norm360(deg: number): number {
  return Math.round(((deg % 360) + 360) % 360 * 100) / 100;
}

/** Exported anchors must be pathable by construction and clear of every doorway: keep the
 *  ideal point when its own cell is corridor-reached and out of the way, otherwise walk out
 *  to the nearest cell that is both. The keep-out test runs on the exact point that is
 *  exported (the cell centre rounded to centimetres): a centre a few millimetres outside a
 *  door zone must not round back into it. Null when nothing usable is close enough (the
 *  anchor is dropped). */
function snapToReached(grid: WalkGrid, visited: Uint8Array, p: Point, keepOut: DoorKeepOut): Point | null {
  const [c0, r0] = grid.cellAt(p);
  const usable = (c: number, r: number, at: Point) =>
    grid.isWalkable(c, r) && visited[r * grid.cols + c] === 1 && keepOut.clear(at);
  if (usable(c0, r0, p)) return p;
  const radius = Math.ceil(SEARCH / grid.cellSize) + 1;
  for (let ring = 1; ring <= radius; ring++) {
    let best: Point | null = null;
    let bestDist = Infinity;
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        const center = grid.center(c0 + dc, r0 + dr);
        const at: Point = [round2(center[0]), round2(center[1])];
        if (!usable(c0 + dc, r0 + dr, at)) continue;
        const dist = Math.hypot(at[0] - p[0], at[1] - p[1]);
        if (dist < bestDist) {
          bestDist = dist;
          best = at;
        }
      }
    }
    if (best) return best;
  }
  return null;
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
