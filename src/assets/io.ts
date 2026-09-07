import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import type { AssetEntry, AssetReadOptions } from "./types.js";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const defaultModelsDir = fileURLToPath(new URL("./models", import.meta.url));

export function assetModelPath(asset: AssetEntry, modelsDir = defaultModelsDir): string | null {
  return asset.modelUri ? path.join(modelsDir, path.basename(asset.modelUri)) : null;
}

export async function readAssetModel(asset: AssetEntry, options: AssetReadOptions = {}): Promise<Document> {
  const modelPath = assetModelPath(asset, options.modelsDir);
  if (!modelPath) throw new Error(`Asset ${asset.id} has no imported model`);
  try {
    return await io.read(modelPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Asset ${asset.id} is unavailable: ${detail}`);
  }
}
