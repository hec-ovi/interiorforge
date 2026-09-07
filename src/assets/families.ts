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
};

export function assetFamilyForFurniture(kind: FurnitureKind): AssetFamily | null {
  return FAMILY_BY_KIND[kind] ?? null;
}

export interface FurnitureAssetQuery {
  styles?: readonly string[];
  variationDeg?: number;
  modelsDir?: string;
}

export function findFurnitureAssets(item: Furniture, query: FurnitureAssetQuery = {}): AssetEntry[] {
  const family = assetFamilyForFurniture(item.kind);
  if (!family || item.elevation) return [];
  const candidates = findAssetCandidates({
    family,
    styles: query.styles,
    maxBounds: item.size,
    rotationYDeg: query.variationDeg,
    modelsDir: query.modelsDir,
  });
  const allowed = ASSETS_BY_KIND[item.kind];
  return allowed ? candidates.filter((asset) => allowed.includes(asset.id)) : candidates;
}
