import type { Point } from '../../core/geom.js';
import type { Furniture, LightFixture } from '../../core/types.js';
import { triangulate } from '../../core/triangulate.js';
import { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { Placement } from '../../placements/types.js';

/** Shared plumbing of the built-in systems (portals, runs, kitchen walls, housings,
 *  planters): one piece-local frame, closed prisms and lens records. Every system places
 *  modules at scale 1 or stretched along the one axis their cross-section allows; nothing
 *  here scales a detail. Recipe sets and kind registries import this file, so it must never
 *  import the placement builder or the module catalog (which load the kind registries). */

export const CELL = .5;
export type V3 = [number, number, number];

/** A piece-local frame on the floor: x across, y up, +z front (into the room), the same
 *  transform `PlacementBuilder.module` applies, so a local point and a module placed at it
 *  agree exactly. */
export class LocalFrame {
  readonly cos: number;
  readonly sin: number;
  constructor(readonly origin: V3, readonly rotation: number) {
    this.cos = Math.cos(rotation);
    this.sin = Math.sin(rotation);
  }
  /** floor-relative world point of local (x, y, z) */
  at(x: number, y: number, z: number): V3 {
    return [this.origin[0] + x * this.cos + z * this.sin, this.origin[1] + y, this.origin[2] - x * this.sin + z * this.cos];
  }
  /** world unit vector of local +x */
  get axis(): V3 { return [this.cos, 0, -this.sin]; }
  /** world unit vector of local +z */
  get front(): V3 { return [this.sin, 0, this.cos]; }
  /** record run direction around +Y, degrees, for a line along local +x */
  get angleDeg(): number { return round(((-this.rotation * 180 / Math.PI) % 360 + 360) % 360, 100); }
  /** the same frame turned half round about its origin: local +z becomes the back */
  get reversed(): LocalFrame { return new LocalFrame(this.origin, this.rotation + Math.PI); }
  /** a frame whose origin is local (x, y, z) of this one */
  shifted(x: number, y: number, z: number): LocalFrame { return new LocalFrame(this.at(x, y, z), this.rotation); }
  place(builder: PlacementBuilder, module: string, room: string, x: number, y: number, z: number,
    scale: V3 = [1, 1, 1], extra: { id?: string } = {}): Placement {
    return builder.module(module, room, this.at(x, y, z), scale, this.rotation, extra);
  }
}

/** The frame of a furniture record: origin at its centre on the floor (or its elevation),
 *  local +z its front, as `props()` places a fitted module. */
export function itemFrame(item: Furniture): LocalFrame {
  return new LocalFrame([item.position[0], item.elevation ?? 0, item.position[1]], item.rotationDeg * Math.PI / 180);
}

/** Authored bounds of the modules the built-in systems lay out, measured from their recipe
 *  sets exactly as the catalog measures them. The placers cannot ask the catalog: it loads
 *  the kind registries, which load these systems (a load cycle). */
const LOCAL_SIZES = new Map<string, V3>();
const PENDING: RecipeSet[] = [];

/** Makes a recipe set's modules measurable by the systems (measured on first use). Every set
 *  whose modules a run, kitchen wall, planter or housing spec names must be registered. */
export function registerModuleSizes(...sets: RecipeSet[]): void {
  PENDING.push(...sets);
}

/** Authored bounds of a module drawn by a registered set. */
export function moduleSize(id: string): V3 {
  while (!LOCAL_SIZES.has(id) && PENDING.length) indexRecipes(PENDING.shift()!);
  const size = LOCAL_SIZES.get(id);
  if (!size) throw new Error(`unknown module ${id}: register its recipe set with registerModuleSizes`);
  return size;
}

/** Measure the modules of a recipe set now. */
export function indexRecipes(set: RecipeSet): void {
  set((id, draw) => {
    if (LOCAL_SIZES.has(id)) return;
    const kit = new Kit(() => [1, 1]);
    draw(kit);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const slot of kit.mesh.materials()) {
      const p = kit.mesh.getGroup(slot)!.positions;
      for (let i = 0; i < p.length; i++) {
        min[i % 3] = Math.min(min[i % 3]!, p[i]!);
        max[i % 3] = Math.max(max[i % 3]!, p[i]!);
      }
    }
    LOCAL_SIZES.set(id, max.map((v, i) => round(v - min[i]!, 1e6)) as V3);
  });
}

export const round = (n: number, scale = 1000): number => Math.round(n * scale) / scale;

/** A closed prism through z over an xy outline (holes as concave outlines). */
export function xyPrism(k: Kit, slot: string, polygon: Point[], z0: number, z1: number, sides = true): void {
  const area = polygon.reduce((s, p, i) => { const q = polygon[(i + 1) % polygon.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const p = area < 0 ? [...polygon].reverse() : polygon;
  const triangles = triangulate(p);
  for (const [z, n] of [[z0, -1], [z1, 1]] as const) {
    k.mesh.addSurface(slot, {
      positions: p.flatMap(([x, y]) => [x, y, z]), normals: p.flatMap(() => [0, 0, n]),
      uvs: p.flatMap(([x, y]) => [x, -y]), indices: triangles.flatMap(([a, b, c]) => n > 0 ? [a, b, c] : [a, c, b]),
    });
  }
  if (!sides) return;
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!;
    k.mesh.addQuad(slot, [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]);
  }
}

/** A closed prism along x over a yz outline, from x0 to x1: the constant cross-section of a
 *  stretched body (housing, trough, worktop lip). */
export function yzPrism(k: Kit, slot: string, outline: Point[], x0: number, x1: number, caps = true): void {
  const area = outline.reduce((s, p, i) => { const q = outline[(i + 1) % outline.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  // Outline points are (y, z); CCW in (y, z) faces +x.
  const p = area < 0 ? [...outline].reverse() : outline;
  if (caps) {
    const triangles = triangulate(p);
    for (const [x, n] of [[x0, -1], [x1, 1]] as const) {
      k.mesh.addSurface(slot, {
        positions: p.flatMap(([y, z]) => [x, y, z]), normals: p.flatMap(() => [n, 0, 0]),
        uvs: p.flatMap(([y, z]) => [z, y]), indices: triangles.flatMap(([a, b, c]) => n > 0 ? [a, b, c] : [a, c, b]),
      });
    }
  }
  for (let i = 0; i < p.length; i++) {
    const a = p[i]!, b = p[(i + 1) % p.length]!;
    k.mesh.addQuad(slot, [[x0, a[0], a[1]], [x0, b[0], b[1]], [x1, b[0], b[1]], [x1, a[0], a[1]]]);
  }
}

/** Points of a quarter (or any) arc, `segments` steps from angle a0 to a1 (radians). */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, segments: number): Point[] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / segments;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Point;
  });
}

/** A rectangle with rounded ends along x (a slot or pill), as an outline. */
export function pill(cx: number, cy: number, length: number, width: number, segments = 6): Point[] {
  const r = width / 2, half = Math.max(0, length / 2 - r);
  return [...arc(cx + half, cy, r, -Math.PI / 2, Math.PI / 2, segments), ...arc(cx - half, cy, r, Math.PI / 2, Math.PI * 1.5, segments)];
}

export interface LensLight {
  /** line colour (linear RGB); kelvin when absent */
  color?: [number, number, number];
  kelvin?: number;
  lumensPerMetre: number;
  facing: 'up' | 'down';
  range?: number;
  beamDeg?: number;
  diffuse?: number;
}

/** The record of one straight lens placed along local +x of `frame` at (x, y, z): the same
 *  id as its placement (architectural lens) or owned by a furniture item (assembly lens).
 *  y comes back building-local. */
export function lensRecord(frame: LocalFrame, room: string, id: string, x: number, y: number, z: number,
  length: number, elevation: number, light: LensLight, owner?: { furniture: string },
  direction?: V3, axis?: V3): LightFixture {
  const p = frame.at(x, y, z);
  return {
    id, ...(owner ? { furniture: owner.furniture } : {}), kind: owner ? 'strip' : 'cove', room,
    position: [round(p[0]), round(p[1] + elevation), round(p[2])], length: round(length), angleDeg: frame.angleDeg,
    intensity: Math.round(length * light.lumensPerMetre), colorTemperatureK: light.kelvin ?? 4000,
    ...(light.color ? { color: light.color } : {}),
    axis: (axis ?? frame.axis).map(v => round(v, 1e6)) as V3,
    direction: (direction ?? (light.facing === 'down' ? [0, -1, 0] : [0, 1, 0])).map(v => round(v, 1e6)) as V3,
    range: light.range ?? 2.5, beamDeg: light.beamDeg ?? 150, diffuse: light.diffuse ?? .85, facing: light.facing,
  };
}

/** Split [a, b] around blocked intervals, keeping pieces at least `min` long. */
export function freeIntervals(a: number, b: number, blocked: readonly [number, number][], min = 0): [number, number][] {
  let runs: [number, number][] = [[a, b]];
  for (const [c, d] of blocked) {
    runs = runs.flatMap(([lo, hi]) => d <= lo || c >= hi ? [[lo, hi] as [number, number]]
      : [[lo, Math.max(lo, c)] as [number, number], [Math.min(hi, d), hi] as [number, number]]);
  }
  return runs.filter(([lo, hi]) => hi - lo > min + 1e-9);
}
