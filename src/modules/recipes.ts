import type { UvScale } from "../glb/mesh-builder.js";
import { Kit, type Alignment } from "./kit.js";
import type { ModuleRecipe } from "./types.js";
import { surfaceRecipes } from "./recipes/surfaces.js";
import { lightRecipes } from "./recipes/lights.js";
import { coreRecipes } from "./recipes/core.js";
import { furnitureRecipes } from "./recipes/furniture.js";

export type { ModuleRecipe } from "./types.js";

/** One recipe set draws its modules through `add`. */
export type RecipeSet = (add: (id: string, draw: (kit: Kit) => void) => void) => void;

const SETS: RecipeSet[] = [surfaceRecipes, lightRecipes, coreRecipes, furnitureRecipes];

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
  return recipes;
}
