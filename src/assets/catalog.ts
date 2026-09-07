import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import data from "./catalog.json" with { type: "json" };
import type { AssetCatalog, AssetEntry, AssetFit, AssetQuery } from "./types.js";

const catalog = data as AssetCatalog;
const defaultModelsDir = fileURLToPath(new URL("./models", import.meta.url));

export function loadAssetCatalog(): AssetCatalog {
  return catalog;
}

export function assetModelPath(asset: AssetEntry, modelsDir = defaultModelsDir): string | null {
  return asset.modelUri ? path.join(modelsDir, path.basename(asset.modelUri)) : null;
}

export function isAssetAvailable(asset: AssetEntry, modelsDir?: string): boolean {
  const modelPath = assetModelPath(asset, modelsDir);
  return modelPath !== null && fs.existsSync(modelPath);
}

export function findAssetCandidates(query: AssetQuery): AssetEntry[] {
  const requireAvailable = query.availableOnly ?? true;
  return catalog.assets.filter((asset) => {
    if (asset.family !== query.family) return false;
    if (query.styles?.length && !query.styles.some((style) => asset.styles.includes(style))) return false;
    if (query.maxBounds && !fitAssetBounds(
      asset, query.maxBounds, query.rotationYDeg ?? 0, query.minimumScale ?? 0.7,
    )) return false;
    return !requireAvailable || isAssetAvailable(asset, query.modelsDir);
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
