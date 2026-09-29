import { Kit, type Alignment } from '../../modules/kit.js';
import type { MeshGroup } from '../../glb/mesh-builder.js';
import type { RecipeSet } from '../../modules/recipes.js';

/** A slot rule: the material a module's slot wears in this kind (the slot itself to keep it). */
export type SlotRule = (module: string, slot: string) => string;

/** A face of a flat module stands this far off its twin. */
const SKIN = .002;

/** The same modules in other materials: each module is drawn once into a scratch kit in
 *  metre UVs with the alignment of the slot it will wear, then its surfaces move over under
 *  the new slot names (the catalog kit scales their UVs to that slot's tiling). Geometry,
 *  ids and bounds are unchanged, so a shared built-in can wear a kind's own published
 *  finishes without a second copy of its code. A module drawn as a single sheet (a backing
 *  seen from below, a lens seen from above) gets its back face a skin away, so every module
 *  keeps a thickness on all three axes, as the published module table requires. */
export function remapSlots(set: RecipeSet, rule: SlotRule): RecipeSet {
    return add => set((id, draw) => add(id, k => {
        const align = (k as unknown as { alignment: Alignment }).alignment;
        const source = new Kit(() => [1, 1], slot => align(rule(id, slot)));
        draw(source);
        const groups = source.mesh.materials().map(slot => [rule(id, slot), source.mesh.getGroup(slot)!] as const);
        const flat = flatAxis(groups.map(([, g]) => g));
        for (const [slot, group] of groups) k.mesh.addSurface(slot, flat === undefined ? group : withBack(group, flat));
    }));
}

/** The axis all of a module's vertices share one coordinate on, if any. */
function flatAxis(groups: readonly MeshGroup[]): number | undefined {
    for (let axis = 0; axis < 3; axis++) {
        let lo = Infinity, hi = -Infinity;
        for (const g of groups) for (let i = axis; i < g.positions.length; i += 3) { lo = Math.min(lo, g.positions[i]!); hi = Math.max(hi, g.positions[i]!); }
        if (hi - lo < 1e-6 && lo !== Infinity) return axis;
    }
    return undefined;
}

/** The group plus its back face: the same triangles a skin behind it, facing the other way. */
function withBack(g: MeshGroup, axis: number): MeshGroup {
    const n = g.positions.length / 3, positions = [...g.positions], normals = [...g.normals], uvs = [...g.uvs], indices = [...g.indices];
    for (let v = 0; v < n; v++) {
        const p = [g.positions[3 * v]!, g.positions[3 * v + 1]!, g.positions[3 * v + 2]!];
        const facing = g.normals[3 * v + axis]! >= 0 ? 1 : -1;
        p[axis] = p[axis]! - facing * SKIN;
        positions.push(...p);
        normals.push(-g.normals[3 * v]!, -g.normals[3 * v + 1]!, -g.normals[3 * v + 2]!);
        uvs.push(g.uvs[2 * v]!, g.uvs[2 * v + 1]!);
    }
    for (let t = 0; t < g.indices.length; t += 3) indices.push(n + g.indices[t]!, n + g.indices[t + 2]!, n + g.indices[t + 1]!);
    return { positions, normals, uvs, indices };
}
