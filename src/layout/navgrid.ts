import type { Point } from "../core/geom.js";
import { clipPolygonToRect, pointInPolygon, polygonBounds } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import { AGENT_RADIUS, CELL, WALL } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { doorUvPoint, stairEntryUv } from "./plan-floor.js";
import type { PlanFurniture, PlanRoom } from "./plan-types.js";
import type { Frame, UvRect } from "./uv.js";
import { pointInUvRect, uvRectCorners, uvRectWorldBounds, uvToWorld, worldToUv } from "./uv.js";

const WALL_BAND = WALL / 2 + AGENT_RADIUS; // blocked distance either side of a wall line
const FURNITURE_MARGIN = 0.15;

/** World-space walkable grid built from uv-space plan data: walls, shafts and furniture
 *  blocked (eroded by agent radius), door channels carved open. Angle-agnostic: rotated
 *  frames produce diagonal wall segments, blocked by true distance. */
export function buildNavGrid(
  worldOutline: readonly Point[], uvOutline: readonly Point[], rooms: PlanRoom[],
  furniture: PlanFurniture[], sealed: UvRect[], core: CorePlan,
): WalkGrid {
  const frame = core.frame;
  const bounds = polygonBounds(worldOutline);
  const grid = WalkGrid.forPolygon(worldOutline, CELL, bounds);

  for (let e = 0; e < worldOutline.length; e++) {
    blockSegment(grid, worldOutline[e]!, worldOutline[(e + 1) % worldOutline.length]!, WALL_BAND);
  }

  for (const room of rooms) {
    for (const [a, b] of roomWallSegments(room, uvOutline)) {
      blockSegment(grid, uvToWorld(a, frame), uvToWorld(b, frame), WALL_BAND);
    }
  }

  for (const elevator of core.elevators) blockUvRect(grid, frame, elevator.rect, WALL_BAND);
  blockUvRect(grid, frame, core.riser, WALL_BAND);
  for (const s of sealed) blockUvRect(grid, frame, s, WALL_BAND);

  // stair shafts: walkable inside, walled boundary
  for (const shaft of [core.stairA, core.stairB].filter(Boolean) as UvRect[]) {
    const corners = uvRectCorners(shaft);
    for (let i = 0; i < 4; i++) {
      blockSegment(grid, uvToWorld(corners[i]!, frame), uvToWorld(corners[(i + 1) % 4]!, frame), WALL_BAND);
    }
  }

  for (const f of furniture) {
    blockUvRect(grid, frame, furnitureUvRect(f), FURNITURE_MARGIN);
  }

  for (const room of rooms) {
    for (const door of room.doors) {
      openUvRect(grid, frame, doorChannelUv(door, room), worldOutline);
    }
  }
  for (const channel of stairDoorChannelsUv(core)) openUvRect(grid, frame, channel, worldOutline);

  return grid;
}

/** Interior wall segments of a room in uv space: its clipped polygon edges off the facade. */
function roomWallSegments(room: PlanRoom, uvOutline: readonly Point[]): [Point, Point][] {
  const clipped = clipPolygonToRect(uvOutline, {
    x: room.rect.u, z: room.rect.v, w: room.rect.lu, d: room.rect.lv,
  });
  const poly = clipped.length >= 3 ? clipped : uvRectCorners(room.rect);
  const out: [Point, Point][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (!onBoundary(mid, uvOutline)) out.push([a, b]);
  }
  return out;
}

export function furnitureUvRect(f: PlanFurniture): UvRect {
  const swap = f.rotationDeg === 90 || f.rotationDeg === 270;
  const lu = swap ? f.size[1] : f.size[0];
  const lv = swap ? f.size[0] : f.size[1];
  return { u: f.at[0] - lu / 2, v: f.at[1] - lv / 2, lu, lv };
}

export function doorChannelUv(door: PlanRoom["doors"][number], room: PlanRoom): UvRect {
  const [u, v] = doorUvPoint(door, room);
  const across = WALL_BAND + 2 * CELL;
  return door.edge.startsWith("v")
    ? { u: u - door.width / 2, v: v - across, lu: door.width, lv: 2 * across }
    : { u: u - across, v: v - door.width / 2, lu: 2 * across, lv: door.width };
}

/** Carve rects for the stair shaft doors, uv space. */
export function stairDoorChannelsUv(core: CorePlan): UvRect[] {
  const out: UvRect[] = [];
  const across = WALL_BAND + 2 * CELL;
  const [ua] = stairEntryUv(core, "a");
  out.push({ u: ua - 0.5, v: core.vFace - across, lu: 1.0, lv: 2 * across });
  if (core.stairB) {
    const [, vb] = stairEntryUv(core, "b");
    out.push({ u: core.stairB.u - across, v: vb - 0.5, lu: 2 * across, lv: 1.0 });
  }
  return out;
}

function blockUvRect(grid: WalkGrid, frame: Frame, rect: UvRect, margin: number): void {
  forCellsInUvRect(grid, frame, rect, margin, (c, r) => grid.set(c, r, false));
}

function openUvRect(grid: WalkGrid, frame: Frame, rect: UvRect, worldOutline: readonly Point[]): void {
  forCellsInUvRect(grid, frame, rect, 0, (c, r, center) => {
    if (pointInPolygon(center, worldOutline)) grid.set(c, r, true);
  });
}

function forCellsInUvRect(
  grid: WalkGrid, frame: Frame, rect: UvRect, margin: number,
  fn: (c: number, r: number, center: Point) => void,
): void {
  const grown: UvRect = { u: rect.u - margin, v: rect.v - margin, lu: rect.lu + 2 * margin, lv: rect.lv + 2 * margin };
  const bbox = uvRectWorldBounds(grown, frame);
  const [c0, r0] = grid.cellAt([bbox.x, bbox.z]);
  const [c1, r1] = grid.cellAt([bbox.x + bbox.w, bbox.z + bbox.d]);
  for (let r = Math.max(0, r0); r <= Math.min(grid.rows - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(grid.cols - 1, c1); c++) {
      const center = grid.center(c, r);
      if (pointInUvRect(worldToUv(center, frame), rect, margin)) fn(c, r, center);
    }
  }
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

function onBoundary(p: Point, outline: readonly Point[]): boolean {
  for (let i = 0; i < outline.length; i++) {
    if (distToSegment(p, outline[i]!, outline[(i + 1) % outline.length]!) < 0.04) return true;
  }
  return false;
}
