import { MeshBuilder } from "../glb/mesh-builder.js";
import { WALL } from "../layout/constants.js";
import type { CorePlan } from "../layout/core-plan.js";
import type { UvRect } from "../layout/uv.js";
import { uvRectCorners, uvToWorld } from "../layout/uv.js";
import type { MaterialKeys } from "./materials.js";
import type { UvWallHole } from "./walls.js";

const DOOR_W = 1.1;
const DOOR_H = 2.2;

/** Elevator door hole on the shaft's corridor face, uv wall-line format. */
export function elevatorDoorHole(core: CorePlan, elevatorIndex: number, elevation: number): UvWallHole {
  const rect = core.elevators[elevatorIndex]!.rect;
  return {
    axis: "H",
    c: core.vFace,
    hole: { at: rect.u + rect.lu / 2, width: DOOR_W, y0: elevation, y1: elevation + DOOR_H },
  };
}

/** Closed metal door panel filling each elevator opening. */
export function emitElevatorDoors(mb: MeshBuilder, keys: MaterialKeys, core: CorePlan, elevation: number): void {
  const material = keys.elevatorDoor();
  for (const elevator of core.elevators) {
    const at = elevator.rect.u + elevator.rect.lu / 2;
    const panel: UvRect = { u: at - DOOR_W / 2, v: core.vFace - 0.03, lu: DOOR_W, lv: 0.06 };
    // the door material is an exact placement: one texture over the panel, never tiled
    mb.addPrism(material, uvRectCorners(panel).map((p) => uvToWorld(p, core.frame)), elevation, elevation + DOOR_H, "unit");
  }
}

/** Divider walls between abutting core rects (elevator to elevator, stair to elevator, riser). */
export function emitCoreDividers(mb: MeshBuilder, keys: MaterialKeys, core: CorePlan, y0: number, y1: number): void {
  const rects = coreRects(core);
  const material = keys.concrete();
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      let wall: UvRect | null = null;
      if (Math.abs(a.u + a.lu - b.u) < 1e-6 || Math.abs(b.u + b.lu - a.u) < 1e-6) {
        const u = Math.abs(a.u + a.lu - b.u) < 1e-6 ? a.u + a.lu : b.u + b.lu;
        const v0 = Math.max(a.v, b.v);
        const v1 = Math.min(a.v + a.lv, b.v + b.lv);
        if (v1 - v0 > 0.1) wall = { u: u - WALL / 2, v: v0, lu: WALL, lv: v1 - v0 };
      } else if (Math.abs(a.v + a.lv - b.v) < 1e-6 || Math.abs(b.v + b.lv - a.v) < 1e-6) {
        const v = Math.abs(a.v + a.lv - b.v) < 1e-6 ? a.v + a.lv : b.v + b.lv;
        const u0 = Math.max(a.u, b.u);
        const u1 = Math.min(a.u + a.lu, b.u + b.lu);
        if (u1 - u0 > 0.1) wall = { u: u0, v: v - WALL / 2, lu: u1 - u0, lv: WALL };
      }
      if (wall) mb.addPrism(material, uvRectCorners(wall).map((p) => uvToWorld(p, core.frame)), y0, y1);
    }
  }
}

/** Shaft enclosures on a spans-2 upper floor: no rooms exist there to wall the core in. */
export function emitOpenFloorShaftWalls(
  mb: MeshBuilder, keys: MaterialKeys, core: CorePlan, sealed: UvRect[], y0: number, y1: number,
): void {
  const material = keys.concrete();
  for (const r of [...coreRects(core), ...sealed]) {
    const grown: UvRect = { u: r.u - WALL, v: r.v - WALL, lu: r.lu + 2 * WALL, lv: r.lv + 2 * WALL };
    for (const wall of [
      { u: grown.u, v: grown.v, lu: grown.lu, lv: WALL },
      { u: grown.u, v: grown.v + grown.lv - WALL, lu: grown.lu, lv: WALL },
      { u: grown.u, v: r.v, lu: WALL, lv: r.lv },
      { u: grown.u + grown.lu - WALL, v: r.v, lu: WALL, lv: r.lv },
    ]) {
      mb.addPrism(material, uvRectCorners(wall).map((p) => uvToWorld(p, core.frame)), y0, y1);
    }
  }
}

export function coreRects(core: CorePlan): UvRect[] {
  const rects: UvRect[] = [core.stairA, core.riser, ...core.elevators.map((e) => e.rect)];
  if (core.stairB) rects.push(core.stairB);
  return rects;
}
