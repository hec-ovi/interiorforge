import { Kit } from '../src/modules/kit.js';
import type { RecipeSet } from '../src/modules/recipes.js';
import { PlacementBuilder, clean } from '../src/placements/builder.js';
import type { Placement } from '../src/placements/types.js';
import { indexRecipes } from '../src/styles/systems/built-ins.js';

/** Test harness for the built-in systems: builds recipe sets into meshes, places modules
 *  without the shared catalog, and transforms authored vertices exactly as the builder does. */
export type V3 = [number, number, number];
export interface Built { id: string; kit: Kit; triangles: number; min: V3; max: V3 }

export function buildSet(...sets: RecipeSet[]): Map<string, Built> {
  const out = new Map<string, Built>();
  for (const set of sets) {
    indexRecipes(set);
    set((id, draw) => {
      if (out.has(id)) throw new Error(`duplicate module ${id}`);
      const kit = new Kit(() => [1, 1]);
      draw(kit);
      const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
      let triangles = 0;
      for (const slot of kit.mesh.materials()) {
        const g = kit.mesh.getGroup(slot)!;
        triangles += g.indices.length / 3;
        for (let i = 0; i < g.positions.length; i++) {
          min[i % 3] = Math.min(min[i % 3]!, g.positions[i]!);
          max[i % 3] = Math.max(max[i % 3]!, g.positions[i]!);
        }
      }
      out.set(id, { id, kit, triangles, min, max });
    });
  }
  return out;
}

/** Places anything: the shared catalog does not hold the systems' modules yet. */
export class FreeBuilder extends PlacementBuilder {
  override module(module: string, room: string, position: V3, scale: V3 = [1, 1, 1], rotationY = 0,
    extra: Partial<Pick<Placement, 'id' | 'opening'>> = {}): Placement {
    if (scale.some(n => !Number.isFinite(n) || n <= 0) || position.some(n => !Number.isFinite(n)))
      throw new Error(`invalid transform for ${module}`);
    const placement: Placement = { id: `module:${this.placements.length}`, module, room,
      position: position.map(clean) as V3, rotationY: clean(rotationY), scale: scale.map(clean) as V3, ...extra };
    this.placements.push(placement);
    return placement;
  }
}

export function transform(p: Placement, v: V3): V3 {
  const c = Math.cos(p.rotationY), s = Math.sin(p.rotationY);
  const x = v[0] * p.scale[0], y = v[1] * p.scale[1], z = v[2] * p.scale[2];
  return [x * c + z * s + p.position[0], y + p.position[1], z * c - x * s + p.position[2]];
}

/** World vertices of every placed module (optionally mapped into another frame). */
export function* vertices(placements: Placement[], meshes: Map<string, Built>): Generator<{ p: Placement; v: V3 }> {
  for (const p of placements) {
    const built = meshes.get(p.module!);
    if (!built) throw new Error(`no recipe for ${p.module}`);
    for (const slot of built.kit.mesh.materials()) {
      const pos = built.kit.mesh.getGroup(slot)!.positions;
      for (let i = 0; i < pos.length; i += 3) yield { p, v: transform(p, [pos[i]!, pos[i + 1]!, pos[i + 2]!]) };
    }
  }
}

/** World triangles of every placed module. */
export function* triangles(placements: Placement[], meshes: Map<string, Built>): Generator<{ p: Placement; slot: string; t: [V3, V3, V3] }> {
  for (const p of placements) {
    const built = meshes.get(p.module!)!;
    for (const slot of built.kit.mesh.materials()) {
      const g = built.kit.mesh.getGroup(slot)!, pos = g.positions;
      const at = (i: number) => transform(p, [pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!]);
      for (let i = 0; i < g.indices.length; i += 3) yield { p, slot, t: [at(g.indices[i]!), at(g.indices[i + 1]!), at(g.indices[i + 2]!)] };
    }
  }
}

/** World bounding box of a placement: the engine collides a module as this box. */
export function worldBox(p: Placement, meshes: Map<string, Built>): { min: V3; max: V3 } {
  const b = meshes.get(p.module!)!, min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
    const v = transform(p, [x, y, z]);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i]!, v[i]!); max[i] = Math.max(max[i]!, v[i]!); }
  }
  return { min, max };
}
