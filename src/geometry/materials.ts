import type { RoomKind } from "../core/types.js";
import { PanelPalette } from "./panels/palette.js";

/** Material keys are theme/kind/tier slugs; the materials box resolves them. */

const FLOOR_BY_ROOM: Partial<Record<RoomKind, string>> = {
  corridor: "tile", elevator_lobby: "tile", concourse: "tile", reception: "tile", lounge: "carpet",
  office_open: "carpet", office_private: "carpet", meeting: "carpet", executive_office: "wood",
  dining_area: "wood", kitchen: "tile", counter_area: "tile", bar: "wood", sales_floor: "tile",
  bedroom: "wood", living: "wood", studio_main: "wood", bathroom: "tile", toilets: "tile",
  gym_floor: "rubber", locker_room: "tile", storage: "concrete", mechanical_room: "concrete",
  terrace_open: "concrete", parking_area: "concrete",
};

export class MaterialKeys {
  readonly panels: PanelPalette;
  get luxury(): boolean { return this.theme === "cyberpunk" && this.panels.style === "luxury"; }
  constructor(
    private readonly theme: string,
    private readonly tier: string,
  ) { this.panels = new PanelPalette(theme, tier); }

  /** `theme/kind/tier`, plus an optional `#variant` preference the materials database
   *  resolves; a consumer that ignores the suffix still gets the entry's canonical variant. */
  key(kind: string, variant?: string, tier = this.tier): string {
    const base = `${this.theme}/${kind}/${tier}`;
    return variant ? `${base}#${variant}` : base;
  }

  floorOf(room: RoomKind): string {
    if (this.theme === "cyberpunk" && !["parking_area", "terrace_open", "mechanical_room", "storage", "gym_floor"].includes(room)) return this.panels.surface("floor");
    return this.key(FLOOR_BY_ROOM[room] ?? "concrete");
  }

  /** Architectural field; the panel builder owns the border geometry. */
  wall(): string {
    return this.theme === "cyberpunk" ? this.panels.surface("wall") : this.key("plaster", "plain");
  }

  /** The accent band and feature wall: a different key, so the two tones read apart under
   *  any resolver, not only one that honours the variant preference. */
  accent(room?: RoomKind): string {
    if (this.theme === "cyberpunk" && this.panels.style === "luxury") {
      if (this.tier === "rich" && ["studio_main", "living"].includes(room ?? "")) return this.key("interior-loft-brick", undefined, "rich");
      return ["bathroom", "toilets", "kitchen"].includes(room ?? "")
        ? this.panels.surface("floor") : `${this.theme}/interior-luxury-timber/rich`;
    }
    return room === "bathroom" || room === "toilets" || room === "kitchen"
      ? this.key("tile")
      : this.key("concrete", "plain");
  }

  /** Baseboards, top trim and reveals. */
  /** Door casings: the painted steel every door and its frame wear. */
  door(): string {
    if (this.theme === "cyberpunk" && this.panels.style === "damaged") return this.key("interior-damaged-steel");
    return this.key("door");
  }

  /** Window casings on the room side, the same member as the exterior frame. */
  windowFrame(): string {
    return this.key("window-frame");
  }

  trim(): string {
    return this.key("metal");
  }

  furniture(kind: string): string {
    if (kind === "door") return this.door();
    if (kind === "accent") return this.accent();
    if (kind === "bronze") return this.luxury ? this.key("interior-bronze", undefined, "rich") : this.metal();
    if (this.luxury && kind === "wood") return this.key("interior-luxury-timber", undefined, "rich");
    if (this.luxury && kind === "tile") return this.panels.surface("floor");
    return this.key(kind, kind === "fabric" ? "flat" : undefined);
  }

  ceiling(): string {
    return this.theme === "cyberpunk" ? this.panels.surface("ceiling") : this.key("ceiling", "plain");
  }

  concrete(): string {
    return this.key("concrete");
  }

  metal(): string {
    return this.key("metal");
  }

  elevatorDoor(): string {
    return this.key("elevator_door");
  }

  /** Emissive lens of a downlight or lit line. */
  light(kind: "strip" | "spot" | "cove" = "strip"): string {
    return this.key("light-fixture", kind === "spot" ? "lamp" : "strip");
  }
}
