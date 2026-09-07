export { findAssetCandidates, fitAssetBounds, loadAssetCatalog } from "./catalog.js";
export { assetFamilyForFurniture, findFurnitureAssets, type FurnitureAssetQuery } from "./families.js";
export { AssetInstancer, instantiateAsset } from "./instance.js";
export {
  appendFurnitureAssets, prepareFurnitureAssets,
  type AssetReader, type FurnitureAssetSelection, type PreparedFurnitureAssets,
} from "./pipeline.js";
export type {
  AssetCatalog, AssetEntry, AssetFamily, AssetFit, AssetInstance, AssetInstanceOptions,
  AssetPlacement, AssetQuery, AssetReadOptions,
} from "./types.js";
