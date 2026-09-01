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

export class MaterialKeys {
  constructor(private readonly theme: string, private readonly tier: string) {}

  key(kind: string): string {
    return `${this.theme}/${kind}/${this.tier}`;
  }

  floorOf(room: RoomKind): string {
    return this.key(FLOOR_BY_ROOM[room] ?? "concrete");
  }

  furnitureOf(kind: FurnitureKind): string {
    return this.key(FURNITURE_FAMILY[kind] ?? "wood");
  }

  wall(): string {
    return this.key("plaster");
  }

  ceiling(): string {
    return this.key("plaster");
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
}
