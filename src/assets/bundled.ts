import { WebIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { BUNDLED_MODELS, LOCAL_MODEL_ROUTE, fileName } from "./availability.js";
import type { AssetEntry } from "./types.js";

const io = new WebIO().registerExtensions(ALL_EXTENSIONS);

/** A catalog model in a browser: bundled, else a local-only file through the preview's route. */
export async function readBundledAssetModel(asset: AssetEntry): Promise<Document> {
  const url = BUNDLED_MODELS[asset.id] ?? (asset.availability === "local-only" && asset.modelUri
    ? `${LOCAL_MODEL_ROUTE}${encodeURIComponent(fileName(asset.modelUri))}`
    : undefined);
  if (!url) throw new Error(`Asset ${asset.id} has no browser transport`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset ${asset.id} is unavailable: HTTP ${response.status}`);
  return io.readBinary(new Uint8Array(await response.arrayBuffer()));
}
