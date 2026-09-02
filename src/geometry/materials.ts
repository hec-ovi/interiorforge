import type { FurnitureKind, RoomKind } from "../core/types.js";

/** Material keys are theme/kind/tier slugs; the materials box resolves them. */

const FLOOR_BY_ROOM: Partial<Record<RoomKind, string>> = {
  corridor: "tile", elevator_lobby: "tile", concourse: "tile", reception: "tile", lounge: "carpet",
  office_open: "carpet", office_private: "carpet", meeting: "carpet", executive_office: "wood",
  dining_area: "wood", kitchen: "tile", counter_area: "tile", bar: "wood", sales_floor: "tile",
  bedroom: "wood", living: "wood", studio_main: "wood", bathroom: "tile", toilets: "tile",
  gym_floor: "rubber", locker_room: "tile", storage: "concrete", mechanical_room: "concrete",
  terrace_open: "concrete", parking_area: "concrete",
};

const FURNITURE_FAMILY: Partial<Record<FurnitureKind, string>> = {
  desk: "wood", meeting_table: "wood", dining_table: "wood", low_table: "wood",
  wardrobe: "wood", shelf: "metal", kitchen_block: "metal", fridge: "metal",
  counter: "metal", reception_desk: "wood", bar_counter: "wood", display_rack: "metal",
  bed_single: "fabric", bed_double: "fabric", sofa: "fabric", office_chair: "fabric",
  chair: "wood", stool: "wood", bench: "wood", toilet: "tile", sink: "tile", shower: "tile",
  gym_machine: "metal", plant: "fabric",
};

/** Walls and ceilings prefer the pattern class: flat colours, panel grids and hex fields
 *  read cleanly at any distance, where a photographed plaster goes damp and blotchy up close.
 *  Floors, wood and concrete keep their photo sets, where real texture earns its place. */

export class MaterialKeys {
  constructor(
    private readonly theme: string,
    private readonly tier: string,
    private readonly seed = 0,
  ) {}

  /** `theme/kind/tier`, plus an optional `#variant` preference the materials database
   *  resolves; a consumer that ignores the suffix still gets the entry's canonical variant. */
  key(kind: string, variant?: string): string {
    const base = `${this.theme}/${kind}/${this.tier}`;
    return variant ? `${base}#${variant}` : base;
  }

  floorOf(room: RoomKind): string {
    return this.key(FLOOR_BY_ROOM[room] ?? "concrete");
  }

  furnitureOf(kind: FurnitureKind): string {
    return this.key(FURNITURE_FAMILY[kind] ?? "wood");
  }

  /** Walls are flat: the plain plaster everywhere, so a pattern only ever reads as a border. */
  wall(): string {
    return this.key("plaster", "plain");
  }

  /** The accent band and feature wall: a different key, so the two tones read apart under
   *  any resolver, not only one that honours the variant preference. */
  accent(room?: RoomKind): string {
    return room === "bathroom" || room === "toilets" || room === "kitchen"
      ? this.key("tile", "slab")
      : this.key("concrete", "panel");
  }

  /** Baseboards, top trim and reveals. */
  /** Door casings: the painted steel every door and its frame wear. */
  door(): string {
    return this.key("door");
  }

  /** Window casings on the room side, the same member as the exterior frame. */
  windowFrame(): string {
    return this.key("window-frame");
  }

  trim(): string {
    return this.key("metal");
  }

  ceiling(): string {
    return this.key("ceiling", this.seed % 3 === 0 ? "plain" : "panel");
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

  /** Emissive housing of a light fixture: a downlight with its lens and housing, or a lit line. */
  light(kind: "strip" | "spot" | "cove" = "strip"): string {
    return this.key("light-fixture", kind === "spot" ? "lamp" : "strip");
  }
}
