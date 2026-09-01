import type { Point, Rect } from "../core/geom.js";
import { pointInPolygon, polygonBounds } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import { AGENT_RADIUS, CELL, WALL } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { doorUvPoint } from "./plan-floor.js";
import type { PlanFurniture, PlanRoom } from "./plan-types.js";
import type { Axis, UvRect } from "./uv.js";
import { toUvRect, toWorldRect } from "./uv.js";

const WALL_BAND = WALL / 2 + AGENT_RADIUS; // blocked distance either side of a wall line
const FURNITURE_MARGIN = 0.15;

/** World-space walkable grid for one floor: walls, shafts and furniture blocked
 *  (eroded by agent radius), door channels carved open. */
export function buildNavGrid(
  outline: readonly Point[], rooms: PlanRoom[], furniture: PlanFurniture[],
  sealed: UvRect[], core: CorePlan, axis: Axis,
): WalkGrid {
  const bounds = polygonBounds(outline);
  const grid = WalkGrid.forPolygon(outline, CELL, bounds);

  for (let e = 0; e < outline.length; e++) {
    blockSegment(grid, outline[e]!, outline[(e + 1) % outline.length]!, WALL_BAND);
  }

  for (const room of rooms) {
    const r = toWorldRect(room.rect, axis);
    blockRectEdges(grid, r, WALL_BAND);
  }

  for (const elevator of core.elevators) grid.blockRect(elevator.rect, WALL_BAND);
  grid.blockRect(core.riser, WALL_BAND);
  for (const s of sealed) grid.blockRect(toWorldRect(s, axis), WALL_BAND);

  // stair shafts: walkable inside, walled boundary
  blockRectEdges(grid, core.stairA, WALL_BAND);
  if (core.stairB) blockRectEdges(grid, core.stairB, WALL_BAND);

  for (const f of furniture) {
    grid.blockRect(furnitureWorldRect(f, axis), FURNITURE_MARGIN);
  }

  for (const room of rooms) {
    for (const door of room.doors) {
      openInside(grid, doorChannelWorld(door, room, axis), outline);
    }
  }
  for (const channel of stairDoorChannels(core)) openInside(grid, channel, outline);

  return grid;
}

export function furnitureWorldRect(f: PlanFurniture, axis: Axis): Rect {
  const swap = f.rotationDeg === 90 || f.rotationDeg === 270;
  const lu = swap ? f.size[1] : f.size[0];
  const lv = swap ? f.size[0] : f.size[1];
  return toWorldRect({ u: f.at[0] - lu / 2, v: f.at[1] - lv / 2, lu, lv }, axis);
}

export function doorChannelWorld(door: PlanRoom["doors"][number], room: PlanRoom, axis: Axis): Rect {
  const [u, v] = doorUvPoint(door, room);
  const across = WALL_BAND + 2 * CELL;
  const uv: UvRect = door.edge.startsWith("v")
    ? { u: u - door.width / 2, v: v - across, lu: door.width, lv: 2 * across }
    : { u: u - across, v: v - door.width / 2, lu: 2 * across, lv: door.width };
  return toWorldRect(uv, axis);
}

/** Keep-clear and carve rects for the stair shaft doors, world space. */
export function stairDoorChannels(core: CorePlan): Rect[] {
  const out: Rect[] = [];
  const a = toUvRect(core.stairA, core.axis);
  const across = WALL_BAND + 2 * CELL;
  out.push(toWorldRect({ u: a.u + a.lu - 1.2, v: core.vFace - across, lu: 1.0, lv: 2 * across }, core.axis));
  if (core.stairB) {
    const b = toUvRect(core.stairB, core.axis);
    out.push(toWorldRect({ u: b.u - across, v: b.v + b.lv / 2 - 0.5, lu: 2 * across, lv: 1.0 }, core.axis));
  }
  return out;
}

function blockRectEdges(grid: WalkGrid, r: Rect, band: number): void {
  const c: Point[] = [
    [r.x, r.z], [r.x + r.w, r.z], [r.x + r.w, r.z + r.d], [r.x, r.z + r.d],
  ];
  for (let i = 0; i < 4; i++) blockSegment(grid, c[i]!, c[(i + 1) % 4]!, band);
}

function blockSegment(grid: WalkGrid, p0: Point, p1: Point, band: number): void {
  const minX = Math.min(p0[0], p1[0]) - band;
  const maxX = Math.max(p0[0], p1[0]) + band;
  const minZ = Math.min(p0[1], p1[1]) - band;
  const maxZ = Math.max(p0[1], p1[1]) + band;
  const [c0, r0] = grid.cellAt([minX, minZ]);
  const [c1, r1] = grid.cellAt([maxX, maxZ]);
  for (let r = Math.max(0, r0); r <= Math.min(grid.rows - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(grid.cols - 1, c1); c++) {
      if (distToSegment(grid.center(c, r), p0, p1) <= band) grid.set(c, r, false);
    }
  }
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const len2 = abx * abx + abz * abz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * abx + (p[1] - a[1]) * abz) / len2));
  return Math.hypot(p[0] - (a[0] + abx * t), p[1] - (a[1] + abz * t));
}

function openInside(grid: WalkGrid, rect: Rect, outline: readonly Point[]): void {
  const [c0, r0] = grid.cellAt([rect.x, rect.z]);
  const [c1, r1] = grid.cellAt([rect.x + rect.w, rect.z + rect.d]);
  for (let r = Math.max(0, r0); r <= Math.min(grid.rows - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(grid.cols - 1, c1); c++) {
      const center = grid.center(c, r);
      if (
        center[0] >= rect.x && center[0] <= rect.x + rect.w &&
        center[1] >= rect.z && center[1] <= rect.z + rect.d &&
        pointInPolygon(center, outline)
      ) {
        grid.set(c, r, true);
      }
    }
  }
}
