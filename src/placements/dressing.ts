import { loadAssetCatalog } from '../assets/catalog.js';
import type { ModelPresence } from '../assets/families.js';
import type { AssetEntry } from '../assets/types.js';
import { pointInPolygon, type Point } from '../core/geom.js';
import type { FloorInterior, Tier } from '../core/types.js';
import { clean, placementRecipe, type PlacementBuilder } from './builder.js';
import type { Placement } from './types.js';

/** The dressing pass: after the furniture stands, the tops it offers (worktops, islands,
 *  bar and counter tops, tables, consoles, nightstands, desks, shelf boards) take the small
 *  things people keep on them, and counters take their stools. Surfaces are read off the
 *  placed modules' own geometry (upward faces with clear space over them), so a shelf's
 *  boards, a worktop round its sink or a ledge are found without a table of heights.
 *  Everything is seeded per floor, room and piece, and kept to a few pieces per surface. */

export type DressRole = 'worktop' | 'island' | 'bar' | 'table' | 'dining' | 'console' | 'nightstand' | 'desk' | 'shelf';

/** Modules whose tops are dressed, by role. */
const SURFACE_MODULES: readonly [RegExp, DressRole][] = [
  [/^fit-b3-kitchen-top(-ledge)?$/, 'bar'],
  [/^fit-[a-z0-9]+-kitchen-top(-ledge)?$/, 'worktop'],
  [/^fit-(kitchen-run(-luxury)?|capsule-kitchen|capsule-japantown-kitchen|damaged-kitchen)$/, 'worktop'],
  [/-(island|counter)-top$/, 'island'],
  [/^fit-bar-counter(-luxury|-\d+)?$/, 'bar'],
  [/^fit-(low-table(-luxury(-\d+)?)?|sandra-low-table|capsule-low-table)$/, 'table'],
  [/^fit-(table(-\d+)?|dining-corpo-(four|pair|breakfast))$/, 'dining'],
  [/^fit-(media-corpo|b3-media-top|e5-bar-top)$/, 'console'],
  [/^fit-(bedside-corpo|e1-nightstand)$/, 'nightstand'],
  [/^fit-(desk|e1-desk|sandra-writing-desk|capsule-desk|damaged-caretaker-desk)$/, 'desk'],
  [/^fit-(bookcase-luxury|shelf|sandra-bookcase|damaged-shelf|damaged-community-shelf|c1-niche-bay|c1-niche-shelves)$|^wall-shelf(-capsule)?$/, 'shelf'],
];
/** Catalog desks: their top is the model's height over its footprint. */
const DESK_PROPS = new Set(['sketchfab-elegant-black-office-desk', 'polyhaven-metal-office-desk', 'sketchfab-scifi-desk']);

/** What a role stands on its surface, rich and plain. Ids are catalog props or decor modules. */
const PALETTE: Record<DressRole, { rich: readonly string[]; plain: readonly string[]; perSurface: number; lead?: [string, string] }> = {
  worktop: { rich: ['decor-coffee-machine', 'polyhaven-wooden-cutting-board', 'decor-canisters', 'polyhaven-potted-plant-04', 'decor-knife-block', 'decor-kettle', 'decor-fruit-bowl', 'polyhaven-metal-jug'],
    plain: ['decor-kettle', 'polyhaven-metal-jug', 'polyhaven-wooden-cutting-board', 'decor-canisters', 'decor-bottles'], perSurface: 2, lead: ['decor-coffee-machine', 'decor-kettle'] },
  island: { rich: ['decor-fruit-bowl', 'polyhaven-ceramic-vase-02', 'decor-tray', 'polyhaven-wooden-bowl-02', 'decor-books-stack'],
    plain: ['decor-fruit-bowl', 'decor-tumblers'], perSurface: 2 },
  bar: { rich: ['polyhaven-wine-bottles-01', 'sketchfab-whiskey-glass', 'sketchfab-jack-daniels', 'decor-tray', 'decor-bottles', 'sketchfab-whiskey-glass'],
    plain: ['decor-bottles', 'decor-tumblers'], perSurface: 3, lead: ['polyhaven-wine-bottles-01', 'decor-bottles'] },
  table: { rich: ['polyhaven-ceramic-vase-01', 'decor-books-stack', 'polyhaven-horse-head', 'polyhaven-wooden-bowl-02', 'decor-tray', 'polyhaven-potted-plant-04'],
    plain: ['decor-books-stack', 'decor-tumblers', 'polyhaven-metal-jug'], perSurface: 2 },
  dining: { rich: ['decor-fruit-bowl', 'polyhaven-ceramic-vase-02', 'decor-tray'], plain: ['decor-fruit-bowl'], perSurface: 1 },
  console: { rich: ['polyhaven-ceramic-vase-01', 'polyhaven-standing-picture-frame-02', 'polyhaven-marble-bust-01', 'decor-books-stack', 'polyhaven-ceramic-vase-03', 'polyhaven-katana-stand-01', 'polyhaven-brass-vase-04'],
    plain: ['decor-books-stack', 'polyhaven-metal-jug'], perSurface: 3 },
  nightstand: { rich: ['polyhaven-standing-picture-frame-02', 'decor-table-lamp', 'decor-books-stack', 'polyhaven-potted-plant-04'],
    plain: ['decor-books-stack', 'decor-tumblers'], perSurface: 1 },
  desk: { rich: ['sketchfab-laptop', 'polyhaven-desk-lamp-arm-01', 'polyhaven-potted-plant-04', 'decor-books-stack', 'polyhaven-standing-picture-frame-02'],
    plain: ['sketchfab-laptop', 'decor-books-stack', 'polyhaven-desk-lamp-arm-01'], perSurface: 3, lead: ['sketchfab-laptop', 'sketchfab-laptop'] },
  shelf: { rich: ['decor-books-row-a', 'polyhaven-ceramic-vase-03', 'decor-books-row-b', 'polyhaven-standing-picture-frame-02', 'polyhaven-ceramic-vase-04',
    'polyhaven-marble-bust-01', 'decor-books-row-c', 'polyhaven-brass-vase-04', 'polyhaven-katana-stand-01', 'polyhaven-potted-plant-04', 'decor-books-stack'],
    plain: ['decor-books-row-b', 'polyhaven-metal-jug', 'decor-books-row-a', 'decor-bottles', 'decor-canisters', 'decor-books-stack'], perSurface: 2 },
};
/** Counter pieces that take stools along their front, and the stool they take. */
const STOOLS: readonly [RegExp, string][] = [[/^fit-e1-island-top$/, 'fit-bar-stool-e1'], [/^fit-b3-counter-top$/, 'fit-bar-stool-b3']];
/** Most dressing pieces a floor takes, and a shelf module. */
const FLOOR_CAP = 140, SHELF_CAP = 5;
/** Faces a worktop or island never takes things on: a hob's glass, black plates, lenses,
 *  screens, a sink's steel. */
const NOT_A_WORKTOP = /paired-cladding-metal|glass|e1-ceiling|light-fixture|screen|interior-led|satin-fine/;
/** Highest shelf level dressed: above it nobody reaches or sees. */
const SHELF_TOP = 1.9;
/** A shelf's board or a worktop spans most of its module; a narrower level is the top of
 *  something standing on it (a baked stack of books), not a place to stand more. */
const BOARD_SHARE = .4;
/** One per room: nobody keeps two coffee machines in one kitchen. */
const ONCE_PER_ROOM = new Set(['decor-coffee-machine', 'decor-kettle', 'decor-knife-block', 'sketchfab-laptop', 'polyhaven-desk-lamp-arm-01', 'polyhaven-wine-bottles-01', 'decor-bottles',
  'polyhaven-katana-stand-01', 'polyhaven-marble-bust-01', 'polyhaven-horse-head']);

interface Level { y: number; x0: number; x1: number; z0: number; z1: number; tris: number[][]; slot?: string }
interface Solid { min: [number, number, number]; max: [number, number, number] }
interface Shape { levels: Level[]; solids: Solid[] }
interface Piece { id: string; prop?: AssetEntry; module?: string; size: [number, number, number] }

const shapes = new Map<string, Shape>();

/** The upward faces of a module grouped by height (2 mm), with their plan bounds, and every
 *  triangle's box for clearance tests. */
function shapeOf(module: string): Shape | null {
  if (shapes.has(module)) return shapes.get(module)!;
  const recipe = placementRecipe(module);
  if (!recipe) return null;
  const levels = new Map<string, Level>(), solids: Solid[] = [];
  for (const slot of recipe.mesh.materials()) {
    const g = recipe.mesh.getGroup(slot)!, p = g.positions, idx = g.indices;
    for (let t = 0; t < idx.length; t += 3) {
      const v = [idx[t]!, idx[t + 1]!, idx[t + 2]!].map(i => [p[3 * i]!, p[3 * i + 1]!, p[3 * i + 2]!]);
      const [a, b, c] = v as [number[], number[], number[]];
      solids.push({ min: [0, 1, 2].map(k => Math.min(a[k]!, b[k]!, c[k]!)) as Solid['min'], max: [0, 1, 2].map(k => Math.max(a[k]!, b[k]!, c[k]!)) as Solid['max'] });
      const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      const len = Math.hypot(n[0]!, n[1]!, n[2]!);
      if (len < 1e-9 || n[1]! / len < .97 || Math.abs(a[1]! - b[1]!) > .002 || Math.abs(a[1]! - c[1]!) > .002) continue;
      const key = `${slot}|${Math.round(a[1]! / .002)}`;
      const level = levels.get(key) ?? { y: a[1]!, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, tris: [], slot };
      for (const q of v) { level.x0 = Math.min(level.x0, q[0]!); level.x1 = Math.max(level.x1, q[0]!); level.z0 = Math.min(level.z0, q[2]!); level.z1 = Math.max(level.z1, q[2]!); }
      level.y = Math.max(level.y, a[1]!, b[1]!, c[1]!);
      level.tris.push([a[0]!, a[2]!, b[0]!, b[2]!, c[0]!, c[2]!]);
      levels.set(key, level);
    }
  }
  const shape: Shape = { levels: [...levels.values()].filter(l => (l.x1 - l.x0) * (l.z1 - l.z0) >= .012 && l.x1 - l.x0 >= .08 && l.z1 - l.z0 >= .08), solids };
  shapes.set(module, shape);
  return shape;
}

const inTriangle = (x: number, z: number, t: number[]) => {
  const d = (ax: number, az: number, bx: number, bz: number) => (x - bx) * (az - bz) - (ax - bx) * (z - bz);
  const d1 = d(t[0]!, t[1]!, t[2]!, t[3]!), d2 = d(t[2]!, t[3]!, t[4]!, t[5]!), d3 = d(t[4]!, t[5]!, t[0]!, t[1]!);
  return !((d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9) && (d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9));
};

/** Deterministic hash of a string to [0, 1). */
function unit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

export interface DressOptions {
  seed: string | number;
  models: ModelPresence;
  tier?: Tier;
}

/** Dress every dressable surface of the floor's placed furniture; returns the pieces added. */
export function dressFloor(builder: PlacementBuilder, floor: FloorInterior, options: DressOptions): Placement[] {
  const catalog = new Map(loadAssetCatalog().assets.map(asset => [asset.id, asset]));
  const rich = options.tier !== 'poor';
  const piece = (id: string): Piece | null => {
    if (id.startsWith('decor-')) {
      const recipe = placementRecipe(id);
      return recipe ? { id, module: id, size: [recipe.size[0], recipe.size[2], recipe.size[1]] } : null;
    }
    const asset = catalog.get(id);
    if (!asset?.dimensionsMeters) return null;
    // A model the runtime lacks is reported like any furniture model found absent.
    if (!options.models.present.has(id)) { options.models.missing.add(id); return null; }
    return { id, prop: asset, size: asset.dimensionsMeters };
  };
  const added: Placement[] = [], used = new Map<string, Set<string>>();
  const base = builder.placements.slice();
  const rooms = new Map((floor.rooms ?? []).map(room => [room.id, room]));

  for (const placement of base) {
    if (added.length >= FLOOR_CAP) break;
    let role: DressRole | undefined, levels: Level[] = [], solids: Solid[] = [], scale = placement.scale;
    if (placement.module) {
      role = SURFACE_MODULES.find(([test]) => test.test(placement.module!))?.[1];
      if (!role) continue;
      const shape = shapeOf(placement.module);
      if (!shape) continue;
      ({ levels, solids } = shape);
    } else if (placement.prop && DESK_PROPS.has(placement.prop)) {
      const asset = catalog.get(placement.prop);
      if (!asset?.dimensionsMeters) continue;
      const [w, d, h] = asset.dimensionsMeters, yaw = asset.frontYawDeg ?? 0;
      const [pw, pd] = yaw === 90 || yaw === 270 ? [d, w] : [w, d];
      role = 'desk'; scale = [1, 1, 1];
      levels = [{ y: h * placement.scale[1], x0: -pw / 2 + .06, x1: pw / 2 - .06, z0: -pd / 2 + .06, z1: pd / 2 - .06, tris: [] }];
    } else continue;
    const palette = PALETTE[role], list = rich ? palette.rich : palette.plain;
    const room = placement.room, key = `${options.seed}|${room}|${placement.id}`;
    const roomUsed = used.get(room) ?? new Set<string>(); used.set(room, roomUsed);
    // Tallest boards first for shelves reads oddly; dress from the lowest usable board up.
    const moduleWidth = placement.module ? placementRecipe(placement.module)!.size[0] : Infinity;
    const ordered = [...levels].filter(level => !((role === 'worktop' || role === 'island') && NOT_A_WORKTOP.test(level.slot ?? ''))
      && !(role === 'shelf' && level.y * scale[1] > SHELF_TOP) && level.x1 - level.x0 >= BOARD_SHARE * Math.min(moduleWidth, 1.2))
      .sort((a, b) => a.y - b.y);
    let count = 0;
    for (const [li, level] of ordered.entries()) {
      if (added.length >= FLOOR_CAP || (role === 'shelf' && count >= SHELF_CAP)) break;
      const sx = scale[0], sy = scale[1], sz = scale[2];
      const rect = { x0: level.x0 * sx, x1: level.x1 * sx, z0: level.z0 * sz, z1: level.z1 * sz }, y = level.y * sy;
      // Worktops keep a hand's width off the wall; islands and tables keep their edges clear.
      const margin = role === 'shelf' ? .015 : .05;
      const width = rect.x1 - rect.x0 - 2 * margin, depth = rect.z1 - rect.z0 - 2 * margin;
      if (width < .08 || depth < .06) continue;
      const slots = Math.max(1, Math.min(palette.perSurface, Math.floor(width / (role === 'shelf' ? .28 : .42))));
      const placed: [number, number, number, number][] = [];
      for (let s = 0; s < slots; s++) {
        const pick = unit(`${key}|${li}|${s}`);
        // Try the palette in a seeded rotation until one fits.
        const first = palette.lead?.[rich ? 0 : 1];
        const lead = first && s === 0 && !roomUsed.has(first) ? [first] : [];
        const order = [...lead, ...list.map((_, i) => list[(Math.floor(pick * list.length) + i) % list.length]!)];
        for (const id of order) {
          if (ONCE_PER_ROOM.has(id) && roomUsed.has(id)) continue;
          const item = piece(id);
          if (!item) continue;
          const [w, d, h] = item.size;
          if (w > width || d > depth) continue;
          // Clear space over the level: the module's own geometry above it (the next board,
          // a back panel) bounds what may stand there.
          const cellW = width / slots, cx = rect.x0 + margin + cellW * (s + .5) + (unit(`${key}|${li}|${s}|x`) - .5) * Math.max(0, cellW - w) * .6;
          const back = role === 'worktop' || role === 'shelf' || role === 'console' || role === 'bar' || role === 'desk';
          const cz = back ? rect.z0 + margin + d / 2 + (role === 'desk' && s === 0 ? Math.max(0, depth - d) * .5 : 0) : (rect.z0 + rect.z1) / 2 + (unit(`${key}|${li}|${s}|z`) - .5) * Math.max(0, depth - d) * .5;
          const box: [number, number, number, number] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];
          if (box[0] < rect.x0 + margin - 1e-6 || box[1] > rect.x1 - margin + 1e-6) continue;
          if (placed.some(o => o[0] < box[1] + .02 && box[0] < o[1] + .02 && o[2] < box[3] + .02 && box[2] < o[3] + .02)) continue;
          if (level.tris.length && ![[box[0], box[2]], [box[1], box[2]], [box[1], box[3]], [box[0], box[3]], [cx, cz]]
            .every(([x, z]) => level.tris.some(t => inTriangle(x! / sx, z! / sz, t)))) continue;
          const lo = y + .003, hi = y + h;
          if (solids.some(b => b.max[1] * sy > lo && b.min[1] * sy < hi && b.max[0] * sx > box[0] && b.min[0] * sx < box[1] && b.max[2] * sz > box[2] && b.min[2] * sz < box[3])) continue;
          placed.push(box);
          if (ONCE_PER_ROOM.has(id)) roomUsed.add(id);
          const yaw = placement.rotationY + (role === 'shelf' || role === 'console' || id.includes('frame') || id.includes('laptop') || id.includes('machine') ? 0 : (unit(`${key}|${li}|${s}|r`) - .5) * .6);
          added.push(stand(builder, item, room, placement, [cx, y, cz], yaw));
          count++;
          break;
        }
      }
    }
    // Stools along a counter's front.
    const stool = placement.module ? STOOLS.find(([test]) => test.test(placement.module!))?.[1] : undefined;
    if (stool && added.length < FLOOR_CAP) {
      const counter = floor.furniture.find(item => item.room === room && Math.hypot(item.position[0] - placement.position[0], item.position[1] - placement.position[2]) < .05);
      if (counter) added.push(...stools(builder, floor, counter, stool, rooms.get(room)?.polygon));
    }
  }
  return added;
}

/** One dressing piece at (x, y, z) of `on`'s local frame (its scale already applied). */
function stand(builder: PlacementBuilder, item: Piece, room: string, on: Placement, [x, y, z]: [number, number, number], yaw: number): Placement {
  const c = Math.cos(on.rotationY), s = Math.sin(on.rotationY);
  const position: [number, number, number] = [on.position[0] + x * c + z * s, on.position[1] + y, on.position[2] + z * c - x * s];
  if (item.module) return builder.module(item.module, room, position.map(v => clean(v)) as [number, number, number], [1, 1, 1], yaw, { id: `${on.id}/dress-${builder.placements.length}` });
  const asset = item.prop!;
  const placement: Placement = { id: `${on.id}/dress-${builder.placements.length}`, prop: asset.id, room, position: position.map(v => clean(v)) as [number, number, number],
    rotationY: clean(yaw + (asset.frontYawDeg ?? 0) * Math.PI / 180), scale: [1, 1, 1] };
  builder.placements.push(placement);
  return placement;
}

/** Stools at a counter record's front (+z), 0.6 m apart, each only where it stands inside
 *  its room, off every other piece and clear of the room's doorways. */
function stools(builder: PlacementBuilder, floor: FloorInterior, counter: FloorInterior['furniture'][number], module: string, polygon?: Point[]): Placement[] {
  const recipe = placementRecipe(module);
  if (!recipe || !polygon) return [];
  const [w, d] = counter.size, r = Math.max(recipe.size[0], recipe.size[2]) / 2, pitch = .6;
  const angle = counter.rotationDeg * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const n = Math.max(0, Math.floor((w - .2) / pitch)), out: Placement[] = [];
  const room = floor.rooms.find(entry => entry.id === counter.room);
  const doors = room?.doors ?? [];
  for (let i = 0; i < n; i++) {
    const lx = -((n - 1) * pitch) / 2 + i * pitch, lz = d / 2 + r * .55;
    const at: Point = [counter.position[0] + lx * c + lz * s, counter.position[1] + lz * c - lx * s];
    const ring = Array.from({ length: 8 }, (_, k) => [at[0] + Math.cos(k * Math.PI / 4) * (r + .08), at[1] + Math.sin(k * Math.PI / 4) * (r + .08)] as Point);
    if (!ring.every(p => pointInPolygon(p, polygon))) continue;
    if (doors.some(door => Math.hypot(door.position[0] - at[0], door.position[1] - at[1]) < door.width / 2 + .9)) continue;
    const blocked = floor.furniture.some(other => {
      if (other.id === counter.id || other.room !== counter.room || (other.elevation ?? 0) > .8) return false;
      const oa = other.rotationDeg * Math.PI / 180, dx = at[0] - other.position[0], dz = at[1] - other.position[1];
      const u = dx * Math.cos(oa) - dz * Math.sin(oa), v = dx * Math.sin(oa) + dz * Math.cos(oa);
      return Math.abs(u) < other.size[0] / 2 + r + .05 && Math.abs(v) < other.size[1] / 2 + r + .05;
    });
    if (blocked) continue;
    out.push(builder.module(module, counter.room, [clean(at[0]), counter.elevation ?? 0, clean(at[1])], [1, 1, 1], clean(angle + Math.PI), { id: `${counter.id}/stool-${i}` }));
  }
  return out;
}
