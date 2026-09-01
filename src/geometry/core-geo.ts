import type { Rect } from "../core/geom.js";
import { rectsOverlap } from "../core/geom.js";
import type { ElevatorCore, FloorInterior } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { WALL } from "../layout/constants.js";
import type { MaterialKeys } from "./materials.js";
import type { WallHole } from "./walls.js";

const DOOR_W = 1.1;
const DOOR_H = 2.2;

/** Elevator door hole on the shaft's door face, for the interior wall pass. */
export function elevatorDoorHole(
  elevator: ElevatorCore, elevation: number,
): { axis: "H" | "V"; c: number; hole: WallHole } {
  const r = elevator.rect;
  const [axis, c, at]: ["H" | "V", number, number] =
    elevator.doorEdge === 0 ? ["H", r.z, r.x + r.w / 2]
    : elevator.doorEdge === 2 ? ["H", r.z + r.d, r.x + r.w / 2]
    : elevator.doorEdge === 1 ? ["V", r.x + r.w, r.z + r.d / 2]
    : ["V", r.x, r.z + r.d / 2];
  return { axis, c, hole: { at, width: DOOR_W, y0: elevation, y1: elevation + DOOR_H } };
}

/** Closed metal door panel filling each elevator opening. */
export function emitElevatorDoors(mb: MeshBuilder, keys: MaterialKeys, floor: FloorInterior): void {
  for (const elevator of floor.core.elevators) {
    const { axis, c, hole } = elevatorDoorHole(elevator, floor.elevation);
    const material = keys.elevatorDoor();
    if (axis === "H") {
      mb.addBox(material, { x: hole.at - hole.width / 2, z: c - 0.03, w: hole.width, d: 0.06 }, hole.y0, hole.y1);
    } else {
      mb.addBox(material, { x: c - 0.03, z: hole.at - hole.width / 2, w: 0.06, d: hole.width }, hole.y0, hole.y1);
    }
  }
}

/** Divider walls between abutting core rects (elevator to elevator, stair to elevator, riser). */
export function emitCoreDividers(mb: MeshBuilder, keys: MaterialKeys, floor: FloorInterior, wallTop: number): void {
  const rects: Rect[] = [
    ...floor.core.stairs.map((s) => s.rect),
    ...floor.core.elevators.map((e) => e.rect),
    ...floor.core.shafts,
  ];
  const material = keys.concrete();
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      if (Math.abs(a.x + a.w - b.x) < 1e-6 || Math.abs(b.x + b.w - a.x) < 1e-6) {
        const x = Math.abs(a.x + a.w - b.x) < 1e-6 ? a.x + a.w : b.x + b.w;
        const z0 = Math.max(a.z, b.z);
        const z1 = Math.min(a.z + a.d, b.z + b.d);
        if (z1 - z0 > 0.1) mb.addBox(material, { x: x - WALL / 2, z: z0, w: WALL, d: z1 - z0 }, floor.elevation, wallTop);
      } else if (Math.abs(a.z + a.d - b.z) < 1e-6 || Math.abs(b.z + b.d - a.z) < 1e-6) {
        const z = Math.abs(a.z + a.d - b.z) < 1e-6 ? a.z + a.d : b.z + b.d;
        const x0 = Math.max(a.x, b.x);
        const x1 = Math.min(a.x + a.w, b.x + b.w);
        if (x1 - x0 > 0.1) mb.addBox(material, { x: x0, z: z - WALL / 2, w: x1 - x0, d: WALL }, floor.elevation, wallTop);
      }
    }
  }
}

/** Shaft enclosures on a spans-2 upper floor: no rooms exist there to wall the core in. */
export function emitOpenFloorShaftWalls(
  mb: MeshBuilder, keys: MaterialKeys, floor: FloorInterior, wallTop: number,
): void {
  const material = keys.concrete();
  const rects: Rect[] = [
    ...floor.core.stairs.map((s) => s.rect),
    ...floor.core.elevators.map((e) => e.rect),
    ...floor.core.shafts,
  ];
  const merged: Rect[] = [];
  for (const r of rects) {
    if (!merged.some((m) => rectsOverlap(m, r))) merged.push(r);
  }
  for (const r of merged) {
    mb.addBox(material, { x: r.x - WALL, z: r.z - WALL, w: r.w + 2 * WALL, d: WALL }, floor.elevation, wallTop);
    mb.addBox(material, { x: r.x - WALL, z: r.z + r.d, w: r.w + 2 * WALL, d: WALL }, floor.elevation, wallTop);
    mb.addBox(material, { x: r.x - WALL, z: r.z, w: WALL, d: r.d }, floor.elevation, wallTop);
    mb.addBox(material, { x: r.x + r.w, z: r.z, w: WALL, d: r.d }, floor.elevation, wallTop);
  }
}
