import type { Document, Material, Texture, TextureInfo } from "@gltf-transform/core";
import {
  KHRMaterialsEmissiveStrength, KHRMaterialsIOR, KHRMaterialsTransmission, KHRTextureTransform,
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
 *  real maps on it. Materials that already carry textures (a shell that arrived finished)
 *  and names that are not `theme/kind/tier` are left alone. */
export function applyMaterials(doc: Document, library: MaterialLibrary, options: ApplyOptions): number {
  const transform = doc.createExtension(KHRTextureTransform).setRequired(false);
  const textures = new Map<string, Texture>();
  let applied = 0;

  for (const material of doc.getRoot().listMaterials()) {
    const key = material.getName();
    if (!MATERIAL_KEY.test(key) || material.getBaseColorTexture()) continue;
    const entry = library.entry(key);
    if (!entry) {
      throw new InteriorError("E_MATERIAL_UNRESOLVED", `materials theme "${library.theme}" has no entry for ${key}`);
    }
    dressMaterial(doc, material, entry, textures, options, transform);
    applied++;
  }
  if (textures.size === 0) transform.dispose();
  return applied;
}

function dressMaterial(
  doc: Document, material: Material, entry: MaterialEntry, cache: Map<string, Texture>,
  options: ApplyOptions, transform: KHRTextureTransform,
): void {
  const variant = entry.variants[0]!;
  const physical = entry.physical ?? {};
  material.setBaseColorFactor([1, 1, 1, 1]);
  material.setMetallicFactor(physical.metallicFactor ?? 0);
  material.setRoughnessFactor(physical.roughnessFactor ?? 1);
  if (physical.alphaMode) material.setAlphaMode(physical.alphaMode);

  const attach = (slot: MapSlot, set: (t: Texture) => void, info: () => TextureInfo | null): void => {
    const path = variant.maps[slot];
    if (!path) return;
    set(texture(doc, cache, entry.key, slot, path, options));
    const target = info();
    // world-meter UVs: tiled maps repeat every worldSize meters, exact placements are 0..1
    if (target && entry.alignment === "tile" && entry.tiling) {
      const [w, h] = entry.tiling.worldSize;
      target.setExtension("KHR_texture_transform", transform.createTransform().setScale([1 / w, 1 / h]));
    }
  };

  attach("basecolor", (t) => material.setBaseColorTexture(t), () => material.getBaseColorTextureInfo());
  attach("normal", (t) => material.setNormalTexture(t), () => material.getNormalTextureInfo());
  attach("ao", (t) => material.setOcclusionTexture(t), () => material.getOcclusionTextureInfo());
  if (variant.maps.emission) {
    material.setEmissiveFactor([1, 1, 1]);
    attach("emission", (t) => material.setEmissiveTexture(t), () => material.getEmissiveTextureInfo());
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
  if (options.embed) created.setImage(options.readMap(path));
  else created.setURI(`${options.baseUrl.replace(/\/$/, "")}/${path}`);
  cache.set(path, created);
  return created;
}
