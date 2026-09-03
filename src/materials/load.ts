import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, resolve } from "node:path";
import { InteriorError } from "../core/errors.js";
import { MaterialLibrary, type ThemeIndex } from "./theme.js";

/** Where the materials database lives. `URBE_MATERIALS_DIR` wins; otherwise the sibling
 *  `materials` box next to this one. No path is baked into the code. */
export function materialsDir(dir?: string): string {
  const configured = dir ?? process.env.URBE_MATERIALS_DIR;
  if (configured) return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  return resolve(fileURLToPath(new URL("../..", import.meta.url)), "..", "materials");
}

export interface LoadedTheme {
  library: MaterialLibrary;
  /** folder the entries' map paths are relative to */
  themeDir: string;
  readMap(relPath: string): Uint8Array;
}

/** Reads one theme index from disk. Null when the database or theme is absent; standalone
 *  generation uses material keys for this result. */
export function loadTheme(theme: string, dir?: string): LoadedTheme | null {
  const themeDir = join(materialsDir(dir), "themes", theme);
  const indexPath = join(themeDir, "theme.json");
  try {
    if (!existsSync(indexPath)) return null;
    const index = JSON.parse(readFileSync(indexPath, "utf8")) as ThemeIndex;
    return {
      library: new MaterialLibrary(index),
      themeDir,
      readMap: (relPath) => {
        try {
          return new Uint8Array(readFileSync(join(themeDir, relPath)));
        } catch (err) {
          throw themeReadError(theme, err);
        }
      },
    };
  } catch (err) {
    if (err instanceof InteriorError) throw err;
    throw themeReadError(theme, err);
  }
}

function themeReadError(theme: string, err: unknown): InteriorError {
  const detail = err instanceof Error ? err.message : String(err);
  return new InteriorError("E_MATERIAL_UNRESOLVED", `materials theme "${theme}" cannot be read: ${detail}`);
}
