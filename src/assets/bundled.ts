import { WebIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import type { AssetEntry } from "./types.js";

const urls: Record<string, string> = {
  "polyhaven-metal-office-desk": new URL("./models/polyhaven-metal-office-desk.glb", import.meta.url).href,
  "polyhaven-potted-plant-02": new URL("./models/polyhaven-potted-plant-02.glb", import.meta.url).href,
  "polyhaven-school-chair-01": new URL("./models/polyhaven-school-chair-01.glb", import.meta.url).href,
  "polyhaven-sofa-01": new URL("./models/polyhaven-sofa-01.glb", import.meta.url).href,
};
const io = new WebIO().registerExtensions(ALL_EXTENSIONS);

export async function readBundledAssetModel(asset: AssetEntry): Promise<Document> {
  const url = urls[asset.id];
  if (!url) throw new Error(`Asset ${asset.id} is not bundled`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Asset ${asset.id} is unavailable: HTTP ${response.status}`);
  return io.readBinary(new Uint8Array(await response.arrayBuffer()));
}
