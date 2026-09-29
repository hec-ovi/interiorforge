import type { Point } from '../../core/geom.js';
import { pointInPolygon } from '../../core/geom.js';
import type { LightFixture, Room } from '../../core/types.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { Placement } from '../../placements/types.js';
import { LocalFrame, freeIntervals, lensRecord, moduleSize } from './built-ins.js';
import { portalOfHeaderModule } from './portal.js';
import type { DressContext, HousingSpec } from './types.js';

/** Projecting service housings (the E1 cream cases over doors and portals, corridor ducts,
 *  wall AC units): architecture placed in the style's dress pass, after walls and props.
 *  A housing hangs from the ceiling against a wall face: two end caps at scale 1, a
 *  constant-section body stretched along the wall, fixed-pitch inserts (grilles, slots,
 *  screens) at scale 1, and an optional lit slot under it with its record.
 *  - `doors` / `portals`: one housing centred over each casing or portal header, on every
 *    side whose room wears the style, a little wider than the surround;
 *  - `runs`: along every partition of the style's rooms, cut around doors it cannot clear,
 *    around furniture that reaches its underside, and one run owning each corner;
 *  - its underside stays at least `minBottom` (2.1 m) up and clear of every header it passes
 *    over, and no housing enters a stair room.
 *  Module conventions: the body's back at z = 0 faces +z, it hangs from y = 0 (its bottom)
 *  to its height, one cell long; caps are symmetric in x; inserts sit on the body front. */

/** Casing members and portal backs stand this far off the partition line. */
const WALL_FACE = .1;
/** Housing overhang beyond a casing or portal surround, each side. */
const OVERHANG = .15;
/** Clearance kept over a header. */
const HEADER_GAP = .02;

/** Casing headers are `door-header` or `door-header-<one word>`; a portal's passage header
 *  is `door-header-<sid>-<name>`. */
export const isHeader = (module: string | undefined): boolean => !!module && /^door-header(?:-|$)/.test(module);
export const isPortalHeader = (module: string | undefined): boolean => !!module && /^door-header-[^-]+-.+/.test(module);

/** Top of a header placement and the surround width around it. */
function headerSpan(p: Placement): { top: number; width: number } {
  const straight = p.scale[0] * .5, portal = portalOfHeaderModule(p.module!);
  if (portal) {
    const band = portal.spec.band + portal.layers.reduce((s, l) => s + l.band, 0);
    return { top: p.position[1] + band, width: straight + 2 * (portal.spec.radius + band) };
  }
  if (isPortalHeader(p.module)) return { top: p.position[1] + .3, width: straight + 2 * .55 };
  return { top: p.position[1] + .08, width: straight };
}

/** The stretch of the wall line at depth `z` (local) that stays inside `polygon`, around x = 0. */
function extentAlong(frame: LocalFrame, polygon: readonly Point[], z: number): [number, number] {
  const xs: number[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = toLocal(frame, polygon[i]!), b = toLocal(frame, polygon[(i + 1) % polygon.length]!);
    if ((a[1] - z) * (b[1] - z) > 0 || Math.abs(b[1] - a[1]) < 1e-9) continue;
    xs.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
  }
  xs.sort((p, q) => p - q);
  let lo = -Infinity, hi = Infinity;
  for (const x of xs) { if (x <= 1e-9) lo = x; else if (x < hi) hi = x; }
  return [lo, hi];
}

function toLocal(frame: LocalFrame, [wx, wz]: Point): Point {
  const dx = wx - frame.origin[0], dz = wz - frame.origin[2];
  return [dx * frame.cos - dz * frame.sin, dx * frame.sin + dz * frame.cos];
}

const roomAt = (rooms: readonly Room[], p: [number, number, number]): Room | undefined =>
  rooms.find(room => pointInPolygon([p[0], p[2]], room.polygon) && !(room.holes ?? []).some(h => pointInPolygon([p[0], p[2]], h)));

/** One housing along local x of `frame` from x0 to x1, its underside at `bottom`. */
export function placeHousingSpan(builder: PlacementBuilder, room: string, frame: LocalFrame, x0: number, x1: number,
  bottom: number, spec: HousingSpec, elevation: number, lights: LightFixture[]): boolean {
  const cap = moduleSize(spec.cap)[0], inner = x1 - x0 - 2 * cap;
  if (inner < .1) return false;
  const z = WALL_FACE, mid = (x0 + x1) / 2;
  frame.place(builder, spec.body, room, mid, bottom, z, [inner / moduleSize(spec.body)[0], 1, 1]);
  for (const x of [x0 + cap / 2, x1 - cap / 2]) frame.place(builder, spec.cap, room, x, bottom, z);
  if (spec.insert) {
    const width = moduleSize(spec.insert.module)[0], n = Math.floor((inner - .1) / spec.insert.pitch + 1e-9);
    for (let i = 0; i < n; i++) {
      const x = mid + (i - (n - 1) / 2) * spec.insert.pitch;
      if (Math.abs(x - mid) + width / 2 <= inner / 2) frame.place(builder, spec.insert.module, room, x, bottom, z);
    }
  }
  if (spec.lens) {
    const length = inner - .04, lens = spec.lens;
    const placed = frame.place(builder, lens.module, room, mid, bottom, z + lens.proud, [length / moduleSize(lens.module)[0], 1, 1]);
    lights.push(lensRecord(frame, room, placed.id, mid, bottom, z + lens.proud, length, elevation,
      { kind: 'strip', lumensPerMetre: lens.lumensPerMetre, kelvin: lens.kelvin, color: lens.color, facing: lens.facing, beamDeg: 150, range: 2.4 }));
  }
  return true;
}

/** Underside of a housing hung from a room's own finished ceiling. */
const bottomIn = (ctx: DressContext, spec: HousingSpec, room: Room) => ctx.ceilingY - (room.ceilingDrop ?? 0) - spec.height;

export function placeHousings(ctx: DressContext, spec: HousingSpec): LightFixture[] {
  const lights: LightFixture[] = [];
  const styled = ctx.rooms.filter(room => !room.id.startsWith('stair-') && bottomIn(ctx, spec, room) >= spec.minBottom - 1e-6);
  if (!styled.length) return lights;
  if (spec.over === 'runs') return placeRunHousings(ctx, spec, styled);
  const want = spec.over === 'portals' ? isPortalHeader : (m: string | undefined) => isHeader(m) && !isPortalHeader(m);
  // A layered portal stacks one header per layer over the same passage: the case goes once,
  // over the tallest surround.
  const stacked = new Map<string, Placement>();
  for (const p of ctx.builder.placements.filter(p => want(p.module))) {
    const key = `${p.position[0].toFixed(3)}:${p.position[2].toFixed(3)}:${(((p.rotationY % Math.PI) + Math.PI) % Math.PI).toFixed(3)}`;
    const other = stacked.get(key);
    if (!other || headerSpan(p).top > headerSpan(other).top) stacked.set(key, p);
  }
  const headers = [...stacked.values()];
  for (const header of headers) {
    const span = headerSpan(header);
    for (const side of [1, -1]) {
      const frame = new LocalFrame([header.position[0], 0, header.position[2]], header.rotationY + (side < 0 ? Math.PI : 0));
      const room = roomAt(styled, frame.at(0, 0, .4));
      if (!room) continue;
      const bottom = bottomIn(ctx, spec, room);
      if (bottom < span.top + HEADER_GAP - 1e-6) continue;
      const [lo, hi] = extentAlong(frame, room.polygon, WALL_FACE + spec.depth / 2);
      const half = span.width / 2 + OVERHANG;
      placeHousingSpan(ctx.builder, room.id, frame, Math.max(-half, lo + .01), Math.min(half, hi - .01), bottom, spec,
        ctx.floor.elevation, lights);
    }
  }
  return lights;
}

/** Housings along the partitions of the style's rooms. */
function placeRunHousings(ctx: DressContext, spec: HousingSpec, rooms: Room[]): LightFixture[] {
  const lights: LightFixture[] = [], all = ctx.floor.rooms;
  const headers = ctx.builder.placements.filter(p => isHeader(p.module)).map(p => ({ p, span: headerSpan(p) }));
  const frameAxis = ctx.frame.angleDeg * Math.PI / 180;
  for (const room of rooms) {
    const poly = room.polygon, bottom = bottomIn(ctx, spec, room);
    for (let i = 0; i < poly.length; i++) {
      let a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < .8) continue;
      // Local +z must point into the room: turn the edge so it does.
      let frame = edgeFrame(a, b);
      if (!pointInPolygon(point(frame.at(0, 0, .2)), poly)) { [a, b] = [b, a]; frame = edgeFrame(a, b); }
      // Partitions only: the facade side has no room behind it (the shell owns it).
      if (!all.some(other => other.id !== room.id && pointInPolygon(point(frame.at(0, 0, -.25)), other.polygon))) continue;
      // One run owns each corner: runs across the frame's first axis stop short of it.
      const along = Math.abs(Math.cos(frame.rotation + frameAxis));
      const inset = along > .7 ? .01 : spec.depth + WALL_FACE + .01;
      const blocked: [number, number][] = [];
      for (const { p, span } of headers) {
        const [x, z] = toLocal(frame, [p.position[0], p.position[2]]);
        if (Math.abs(z) > .15) continue;
        if (bottom < span.top + HEADER_GAP) blocked.push([x - span.width / 2 - .05, x + span.width / 2 + .05]);
      }
      for (const item of ctx.floor.furniture) {
        if (item.room !== room.id || (item.elevation ?? 0) + item.size[2] <= bottom) continue;
        const [x, z] = toLocal(frame, item.position), r = Math.hypot(item.size[0], item.size[1]) / 2;
        if (z - r < spec.depth + WALL_FACE + .05) blocked.push([x - r, x + r]);
      }
      for (const [x0, x1] of freeIntervals(-length / 2 + inset, length / 2 - inset, blocked, .6))
        placeHousingSpan(ctx.builder, room.id, frame, x0, x1, bottom, spec, ctx.floor.elevation, lights);
    }
  }
  return lights;
}

/** A frame on the edge midpoint, local +x from a to b (its +z is +x turned a quarter). */
function edgeFrame(a: Point, b: Point): LocalFrame {
  const tx = b[0] - a[0], tz = b[1] - a[1];
  return new LocalFrame([(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2], Math.atan2(-tz, tx));
}
const point = (p: [number, number, number]): Point => [p[0], p[2]];
