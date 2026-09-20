import type { BuildingType, FloorKind, RoomKind, Tier } from "../core/types.js";
import { VENUE_KINDS } from "../layout/frame.js";

/** The look a building is furnished in: luxury for rich tiers, capsule for mid, damaged for
 *  poor, industrial for factories and military parcels whatever their tier. */
export type Family = "luxury" | "capsule" | "damaged" | "industrial";

/** The modules one room's surfaces are built from. */
export interface RoomFinish {
  family: Family;
  /** nine-slice frame pieces; absent where the family builds plain fields */
  frame?: { corner: string; rail: string; stile: string; field: string; line: string; kelvin: number; color?: [number, number, number] };
  /** plain field over short runs, door headers and unframed families */
  field: string;
  floor: string;
  ceiling: string;
  /** fitted outer ceiling band; absent where the family has none */
  band?: string;
  /** exposed services run under the soffit */
  services?: string;
  cove: string;
  spot: string;
}

const INDUSTRIAL: ReadonlySet<BuildingType> = new Set(["factory", "military"]);

export function familyOf(type: BuildingType, tier: Tier): Family {
  if (INDUSTRIAL.has(type)) return "industrial";
  return tier === "poor" ? "damaged" : tier === "mid" ? "capsule" : "luxury";
}

const DARK_ROOMS: ReadonlySet<RoomKind> = new Set([
  "reception", "lounge", "bar", "dining_area", "counter_area", "sales_floor", "concourse", "elevator_lobby", "gym_floor", "terrace_open",
]);
const WET_ROOMS: ReadonlySet<RoomKind> = new Set(["bathroom", "toilets", "locker_room"]);
const TIMBER_FLOORS: ReadonlySet<RoomKind> = new Set(["living", "bedroom", "studio_main"]);
const SERVICE_ROOMS: ReadonlySet<RoomKind> = new Set(["storage", "mechanical_room", "parking_area"]);

/** Rooms whose partitions toward public space are glazed. */
export const GLAZED_ROOMS: ReadonlySet<RoomKind> = new Set(["office_private", "meeting", "executive_office"]);

/** A frame band always contrasts its field: walnut against the light walls, ivory against
 *  the dark ones, so the nine slices read as a frame and not as one flat tone. */
const members = (name: string) => ({ corner: `wall-panel-corner-${name}`, rail: `wall-panel-rail-${name}`, stile: `wall-panel-stile-${name}` });
const TIMBER_FRAME = { ...members("timber"), line: "wall-light-line", kelvin: 2700 };
const IVORY_FRAME = { ...members("ivory"), line: "wall-light-line", kelvin: 2700 };
const STEEL_FRAME = { ...members("steel"), line: "wall-light-line-cool", kelvin: 6500, color: [0.025, 0.72, 1] as [number, number, number] };

export function roomFinish(family: Family, room: RoomKind, floorKind: FloorKind): RoomFinish {
  switch (family) {
    case "capsule":
      return {
        family, frame: { ...STEEL_FRAME, field: "wall-panel-field-capsule" }, field: "wall-field-capsule",
        floor: "floor-slab-capsule", ceiling: "ceiling-field-capsule", band: "ceiling-band-steel",
        cove: "ceiling-cove-steel", spot: "ceiling-spot-cool",
      };
    case "damaged":
      return {
        family, field: "wall-field-damaged", floor: "floor-slab-damaged", ceiling: "ceiling-field-damaged",
        services: "ceiling-services", cove: "ceiling-led-strip", spot: "ceiling-spot-cool",
      };
    case "industrial":
      return {
        family, field: "wall-field-steel", floor: "floor-slab-steel", ceiling: "ceiling-field-steel",
        services: "ceiling-services", cove: "ceiling-led-strip", spot: "ceiling-spot-cool",
      };
    default: {
      const dark = DARK_ROOMS.has(room) || (room === "corridor" && VENUE_KINDS.has(floorKind));
      const palette = WET_ROOMS.has(room) ? "slate" : dark ? "dark" : "ivory";
      const floor = palette === "slate" ? "floor-slab-marble" : dark ? "floor-slab-obsidian"
        : TIMBER_FLOORS.has(room) ? "floor-slab-plank" : "floor-slab-stone";
      return {
        family, field: `wall-field-${palette}`, floor, ceiling: dark ? "ceiling-field-dark" : "ceiling-field-light",
        cove: "ceiling-cove-timber", spot: "ceiling-spot",
        ...(SERVICE_ROOMS.has(room) ? {} : {
          frame: { ...(dark ? IVORY_FRAME : TIMBER_FRAME), field: `wall-panel-field-${palette}` },
          band: dark ? "ceiling-band-ivory" : "ceiling-band-timber",
        }),
      };
    }
  }
}
