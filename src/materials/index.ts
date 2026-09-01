import type { Document } from "@gltf-transform/core";
import { InteriorError } from "../core/errors.js";
import { applyMaterials } from "./apply.js";
import { loadTheme, materialsDir } from "./load.js";
import { MaterialLibrary, type ThemeIndex } from "./theme.js";

export { MaterialLibrary, materialsDir, loadTheme, applyMaterials };
export type { ThemeIndex, MaterialEntry } from "./theme.js";

/** How the finished GLB carries its maps. */
export type TextureMode = "external" | "embed" | "keys";

export interface TextureOptions {
  /** external (default): map URIs against `baseUrl`. embed: one self-contained GLB.
   *  keys: no textures, material keys only (the engine runtime resolves them itself). */
  mode?: TextureMode;
  /** materials box root; defaults to URBE_MATERIALS_DIR, else the sibling `materials` box */
  dir?: string;
  /** URI prefix written into the GLB; defaults to the theme folder on disk */
  baseUrl?: string;
  /** preloaded theme index (browsers have no disk); skips reading `dir` */
  theme?: ThemeIndex;
}

/** What a finished GLB ended up carrying. */
export interface TextureReport {
  mode: "external" | "embedded" | "keys";
  /** URI prefix the external maps hang off */
  baseUrl?: string;
  /** materials resolved through the database */
  materials: number;
}

/** Textures the document in place. Falls back to keys when the requested mode needs the
 *  materials database and it is not there, so this box still runs standalone. */
export function textureDocument(doc: Document, theme: string, options: TextureOptions = {}): TextureReport {
  const mode = options.mode ?? "external";
  if (mode === "keys") return { mode: "keys", materials: 0 };

  const onDisk = options.theme ? null : loadTheme(theme, options.dir);
  const library = options.theme ? new MaterialLibrary(options.theme) : onDisk?.library;
  if (!library) return { mode: "keys", materials: 0 };
  if (mode === "embed" && !onDisk) {
    throw new InteriorError("E_MATERIAL_UNRESOLVED", "embedded textures need the materials database on disk");
  }

  const baseUrl = options.baseUrl ?? onDisk?.themeDir ?? ".";
  const materials = applyMaterials(doc, library, {
    baseUrl,
    embed: mode === "embed",
    readMap: (path) => onDisk!.readMap(path),
  });
  return mode === "embed" ? { mode: "embedded", materials } : { mode: "external", baseUrl, materials };
}
