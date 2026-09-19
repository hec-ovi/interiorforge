import type { Document, Material, Texture } from "@gltf-transform/core";
import {
  KHRMaterialsEmissiveStrength, KHRMaterialsIOR, KHRMaterialsTransmission,
} from "@gltf-transform/extensions";
import { InteriorError } from "../core/errors.js";
import type { MapSlot, MaterialEntry, MaterialLibrary } from "./theme.js";

const MATERIAL_KEY = /^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-z0-9_-]+$/;

export interface ApplyOptions {
  /** URI prefix the map paths hang off, as the GLB's consumer will see it */
  baseUrl: string;
  /** true: map bytes travel inside the GLB */
  embed: boolean;
  readMap(relPath: string): Uint8Array;
}

/** Resolves every material key in the document against the materials database and hangs the
 *  real maps on it. Geometry carries UVs in tile units, one unit per published repeat, so
 *  the maps bind as they are. Materials that already carry textures (a shell that arrived
 *  finished) and names that are not `theme/kind/tier` are left alone. */
export function applyMaterials(doc: Document, library: MaterialLibrary, options: ApplyOptions): number {
  const textures = new Map<string, Texture>();
  let applied = 0;

  for (const material of doc.getRoot().listMaterials()) {
    const key = material.getName();
    if (!MATERIAL_KEY.test(key) || material.getBaseColorTexture()) continue;
    const entry = library.entry(key);
    if (!entry) {
      throw new InteriorError("E_MATERIAL_UNRESOLVED", `materials theme "${library.theme}" has no entry for ${key}`);
    }
    dressMaterial(doc, material, entry, textures, options);
    applied++;
  }
  return applied;
}

function dressMaterial(
  doc: Document, material: Material, entry: MaterialEntry, cache: Map<string, Texture>, options: ApplyOptions,
): void {
  // the geometry names a preferred variant in extras; fall back to the canonical one
  const wanted = (material.getExtras() as { materialVariant?: string }).materialVariant;
  const variant = (wanted ? entry.variants.find((v) => v.id === wanted) : undefined) ?? entry.variants[0]!;
  const physical = entry.physical ?? {};
  material.setBaseColorFactor([1, 1, 1, 1]);
  material.setMetallicFactor(physical.metallicFactor ?? 0);
  material.setRoughnessFactor(physical.roughnessFactor ?? 1);
  if (physical.alphaMode) material.setAlphaMode(physical.alphaMode);

  const attach = (slot: MapSlot, set: (t: Texture) => void): void => {
    const path = variant.maps[slot];
    if (path) set(texture(doc, cache, entry.key, slot, path, options));
  };

  attach("basecolor", (t) => material.setBaseColorTexture(t));
  if (variant.maps.metallicRoughness) {
    attach("metallicRoughness", (t) => material.setMetallicRoughnessTexture(t));
    // The packed linear channels contain the final response, not scalar multipliers.
    material.setMetallicFactor(1).setRoughnessFactor(1);
  }
  attach("normal", (t) => material.setNormalTexture(t));
  attach("ao", (t) => material.setOcclusionTexture(t));
  if (variant.maps.emission) {
    material.setEmissiveFactor([1, 1, 1]);
    attach("emission", (t) => material.setEmissiveTexture(t));
    if (physical.emissiveStrength !== undefined && physical.emissiveStrength !== 1) {
      const ext = doc.createExtension(KHRMaterialsEmissiveStrength).setRequired(false);
      material.setExtension("KHR_materials_emissive_strength",
        ext.createEmissiveStrength().setEmissiveStrength(physical.emissiveStrength));
    }
  }
  if (physical.transmission) {
    const ext = doc.createExtension(KHRMaterialsTransmission).setRequired(false);
    material.setExtension("KHR_materials_transmission",
      ext.createTransmission().setTransmissionFactor(physical.transmission));
    if (physical.ior !== undefined) {
      const iorExt = doc.createExtension(KHRMaterialsIOR).setRequired(false);
      material.setExtension("KHR_materials_ior", iorExt.createIOR().setIOR(physical.ior));
    }
  }
}

/** One texture per map file, shared by every material that resolves to it. */
function texture(
  doc: Document, cache: Map<string, Texture>, key: string, slot: MapSlot, path: string, options: ApplyOptions,
): Texture {
  const cached = cache.get(path);
  if (cached) return cached;
  const created = doc.createTexture(`${key}/${slot}`).setMimeType("image/png");
  if (options.embed) {
    try {
      created.setImage(options.readMap(path));
    } catch (err) {
      if (err instanceof InteriorError) throw err;
      const detail = err instanceof Error ? err.message : String(err);
      throw new InteriorError("E_MATERIAL_UNRESOLVED", `material map "${path}" cannot be read: ${detail}`);
    }
  } else {
    created.setURI(`${options.baseUrl.replace(/\/$/, "")}/${path}`);
  }
  cache.set(path, created);
  return created;
}
