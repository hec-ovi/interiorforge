import type { BuildingType, FloorKind, RoomKind, StyleId, Tier } from "../core/types.js";
import { VENUE_KINDS } from "../layout/frame.js";
import { capsuleRoomFinish } from '../styles/capsule/finish.js';
import { damagedRoomFinish } from '../styles/damaged/finish.js';
import { industrialFinish } from '../styles/industrial/index.js';
import { corporateRoomFinish, isCorporate } from '../styles/corporate/index.js';

/** The look a building is furnished in: luxury for rich tiers, capsule for mid, damaged for
 *  poor, industrial for factories and military parcels whatever their tier. */
export type Family = "luxury" | "corporate" | "capsule" | "damaged" | "industrial";

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
  /** reference style the finish belongs to, when the room wears one */
  style?: StyleId;
  /** casing suffix of door jambs and headers (`door-jamb-<casing>`); the family otherwise */
  casing?: string;
  /** PortalSpec id framing this room's wide public openings */
  portal?: string;
  /** GlazingSystem id of this room's glazed partitions */
  glazing?: string;
}

const INDUSTRIAL: ReadonlySet<BuildingType> = new Set(["factory", "military"]);

export function familyOf(type: BuildingType, tier: Tier): Family {
  if (INDUSTRIAL.has(type)) return "industrial";
  if (isCorporate(type, tier)) return 'corporate';
  return tier === "poor" ? "damaged" : tier === "mid" ? "capsule" : "luxury";
}

const DARK_ROOMS: ReadonlySet<RoomKind> = new Set([
  "reception", "lounge", "bar", "dining_area", "counter_area", "sales_floor", "concourse", "elevator_lobby", "gym_floor", "terrace_open",
]);
const WET_ROOMS: ReadonlySet<RoomKind> = new Set(["bathroom", "toilets", "locker_room"]);
const TIMBER_FLOORS: ReadonlySet<RoomKind> = new Set(["living", "bedroom", "studio_main"]);
const SERVICE_ROOMS: ReadonlySet<RoomKind> = new Set(["storage", "mechanical_room", "parking_area"]);
/** Dark mineral marks the vertical/service core; inhabited fields stay pale and calm. */
const CORE_FIELDS: ReadonlySet<RoomKind> = new Set(["elevator_lobby", "mechanical_room"]);

/** Rooms whose partitions toward public space are glazed. */
export const GLAZED_ROOMS: ReadonlySet<RoomKind> = new Set(["office_private", "meeting", "executive_office", "lounge"]);
/** Public neighbours sharing those glass partitions; also used by wall-mounted furniture. */
export const GLAZED_ONTO: ReadonlySet<RoomKind> = new Set(["corridor", "elevator_lobby", "concourse", "office_open", "reception", "lounge"]);

export function roomFinish(family: Family, room: RoomKind, floorKind: FloorKind): RoomFinish {
  switch (family) {
    case 'corporate':
      return corporateRoomFinish(room, floorKind);
    case "capsule":
      return capsuleRoomFinish(room, floorKind);
    case "damaged":
      return damagedRoomFinish(room, floorKind);
    case "industrial":
      return industrialFinish(room, floorKind);
    default: {
      const dark = DARK_ROOMS.has(room) || (room === "corridor" && VENUE_KINDS.has(floorKind));
      const palette = WET_ROOMS.has(room) ? "slate" : dark ? "dark" : "ivory";
      const privateSalon = room === "living" || room === "studio_main";
      const floor = privateSalon ? "floor-slab-luxury-polished" : palette === "slate" ? "floor-slab-marble"
        : TIMBER_FLOORS.has(room) ? "floor-slab-plank" : "floor-slab-meridian-stone";
      return {
        family, field: privateSalon ? "wall-field-meridian-walnut" : CORE_FIELDS.has(room) ? "wall-field-meridian-mineral"
          : SERVICE_ROOMS.has(room) || WET_ROOMS.has(room) ? `wall-field-${palette}` : "wall-field-meridian-ivory",
        floor, ceiling: dark ? "ceiling-field-dark" : "ceiling-field-light",
        cove: "ceiling-cove-timber", spot: "ceiling-spot",
        ...(SERVICE_ROOMS.has(room) ? {} : {
          band: dark ? "ceiling-band-ivory" : "ceiling-band-timber",
        }),
      };
    }
  }
}
