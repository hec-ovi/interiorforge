import type { RoomKind } from '../../core/types.js';
import type { RecipeSet } from '../../modules/recipes.js';

/** Biotechnica 63052/63516 has quiet light woven seating rugs. Corpo's private
 * lounge has a darker textile field. The physical weave repeats at the material's
 * 0.4m scale; resizing a room changes the rug extent, not the yarn size. */
export const luxuryRugRecipes: RecipeSet = add => {
  add('floor-rug-biotechnica', k => k.cbox('cyberpunk/biotechnica-rug/rich#ivory', [0, 0, 0], [.5, .009, .5]));
  add('floor-rug-corpo', k => k.cbox('cyberpunk/corpo-plaza-rug/rich#charcoal', [0, 0, 0], [.5, .009, .5]));
};

export function luxuryRugForRoom(kind?: RoomKind): string {
  return kind === 'living' || kind === 'bedroom' || kind === 'studio_main' ? 'floor-rug-corpo' : 'floor-rug-biotechnica';
}
