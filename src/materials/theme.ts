/** Consumer view of the sibling Materials theme index and material-entry schema. Only the
 *  fields this box needs to texture a glTF document. */

export type MapSlot = "basecolor" | "normal" | "roughness" | "metallic" | "height" | "ao" | "emission";

export interface MaterialVariant {
  id: string;
  resolution: [number, number];
  maps: Partial<Record<MapSlot, string>> & { basecolor: string };
}

export interface MaterialPhysical {
  metallicFactor?: number;
  roughnessFactor?: number;
  transmission?: number;
  ior?: number;
  emissiveStrength?: number;
  alphaMode?: "OPAQUE" | "BLEND" | "MASK";
}

export interface MaterialEntry {
  key: string;
  aliases?: string[];
  alignment: "tile" | "exact";
  /** meters covered by one repeat; tile entries only */
  tiling?: { worldSize: [number, number] };
  physical?: MaterialPhysical;
  variants: MaterialVariant[];
}

export interface ThemeIndex {
  theme: string;
  entries: Record<string, MaterialEntry>;
}

/** Resolves `theme/kind/tier` keys and their aliases against one theme index. */
export class MaterialLibrary {
  private readonly byKey = new Map<string, MaterialEntry>();

  constructor(private readonly index: ThemeIndex) {
    for (const entry of Object.values(index.entries)) {
      this.byKey.set(entry.key, entry);
      for (const alias of entry.aliases ?? []) this.byKey.set(alias, entry);
    }
  }

  get theme(): string {
    return this.index.theme;
  }

  entry(key: string): MaterialEntry | undefined {
    return this.byKey.get(key);
  }
}
