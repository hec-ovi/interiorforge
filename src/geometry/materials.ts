import type { RoomKind } from "../core/types.js";

/** Material keys are theme/kind/tier slugs; the materials box resolves them. */

const FLOOR_BY_ROOM: Partial<Record<RoomKind, string>> = {
  corridor: "tile", elevator_lobby: "tile", concourse: "tile", reception: "tile", lounge: "carpet",
  office_open: "carpet", office_private: "carpet", meeting: "carpet", executive_office: "wood",
  dining_area: "wood", kitchen: "tile", counter_area: "tile", bar: "wood", sales_floor: "tile",
  bedroom: "wood", living: "wood", studio_main: "wood", bathroom: "tile", toilets: "tile",
  gym_floor: "rubber", locker_room: "tile", storage: "concrete", mechanical_room: "concrete",
  terrace_open: "concrete", parking_area: "concrete",
};

/** Walls and ceilings take the pattern class, and only its joint-free members: a texture
 *  whose module is 1 to 3 m cuts mid-tile against a room laid on the half-metre grid, which
 *  reads as a mistake. Every grid an interior surface shows is geometry the interior placed
 *  (wall bands, casings, light housings), never a repeat in a map. Floors, wood and concrete
 *  keep their photo sets, where real texture earns its place. */

export class MaterialKeys {
  constructor(
    private readonly theme: string,
    private readonly tier: string,
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

  /** Walls are flat: the plain plaster everywhere, so a pattern only ever reads as a border. */
  wall(): string {
    return this.key("plaster", "plain");
  }

  /** The accent band and feature wall: a different key, so the two tones read apart under
   *  any resolver, not only one that honours the variant preference. */
  accent(room?: RoomKind): string {
    return room === "bathroom" || room === "toilets" || room === "kitchen"
      ? this.key("tile")
      : this.key("concrete", "plain");
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
    return this.key("ceiling", "plain");
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
