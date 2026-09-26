import { loadAssetCatalog } from "./catalog.js";

/** The preview's route for local model files; its root answers the list of files it serves. */
export const LOCAL_MODEL_ROUTE = "/interior-assets/";

/** Models a browser bundle carries itself, by catalog id. */
export const BUNDLED_MODELS: Readonly<Record<string, string>> = {
  "polyhaven-metal-office-desk": new URL("./models/polyhaven-metal-office-desk.glb", import.meta.url).href,
  "polyhaven-potted-plant-02": new URL("./models/polyhaven-potted-plant-02.glb", import.meta.url).href,
  "polyhaven-school-chair-01": new URL("./models/polyhaven-school-chair-01.glb", import.meta.url).href,
  "polyhaven-sofa-01": new URL("./models/polyhaven-sofa-01.glb", import.meta.url).href,
};

/** Catalog ids whose model file this runtime can read. Under Node: the files present in
 *  `modelsDir`, default the catalog's own `models` folder. In a browser: the bundled models
 *  and the files the preview's local route lists. */
export async function presentModels(modelsDir?: string): Promise<Set<string>> {
  const assets = loadAssetCatalog().assets.flatMap(asset => asset.modelUri ? [{ id: asset.id, file: fileName(asset.modelUri) }] : []);
  if (typeof globalThis.process?.getBuiltinModule === "function") {
    const { existsSync } = process.getBuiltinModule("node:fs");
    const { dirname, join } = process.getBuiltinModule("node:path");
    const { fileURLToPath } = process.getBuiltinModule("node:url");
    const dir = modelsDir ?? join(dirname(fileURLToPath(import.meta.url)), "models");
    return new Set(assets.filter(asset => existsSync(join(dir, asset.file))).map(asset => asset.id));
  }
  const listed = new Set(await fetch(LOCAL_MODEL_ROUTE)
    .then(response => response.ok ? response.json() as Promise<string[]> : [])
    .catch(() => []));
  return new Set(assets.filter(asset => asset.id in BUNDLED_MODELS || listed.has(asset.file)).map(asset => asset.id));
}

export function fileName(uri: string): string {
  return uri.split("/").at(-1)!;
}
