export { assetModelPath, findAssetCandidates, fitAssetBounds, isAssetAvailable, loadAssetCatalog } from "./catalog.js";
export { assetFamilyForFurniture, findFurnitureAssets, type FurnitureAssetQuery } from "./families.js";
export { instantiateAsset } from "./instance.js";
export { readAssetModel } from "./io.js";
export type {
  AssetCatalog, AssetEntry, AssetFamily, AssetFit, AssetInstance, AssetInstanceOptions,
  AssetPlacement, AssetQuery, AssetReadOptions,
} from "./types.js";
