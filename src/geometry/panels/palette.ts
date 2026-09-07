import palettes from "./palettes.json" with { type: "json" };
export type InteriorStyle = keyof typeof palettes;
export type SurfaceRole = "wall" | "floor" | "ceiling";
export function styleForTier(tier: string): InteriorStyle {
  return tier === "poor" ? "damaged" : tier === "mid" ? "capsule" : "luxury";
}
export class PanelPalette {
  readonly style: InteriorStyle;
  readonly data: typeof palettes[InteriorStyle];
  constructor(private readonly theme: string, tier: string) {
    this.style = styleForTier(tier);
    this.data = palettes[this.style];
  }
  surface(role: SurfaceRole): string { return `${this.theme}/${this.data[role]}/${this.data.tier}`; }
  artifact(): string | undefined {
    return this.style === "luxury" ? undefined : `${this.theme}/interior-${this.style === "capsule" ? "capsule-hatch" : "damaged-patch"}/${this.data.tier}`;
  }
  trim(): string { return `${this.theme}/${this.data.trim}/${this.data.tier}`; }
  pitch(role: SurfaceRole): [number, number] { return this.data[`${role}Pitch`] as [number, number]; }
  role(key: string): SurfaceRole | undefined {
    return (["wall", "floor", "ceiling"] as const).find(role => key === this.surface(role));
  }
}
