import type { Point } from "../core/geom.js";
import { pointInPolygon, polygonBounds } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import { AGENT_RADIUS, CELL, WALL } from "./constants.js";
import type { CorePlan } from "./core-plan.js";
import { stairAccess } from "./core-plan.js";
import { doorUvPoint } from "./plan-floor.js";
import type { PlanFurniture, PlanRoom } from "./plan-types.js";
import type { FloorBounds } from "./shell.js";
import type { Frame, UvRect } from "./uv.js";
import { pointInUvRect, uvRectCorners, uvRectWorldBounds, uvToWorld, worldToUv } from "./uv.js";
import { roomContains, roomEdges } from "./room-shape.js";

const WALL_BAND = WALL / 2 + AGENT_RADIUS; // blocked distance either side of a wall line
const FURNITURE_MARGIN = 0.15;
/** Pull-in seating is stepped around, not routed around, and a wall piece hangs overhead. */
const NON_BLOCKING: ReadonlySet<string> = new Set(["chair", "stool", "office_chair"]);

/** World-space walkable grid built from uv-space plan data: walls, shafts and furniture
 *  blocked (eroded by agent radius), door channels carved open. Angle-agnostic: rotated
 *  frames produce diagonal wall segments, blocked by true distance. */
export function buildNavGrid(
  worldOutline: readonly Point[], bounds: FloorBounds, rooms: PlanRoom[],
  furniture: PlanFurniture[], sealed: UvRect[], core: CorePlan, physical = false,
): WalkGrid {
  const frame = core.frame;
  const uvOutline = bounds.outline;
  const grid = WalkGrid.forPolygon(worldOutline, physical ? CELL / 4 : CELL, polygonBounds(worldOutline));

  // the facade lining stands inside the outline; walkable space starts behind it
  const facadeBand = bounds.facadeDepth + AGENT_RADIUS;
  for (let e = 0; e < worldOutline.length; e++) {
    blockSegment(grid, worldOutline[e]!, worldOutline[(e + 1) % worldOutline.length]!, facadeBand);
  }

  for (const room of rooms) {
    for (const [a, b] of roomWallSegments(room, uvOutline)) {
      blockSegment(grid, uvToWorld(a, frame), uvToWorld(b, frame), WALL_BAND);
    }
  }

  // An exclusion can be occupied by another room or a stair. Unassigned exclusions are
  // void, including their interior cells, rather than isolated walkable islands.
  const stairRects = [core.stairA, core.stairB].filter(Boolean) as UvRect[];
  for (const room of rooms) {
    for (const hole of room.holes ?? []) {
      const b = polygonBounds(hole);
      forCellsInUvRect(grid, frame, { u: b.x, v: b.z, lu: b.w, lv: b.d }, 0, (c, r, center) => {
        const uv = worldToUv(center, frame);
        if (!pointInPolygon(uv, hole) || stairRects.some(rect => pointInUvRect(uv, rect))) return;
        if (!rooms.some(other => other !== room && roomContains(other, uv))) grid.set(c, r, false);
      });
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
    if (physical || NON_BLOCKING.has(f.kind) || (f.elevation ?? 0) > 0) continue;
    blockUvRect(grid, frame, furnitureUvRect(f), FURNITURE_MARGIN);
  }

  for (const room of rooms) {
    for (const door of room.doors) {
      const band = door.to === "outside" ? facadeBand : WALL_BAND;
      if (door.openFront) openOpenFrontChannel(grid, frame, door, room, band, worldOutline, physical ? AGENT_RADIUS : 0);
      else {
        const channel = doorChannelUv(door, room, band);
        if (physical) {
          if (door.edge.startsWith("v")) { channel.u += AGENT_RADIUS; channel.lu -= 2 * AGENT_RADIUS; }
          else { channel.v += AGENT_RADIUS; channel.lv -= 2 * AGENT_RADIUS; }
        }
        if (channel.lu > 0 && channel.lv > 0) openUvRect(grid, frame, channel, worldOutline);
      }
    }
  }
  for (const channel of stairDoorChannelsUv(core)) {
    if (physical) {
      if (channel.lu < channel.lv) { channel.u += AGENT_RADIUS; channel.lu -= 2 * AGENT_RADIUS; }
      else { channel.v += AGENT_RADIUS; channel.lv -= 2 * AGENT_RADIUS; }
    }
    openUvRect(grid, frame, channel, worldOutline);
  }
  if (physical) blockPhysicalFurniture(grid, frame, furniture);

  return grid;
}

/** Consumes the architecture-only route grid after its reservations have been saved. */
export function blockPhysicalFurniture(grid: WalkGrid, frame: Frame, furniture: readonly PlanFurniture[]): void {
  for (const item of furniture) {
    if ((item.elevation ?? 0) > 0) continue;
    blockUvRect(grid, frame, furnitureUvRect(item), AGENT_RADIUS);
  }
}

/** Interior wall segments of a room in uv space: its clipped polygon edges off the facade. */
function roomWallSegments(room: PlanRoom, uvOutline: readonly Point[]): [Point, Point][] {
  const out: [Point, Point][] = [];
  for (const { a, b } of roomEdges(room, uvOutline)) {
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

export function doorChannelUv(door: PlanRoom["doors"][number], room: PlanRoom, band = WALL_BAND): UvRect {
  const [u, v] = doorUvPoint(door, room);
  const across = band + 2 * CELL;
  return door.edge.startsWith("v")
    ? { u: u - door.width / 2, v: v - across, lu: door.width, lv: 2 * across }
    : { u: u - across, v: v - door.width / 2, lu: 2 * across, lv: door.width };
}

/** Carve rects for the stair shaft doors, uv space, from the shared access definition. */
export function stairDoorChannelsUv(core: CorePlan): UvRect[] {
  const across = WALL_BAND + 2 * CELL;
  const stairs: ("a" | "b")[] = core.stairB ? ["a", "b"] : ["a"];
  return stairs.map((which) => {
    const access = stairAccess(core, which);
    return access.axis === "H"
      ? { u: access.at - 0.5, v: access.c - across, lu: 1.0, lv: 2 * across }
      : { u: access.c - across, v: access.at - 0.5, lu: 2 * across, lv: 1.0 };
  });
}

/** Opens a facade channel on the portal's exact direction. Its bounding box limits the grid
 *  scan; projection against the portal axes keeps diagonal fronts from opening extra wall. */
function openOpenFrontChannel(
  grid: WalkGrid, frame: Frame, door: PlanRoom["doors"][number], room: PlanRoom,
  band: number, worldOutline: readonly Point[], inset = 0,
): void {
  if (!door.openFront) return;
  const [u, v] = doorUvPoint(door, room);
  const rad = (door.openFront.angleDeg * Math.PI) / 180;
  const along: Point = [Math.cos(rad), Math.sin(rad)];
  const across: Point = [-along[1], along[0]];
  const halfAlong = door.width / 2 - inset;
  const halfAcross = band + 2 * CELL;
  const du = Math.abs(along[0]) * halfAlong + Math.abs(across[0]) * halfAcross;
  const dv = Math.abs(along[1]) * halfAlong + Math.abs(across[1]) * halfAcross;
  const bounds = { u: u - du, v: v - dv, lu: 2 * du, lv: 2 * dv };
  forCellsInUvRect(grid, frame, bounds, 0, (c, r, center) => {
    const at = worldToUv(center, frame);
    const d: Point = [at[0] - u, at[1] - v];
    if (
      Math.abs(d[0] * along[0] + d[1] * along[1]) <= halfAlong
      && Math.abs(d[0] * across[0] + d[1] * across[1]) <= halfAcross
      && pointInPolygon(center, worldOutline)
    ) grid.set(c, r, true);
  });
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
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
  const lengthSquared = dx * dx + dz * dz;
  const bandSquared = band * band;
  for (let r = Math.max(0, r0); r <= Math.min(grid.rows - 1, r1); r++) {
    const [baseX, z] = grid.center(0, r);
    let lo = 0, hi = 1;
    if (dz === 0) {
      if (Math.abs(z - p0[1]) > band) continue;
    } else {
      const a = (z - band - p0[1]) / dz, b = (z + band - p0[1]) / dz;
      lo = Math.max(0, Math.min(a, b));
      hi = Math.min(1, Math.max(a, b));
      if (lo > hi) continue;
    }
    // Any closest segment point within the band also lies within this row's z strip.
    const x0 = p0[0] + dx * lo, x1 = p0[0] + dx * hi;
    const first = Math.max(0, c0, grid.cellAt([Math.min(x0, x1) - band, z])[0]);
    const last = Math.min(grid.cols - 1, c1, grid.cellAt([Math.max(x0, x1) + band, z])[0]);
    for (let c = first; c <= last; c++) {
      const x = baseX + c * grid.cellSize;
      const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - p0[0]) * dx + (z - p0[1]) * dz) / lengthSquared));
      const ex = x - (p0[0] + dx * t), ez = z - (p0[1] + dz * t);
      if (ex * ex + ez * ez <= bandSquared) grid.set(c, r, false);
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
