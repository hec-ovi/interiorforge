import data from "./catalog.json" with { type: "json" };
import type { AssetCatalog, AssetEntry, AssetFamily, AssetFit } from "./types.js";

const catalog = data as AssetCatalog;
/** A model scaled below this reads as a toy of the furniture it stands for. */
const MIN_SCALE = 0.7;
/** A model filling less of its record's width or depth stands for another piece: a cabinet
 *  for a wardrobe, a side table for a meeting table, a mattress lying across a bed. A smaller
 *  piece of the same kind, a shallower sofa or a shorter counter, still fills more. */
const MIN_FILL = 0.6;

export function loadAssetCatalog(): AssetCatalog {
  return catalog;
}

/** Entries of one family with a prepared or preparable model that fit the bounds. */
export function findAssetCandidates(family: AssetFamily, maxBounds: readonly [number, number, number]): AssetEntry[] {
  return catalog.assets.filter(asset => asset.family === family && asset.availability !== "source-only"
    && fitAssetBounds(asset, maxBounds) !== null);
}

/** The uniform scale that stands a model, turned to face +Z by its `frontYawDeg`, inside
 *  `[width, depth, height]` bounds, and its scaled dimensions in that frame; null without
 *  normalized dimensions, below a useful scale, or filling under three fifths of the width
 *  or the depth. */
export function fitAssetBounds(asset: AssetEntry, maxBounds: readonly [number, number, number]): AssetFit | null {
  const authored = asset.dimensionsMeters;
  if (!authored) return null;
  const size = asset.frontYawDeg === 90 || asset.frontYawDeg === 270 ? [authored[1], authored[0], authored[2]] : authored;
  const scale = Math.min(...size.map((value, index) => maxBounds[index]! / value));
  if (!Number.isFinite(scale) || scale < MIN_SCALE) return null;
  const dimensions = size.map(value => value * scale) as AssetFit["dimensions"];
  if (dimensions[0] < MIN_FILL * maxBounds[0] || dimensions[1] < MIN_FILL * maxBounds[1]) return null;
  return { scale, dimensions };
}
