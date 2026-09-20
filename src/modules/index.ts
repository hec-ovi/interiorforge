import { NodeIO, Logger } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { createDocument } from "../glb/io.js";
import type { UvScale } from "../glb/mesh-builder.js";
import { splitVariant } from "../glb/io.js";
import { MaterialLibrary, type ThemeIndex } from "../materials/theme.js";
import { moduleRecipes } from "./recipes.js";
import type { ModuleCatalog } from "./types.js";

export type * from "./types.js";

/** The theme every module's slots name. */
export const MODULE_THEME = "cyberpunk";

export interface ModuleOptions {
  /** preloaded theme index (a browser has no disk); Node reads the sibling Materials box */
  theme?: ThemeIndex | null;
}

/** UV units per metre for each slot: a tiled material repeats once per UV unit, so its
 *  faces divide by the published world size; exact and unknown materials keep metres. */
export function tileScale(theme: ThemeIndex | null | undefined): UvScale {
  const library = theme ? new MaterialLibrary(theme) : null;
  return (slot) => {
    const entry = library?.entry(splitVariant(slot)[0]);
    if (!entry || entry.alignment !== "tile" || !entry.tiling) return [1, 1];
    const [w, h] = entry.tiling.worldSize;
    return [1 / w, 1 / h];
  };
}

/** Which slots the theme aligns exactly: those wear their map once over the face. Without
 *  a theme every slot tiles, so a standalone kit keeps metre UVs. */
export function slotAlignment(theme: ThemeIndex | null | undefined): (slot: string) => "tile" | "exact" {
  const library = theme ? new MaterialLibrary(theme) : null;
  return (slot) => library?.entry(splitVariant(slot)[0])?.alignment === "exact" ? "exact" : "tile";
}

/** Publishes geometry once. Building generation does not serialize or load it. */
export async function buildModules(options: ModuleOptions = {}): Promise<{
  catalog: ModuleCatalog;
  files: Map<string, Uint8Array>;
}> {
  await MeshoptEncoder.ready;
  const theme = options.theme === undefined ? (await import("../materials/load.js")).loadTheme(MODULE_THEME)?.library.themeIndex ?? null : options.theme;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
  const catalog: ModuleCatalog = { version: 1, grid: 0.5, modules: [] }, files = new Map<string, Uint8Array>();
  for (const recipe of moduleRecipes(tileScale(theme), slotAlignment(theme))) {
    const doc = createDocument(recipe.mesh).setLogger(new Logger(Logger.Verbosity.SILENT));
    const triangles = recipe.mesh.materials().reduce((sum, slot) => sum + recipe.mesh.getGroup(slot)!.indices.length / 3, 0);
    await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: "medium", quantizePosition: 16 }));
    const bytes = await io.writeBinary(doc), file = `${recipe.id}.glb`;
    files.set(file, bytes);
    catalog.modules.push({
      id: recipe.id, file, size: recipe.size, origin: recipe.origin,
      materialSlots: recipe.mesh.materials(), triangles, bytes: bytes.byteLength,
    });
  }
  return { catalog, files };
}
