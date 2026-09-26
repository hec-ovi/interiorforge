import data from "./catalog.json" with { type: "json" };
import type { AssetCatalog, AssetEntry, AssetFamily, AssetFit } from "./types.js";

const catalog = data as AssetCatalog;
/** A model scaled below this reads as a toy of the furniture it stands for. */
const MIN_SCALE = 0.7;

export function loadAssetCatalog(): AssetCatalog {
  return catalog;
}

/** Entries of one family with a prepared or preparable model that fit the bounds. */
export function findAssetCandidates(family: AssetFamily, maxBounds: readonly [number, number, number]): AssetEntry[] {
  return catalog.assets.filter(asset => asset.family === family && asset.availability !== "source-only"
    && fitAssetBounds(asset, maxBounds) !== null);
}

/** The uniform scale that stands a model inside `[width, depth, height]` bounds, and its
 *  scaled dimensions; null without normalized dimensions or below a useful scale. */
export function fitAssetBounds(asset: AssetEntry, maxBounds: readonly [number, number, number]): AssetFit | null {
  const size = asset.dimensionsMeters;
  if (!size) return null;
  const scale = Math.min(...size.map((value, index) => maxBounds[index]! / value));
  if (!Number.isFinite(scale) || scale < MIN_SCALE) return null;
  return { scale, dimensions: size.map(value => value * scale) as AssetFit["dimensions"] };
}
