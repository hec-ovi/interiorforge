import { stairWallSkins } from "./recipes/stair-wall-skins.js";
import type { UvScale } from "../glb/mesh-builder.js";
import { Kit, type Alignment } from "./kit.js";
import type { ModuleRecipe } from "./types.js";
import { surfaceRecipes } from "./recipes/surfaces.js";
import { lightRecipes } from "./recipes/lights.js";
import { coreRecipes } from "./recipes/core.js";
import { doorRecipes } from "./recipes/doors.js";
import { liftRecipes } from "./recipes/lifts.js";
import { stairFinishRecipes } from "./recipes/stair-finishes.js";
import { stairGuardRecipes } from "./recipes/stair-guards.js";
import { furnitureRecipes } from "./recipes/furniture.js";
import { decorRecipes } from "./recipes/decor.js";
import { capsuleRecipes } from "../styles/capsule/recipes.js";
import { capsuleArchitecturalRecipes } from "../styles/capsule/architecture.js";
import { sandraRecipes } from "../styles/sandra/recipes.js";
import { damagedRecipes } from "../styles/damaged/recipes.js";
import { industrialRecipes } from "../styles/industrial/modules.js";
import { corporateRecipes } from "../styles/corporate/recipes.js";
import { luxuryPortalRecipes } from "../styles/luxury/portals.js";
import { luxurySurfaceRecipes } from "../styles/luxury/surfaces.js";
import { luxuryFurnitureRecipes } from "../styles/luxury/modules.js";
import { luxuryCeilingRecipes } from "../styles/luxury/ceiling.js";
import { apartmentDoorRecipes } from "../styles/luxury/apartment-doors.js";
import { capsuleApartmentDoorRecipes } from "../styles/capsule/apartment-doors.js";

import { referenceBotanicalRecipes } from "../styles/luxury/reference-botanical.js";
import { referenceFurnitureRecipes } from "../styles/luxury/reference-furniture.js";
import { luxuryAccessoryRecipes } from "../styles/luxury/accessories.js";
import { luxuryBathroomRecipes } from "../styles/luxury/bathroom.js";
import { corpoBathroomRecipes } from "../styles/luxury/corpo-bathroom.js";
import { loftBathroomRecipes } from "../styles/luxury/loft-bathroom.js";
import { luxuryRugRecipes } from "../styles/luxury/rugs.js";
import { luxuryDiningRecipes } from "../styles/luxury/dining.js";
import { loft1702FinishRecipes } from "../styles/luxury/loft-finish.js";
import { referenceRecipes, panelPieces } from "../styles/reference/recipes.js";

export type { ModuleRecipe } from "./types.js";

/** One recipe set draws its modules through `add`. */
export type RecipeSet = (add: (id: string, draw: (kit: Kit) => void) => void) => void;

const SETS: RecipeSet[] = [surfaceRecipes, lightRecipes, coreRecipes, doorRecipes, liftRecipes, capsuleArchitecturalRecipes, sandraRecipes, corpoBathroomRecipes, loftBathroomRecipes, luxuryRugRecipes, luxuryDiningRecipes, loft1702FinishRecipes,
  stairGuardRecipes, stairFinishRecipes, furnitureRecipes, decorRecipes, capsuleRecipes, damagedRecipes, industrialRecipes, corporateRecipes, luxuryPortalRecipes, luxurySurfaceRecipes, luxuryFurnitureRecipes, luxuryCeilingRecipes, apartmentDoorRecipes, capsuleApartmentDoorRecipes, luxuryBathroomRecipes, luxuryAccessoryRecipes, referenceFurnitureRecipes, referenceBotanicalRecipes,
  referenceRecipes];

/** Every shared module, authored in metres. `tile` gives UV units per metre per material
 *  slot, so tiled faces wear one UV unit per map repeat; without it metres stay. `alignment`
 *  says which slots are exact, so those faces wear their map once instead. */
export function moduleRecipes(tile: UvScale = () => [1, 1], alignment?: Alignment): ModuleRecipe[] {
  const recipes: ModuleRecipe[] = [];
  const ids = new Set<string>();
  const add = (id: string, draw: (kit: Kit) => void): void => {
    if (ids.has(id)) throw new Error(`duplicate module ${id}`);
    ids.add(id);
    const kit = new Kit(tile, alignment);
    draw(kit);
    kit.mesh.seal();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const slot of kit.mesh.materials()) {
      const p = kit.mesh.getGroup(slot)!.positions;
      for (let i = 0; i < p.length; i++) {
        const k = i % 3;
        min[k] = Math.min(min[k]!, p[i]!);
        max[k] = Math.max(max[k]!, p[i]!);
      }
    }
    const clean = (v: number) => Math.round(v * 1e6) / 1e6;
    recipes.push({
      id, mesh: kit.mesh,
      size: max.map((v, i) => clean(v - min[i]!)) as ModuleRecipe["size"],
      origin: min.map((v) => clean(-v)) as ModuleRecipe["origin"],
    });
  };
  for (const set of SETS) set(add);
  const pieces = panelPieces();
  stairWallSkins([...recipes], add, id => pieces.has(id));
  return recipes;
}
