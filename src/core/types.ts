/** TypeScript mirror of ../../schemas/*.schema.json. Schemas are the source of truth. */

import type { Point, Rect } from "./geom.js";

// ---- request.schema.json ----

export type BuildingType =
  | "residential" | "hotel" | "office" | "corpo" | "hospital" | "police" | "factory" | "mixed";

export type Tier = "poor" | "standard" | "rich" | "lux";

export type FloorKind =
  | "lobby" | "office" | "corpo_office" | "restaurant" | "coffee_shop" | "gym"
  | "residence_studio" | "apartment" | "hotel_rooms" | "mechanical" | "parking" | "terrace";

export interface FloorAssignment {
  floor: number;
  kind: FloorKind;
  spans?: 1 | 2;
}

export interface InteriorRequest {
  seed: number;
  building: { id: string; type: BuildingType; tier: Tier };
  shellGlb: string;
  blueprint: Blueprint;
  /** optional: derived from blueprint floor kind slugs when omitted */
  assignments?: FloorAssignment[];
  materialTheme: string;
}

// ---- blueprint.schema.json ----

export type OpeningKind = "door" | "window" | "balconyDoor" | "aperture";

export interface Opening {
  id: string;
  kind: OpeningKind;
  edge: number;
  offset: number;
  width: number;
  height: number;
  sill: number;
  [extra: string]: unknown;
}

/** Consumer view of the canonical exterior blueprint; extra exterior fields pass through untouched. */
export interface BlueprintFloor {
  index: number;
  /** exterior slot label slug; assignments win over it */
  kind: string;
  elevation: number;
  height: number;
  outline: Point[];
  openings: Opening[];
  [extra: string]: unknown;
}

export interface Blueprint {
  buildingId: string;
  bounds?: { footprint: Point[]; height: number };
  floors: BlueprintFloor[];
  [extra: string]: unknown;
}

// ---- floor.schema.json ----

export type RoomKind =
  | "corridor" | "elevator_lobby" | "reception" | "lounge"
  | "office_open" | "office_private" | "meeting" | "executive_office"
  | "dining_area" | "kitchen" | "counter_area" | "bar"
  | "bedroom" | "living" | "studio_main" | "bathroom" | "toilets"
  | "gym_floor" | "locker_room" | "storage" | "mechanical_room" | "terrace_open";

export type FurnitureKind =
  | "desk" | "office_chair" | "meeting_table" | "counter" | "shelf" | "sofa" | "low_table"
  | "bed_single" | "bed_double" | "wardrobe" | "kitchen_block" | "fridge" | "dining_table" | "chair"
  | "toilet" | "sink" | "shower" | "gym_machine" | "bench" | "reception_desk" | "plant"
  | "bar_counter" | "stool";

export interface Door {
  id: string;
  to: string;
  leaves: 1 | 2 | 3 | 4;
  width: number;
  position: Point;
  angleDeg: number;
}

export interface Room {
  id: string;
  kind: RoomKind;
  polygon: Point[];
  unit?: string;
  doors: Door[];
}

export interface Furniture {
  id: string;
  kind: FurnitureKind;
  room: string;
  position: Point;
  rotationDeg: number;
  size: [number, number, number];
}

export interface Rect3 {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
}

export interface ElevatorCore {
  id: string;
  rect: Rect;
  doorEdge: 0 | 1 | 2 | 3;
}

export type StairStyle = "u_return" | "straight";

export interface StairCore {
  id: string;
  rect: Rect;
  style: StairStyle;
  entry: Point;
  steps?: Rect3[];
}

export interface FloorCore {
  elevators: ElevatorCore[];
  stairs: StairCore[];
  shafts: Rect[];
}

export interface FloorInterior {
  floor: number;
  kind: string;
  elevation: number;
  height: number;
  core: FloorCore;
  rooms: Room[];
  furniture: Furniture[];
}

// ---- npc.schema.json ----

export type AnchorKind =
  | "entrance" | "work_spot" | "counter_spot" | "seat" | "idle_spot" | "patrol_point"
  | "bed" | "toilet" | "machine_spot" | "elevator_wait" | "stair_entry" | "cleaning_spot";

export type NpcRole =
  | "receptionist" | "security" | "vendor" | "barista" | "waiter" | "cook"
  | "office_worker" | "executive" | "cleaner" | "resident" | "trainer" | "guest";

export type Animation =
  | "idle_stand" | "idle_sit" | "idle_lean" | "work_type" | "work_serve"
  | "work_cook" | "sweep" | "patrol_stand" | "exercise" | "sleep" | "use_toilet";

export interface Anchor {
  id: string;
  floor: number;
  room: string;
  kind: AnchorKind;
  position: Point;
  facingDeg: number;
  furniture?: string;
}

export interface RoleSlot {
  id: string;
  role: NpcRole;
  floor: number;
  homeAnchor: string;
  count: [number, number];
}

export interface RoutineStep {
  anchor: string;
  minutes: [number, number];
  animation: Animation;
}

export interface Routine {
  role: string;
  steps: RoutineStep[];
}

export interface NavFloor {
  floor: number;
  origin: Point;
  cols: number;
  rows: number;
  /** row-major bitmask, base64 */
  walkable: string;
}

export interface NavConnector {
  id: string;
  kind: "stair" | "elevator";
  floors: number[];
  entryByFloor: Record<string, Point>;
}

export interface Nav {
  cellSize: number;
  floors: NavFloor[];
  connectors: NavConnector[];
}

export interface NpcSupport {
  buildingId: string;
  anchors: Anchor[];
  roles: RoleSlot[];
  routines: Routine[];
  nav: Nav;
}

// ---- result ----

export interface InteriorResult {
  glb: Uint8Array;
  floors: FloorInterior[];
  npc: NpcSupport;
}
