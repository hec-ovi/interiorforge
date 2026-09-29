import type { RecipeSet } from '../../modules/recipes.js';
import { Kit } from '../../modules/kit.js';
import { FINISH as F } from '../../modules/finishes.js';
import { apartmentDoorRecipes, type ApartmentEntrance } from '../luxury/apartment-doors.js';
import { DAMAGED_MODEL_MATERIALS as M } from './quality-recipes.js';

/** Same proven moving-leaf envelope and numberplate dimensions, in folded petrol
 * steel with brushed metal hardware and pale physical lettering. No extra passage solid. */
export const damagedApartmentDoorRecipes: RecipeSet = add => {
  apartmentDoorRecipes((id, draw) => add(id.replace(/-luxury$/, '-damaged'), k => {
    const source = new Kit(() => [1, 1]); draw(source);
    for (const slot of source.mesh.materials()) {
      const material = id.includes('digit') ? F.paper
        : id.includes('numberplate') && slot === F.bronze ? M.enamel
        : slot === F.timber ? M.enamel
        : slot === F.bronze ? M.stainless : slot;
      k.mesh.addSurface(material, source.mesh.getGroup(slot)!);
    }
  }));
};

/** Parent's generic entrance producer may apply after numbering/mount fitting. */
export function damagedApartmentEntrances(entrances: ApartmentEntrance[]): ApartmentEntrance[] {
  return entrances.map(entrance => ({ ...entrance,
    leaves: entrance.leaves.map(part => ({ ...part, module: part.module.replace(/-luxury$/, '-damaged') })),
    fixed: entrance.fixed.map(part => ({ ...part, module: part.module.replace(/-luxury$/, '-damaged') })),
  }));
}
