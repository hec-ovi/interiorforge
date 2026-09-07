import data from "./catalog.json" with { type: "json" };
import type { AssetCatalog, AssetEntry, AssetFit, AssetQuery } from "./types.js";

const catalog = data as AssetCatalog;

export function loadAssetCatalog(): AssetCatalog {
  return catalog;
}

export function findAssetCandidates(query: AssetQuery): AssetEntry[] {
  return catalog.assets.filter((asset) => {
    if (asset.family !== query.family) return false;
    if (query.styles?.length && !query.styles.some((style) => asset.styles.includes(style))) return false;
    if (query.maxBounds && !fitAssetBounds(
      asset, query.maxBounds, query.rotationYDeg ?? 0, query.minimumScale ?? 0.7,
    )) return false;
    return !(query.availableOnly ?? true) || asset.availability !== "source-only";
  });
}

export function fitAssetBounds(
  asset: AssetEntry,
  maxBounds: readonly [number, number, number],
  rotationYDeg = 0,
  minimumScale = 0.7,
): AssetFit | null {
  if (!asset.dimensionsMeters) return null;
  const angle = rotationYDeg * Math.PI / 180;
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  const size: [number, number, number] = [
    c * asset.dimensionsMeters[0] + s * asset.dimensionsMeters[1],
    s * asset.dimensionsMeters[0] + c * asset.dimensionsMeters[1],
    asset.dimensionsMeters[2],
  ];
  const scale = Math.min(...size.map((value, index) => maxBounds[index]! / value));
  if (!Number.isFinite(scale) || scale < minimumScale) return null;
  return { scale, dimensions: size.map((value) => value * scale) as AssetFit["dimensions"] };
}
