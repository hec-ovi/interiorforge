import type { Furniture, FurnitureKind } from "../core/types.js";
import { findAssetCandidates } from "./catalog.js";
import type { AssetEntry, AssetFamily } from "./types.js";

const FAMILY_BY_KIND: Partial<Record<FurnitureKind, AssetFamily>> = {
  bed_double: "bed",
  bed_single: "bed",
  bench: "bench",
  chair: "chair",
  dining_table: "table",
  display_rack: "shelf",
  desk: "desk",
  fridge: "appliance",
  floor_clutter: "prop",
  low_table: "table",
  meeting_table: "table",
  office_chair: "chair",
  plant: "planter",
  reception_desk: "desk",
  shelf: "shelf",
  sink: "sink",
  sofa: "sofa",
  stool: "chair",
  toilet: "toilet",
  wall_shelf: "shelf",
  wardrobe: "storage",
};

const ASSETS_BY_KIND: Partial<Record<FurnitureKind, readonly string[]>> = {
  floor_clutter: ["sketchfab-animal-crossing-new-horizons-trash-bags"],
  fridge: ["sketchfab-fridgemodern", "sketchfab-unbranded-conventional-fridge"],
};

/** The catalog models a runtime holds, and those furniture wanted but found absent. */
export interface ModelPresence {
  present: ReadonlySet<string>;
  missing: Set<string>;
}

/** The catalog model a floor-standing furniture record wears: the first fitting entry whose
 *  model is present, redistributable before local-only, then by id. Every absent model
 *  ranked ahead of it joins `missing`. Null when none is present. */
export function chooseFurnitureAsset(item: Furniture, models: ModelPresence): AssetEntry | null {
  const family = FAMILY_BY_KIND[item.kind];
  if (!family || item.elevation) return null;
  const allowed = ASSETS_BY_KIND[item.kind];
  const ranked = findAssetCandidates(family, item.size)
    .filter(asset => asset.modelUri && asset.dimensionsMeters && (!allowed || allowed.includes(asset.id)))
    .sort((a, b) => Number(b.availability === "redistributable") - Number(a.availability === "redistributable")
      || a.id.localeCompare(b.id));
  for (const asset of ranked) {
    if (models.present.has(asset.id)) return asset;
    models.missing.add(asset.id);
  }
  return null;
}
