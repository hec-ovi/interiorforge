import type { RecipeSet } from '../../modules/recipes.js';
import { Kit } from '../../modules/kit.js';
import { FINISH as F } from '../../modules/finishes.js';
import { apartmentDoorRecipes, type ApartmentEntrance } from '../luxury/apartment-doors.js';

/** The same manufactured pocket/cassette dimensions in clean ivory enamel and
 * brushed zinc. Physical dark digits remain legible on the metal numberplate. */
export const capsuleApartmentDoorRecipes: RecipeSet = add => {
  apartmentDoorRecipes((id, draw) => add(id.replace(/-luxury$/, '-capsule'), k => {
    const source = new Kit(() => [1,1]); draw(source);
    for (const slot of source.mesh.materials()) {
      const material = slot === F.timber ? 'cyberpunk/interior-capsule-enamel/mid#ivory'
        : slot === F.bronze ? F.zinc : slot;
      k.mesh.addSurface(material, source.mesh.getGroup(slot)!);
    }
  }));
};

export function capsuleApartmentEntrances(entrances: ApartmentEntrance[]): ApartmentEntrance[] {
  return entrances.map(entrance => ({...entrance,
    leaves: entrance.leaves.map(part => ({...part,module:part.module.replace(/-luxury$/, '-capsule')})),
    fixed: entrance.fixed.map(part => ({...part,module:part.module.replace(/-luxury$/, '-capsule')})),
  }));
}
