import { Kit, type Alignment } from '../../modules/kit.js';
import type { UvScale } from '../../glb/mesh-builder.js';
import type { RecipeSet } from '../../modules/recipes.js';

/** A slot rule: the material a module's slot wears in this kind (the slot itself to keep it). */
export type SlotRule = (module: string, slot: string) => string;

/** The same modules in other materials: each module is drawn once into a scratch kit whose
 *  UV scale and alignment are those of the slot it will wear, then its surfaces move over
 *  under the new slot names. Geometry, ids and bounds are unchanged, so a shared built-in
 *  can wear a kind's own published finishes without a second copy of its code. */
export function remapSlots(set: RecipeSet, rule: SlotRule): RecipeSet {
    return add => set((id, draw) => add(id, k => {
        const target = k as unknown as { mesh: { uvScale: UvScale }; alignment: Alignment };
        const tile = target.mesh.uvScale, align = target.alignment;
        const source = new Kit(slot => tile(rule(id, slot)), slot => align(rule(id, slot)));
        draw(source);
        for (const slot of source.mesh.materials()) k.mesh.addSurface(rule(id, slot), source.mesh.getGroup(slot)!);
    }));
}
