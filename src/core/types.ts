/** TypeScript mirror of ../../schemas/*.schema.json. Schemas are the source of truth. */

import type { Point, Rect } from "./geom.js";

// ---- request.schema.json ----

/** Atlas parcel vocabulary, adopted verbatim project-wide. */
export type BuildingType =
  | "residential" | "hotel" | "offices" | "corpo" | "hospital" | "clinic" | "police"
  | "military" | "factory" | "commerce" | "mall" | "restaurant" | "coffee_shop";

export type Tier = "poor" | "mid" | "rich" | "high_rich";

export type FloorKind =
  | "lobby" | "office" | "corpo_office" | "restaurant" | "coffee_shop" | "gym"
  | "retail" | "mall_floor"
  | "residence_studio" | "apartment" | "hotel_rooms" | "mechanical" | "parking" | "terrace";

export interface FloorAssignment {
  floor: number;
  kind: FloorKind;
  spans?: 1 | 2;
}

export interface InteriorRequest {
  /** uint32, or any string (hashed internally, e.g. the exterior seed) */
  seed: number | string;
  building: { id: string; type: BuildingType; tier: Tier };
  shellGlb: string;
  blueprint: Blueprint;
  /** optional: derived from blueprint floor kind slugs when omitted */
  assignments?: FloorAssignment[];
  materialTheme: string;
}

// ---- blueprint.schema.json ----

export type OpeningKind = "door" | "window" | "balconyDoor" | "openFront" | "aperture";

export interface OpeningPortal {
  frameWidth: number;
  frameDepth: number;
  recessDepth: number;
  clearWidth: number;
  clearHeight: number;
  clearDepth: number;
}

export interface Opening {
  id: string;
  kind: OpeningKind;
  edge: number;
  offset: number;
  width: number;
  height: number;
  sill: number;
  /** present on exterior doors and balcony doors */
  leaves?: 1 | 2 | 3 | 4;
  /** fitted, permanently open connection; present exactly on openFront */
  portal?: OpeningPortal;
  /** primary navigation role; present exactly on openFront */
  accessRole?: "main";
  /** fitted moving-door assembly, when this opening carries one */
  door?: {
    frameWidth?: number;
    frameDepth?: number;
    recessDepth?: number;
    thresholdHeight?: number;
    motion?: { clearDepth: number; [extra: string]: unknown };
    [extra: string]: unknown;
  };
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

/** Exterior facade: `wallDepth` is the measured inward reach of the shell wall (reveals,
 *  frames, glazing, closed leaves); without it the style picks a per-style depth. */
export interface FacadeGrid {
  floor: number;
  edge: number;
  /** centre and complete usable width of an opening-free structural run */
  partitionAnchors: { offset: number; width: number }[];
  [extra: string]: unknown;
}

export interface Facade {
  style?: string;
  wallDepth?: number;
  grids?: FacadeGrid[];
  [extra: string]: unknown;
}

export interface Blueprint {
  buildingId: string;
  bounds?: { footprint: Point[]; height: number };
  facade?: Facade;
  /** the exterior's roof and fitted housing over the stair head */
  roof?: {
    elevation?: number;
    outline?: Point[];
    parapetHeight?: number;
    bulkhead?: {
      center: Point;
      axis: Point;
      width: number;
      depth: number;
      housingHeight?: number;
      doorNormal?: Point;
      doorWidth?: number;
      doorHeight?: number;
    } | null;
    artifacts?: { center: Point; size: [number, number, number]; rotationDeg: number; [extra: string]: unknown }[];
    [extra: string]: unknown;
  };
  floors: BlueprintFloor[];
  [extra: string]: unknown;
}

// ---- floor.schema.json ----

export type RoomKind =
  | "corridor" | "elevator_lobby" | "concourse" | "reception" | "lounge"
  | "office_open" | "office_private" | "meeting" | "executive_office"
  | "dining_area" | "kitchen" | "counter_area" | "bar" | "sales_floor"
  | "bedroom" | "living" | "studio_main" | "bathroom" | "toilets"
  | "gym_floor" | "locker_room" | "storage" | "mechanical_room"
  | "terrace_open" | "parking_area";

export type FurnitureKind =
  | "desk" | "office_chair" | "meeting_table" | "counter" | "shelf" | "sofa" | "low_table"
  | "bed_single" | "bed_double" | "wardrobe" | "kitchen_block" | "fridge" | "dining_table" | "chair"
  | "toilet" | "sink" | "shower" | "gym_machine" | "bench" | "reception_desk" | "plant"
  | "bar_counter" | "stool" | "display_rack"
  | "wall_shelf" | "display_screen" | "wall_art" | "crate";

interface RoomConnection {
  id: string;
  to: string;
  width: number;
  position: Point;
  angleDeg: number;
}

export interface RoomDoor extends RoomConnection {
  /** regular doors omit kind; the schema reserves it for open fronts */
  kind?: never;
  leaves: 1 | 2 | 3 | 4;
  /** moving-leaf reservation consumed from an exterior connection */
  clearDepth?: number;
}

/** Permanently open street connection. It has traversable dimensions and no leaves. */
export interface OpenFrontConnection extends RoomConnection {
  kind: "openFront";
  clearHeight: number;
  clearDepth: number;
}

export type Door = RoomDoor | OpenFrontConnection;

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
  /** base height above the floor; wall pieces hang, everything else stands at 0 */
  elevation?: number;
}

export type LightKind = "strip" | "spot" | "cove";

/** One light source of a floor: the engine instantiates it, and the geometry carries the
 *  matching emissive housing at the same pose. */
export interface LightFixture {
  id: string;
  kind: LightKind;
  /** room id, or a core element id (stair-a) for shaft lighting */
  room: string;
  /** fixture center in building-local meters, [x, y, z] */
  position: [number, number, number];
  /** run length of a strip or cove; 0 for a spot */
  length: number;
  /** run direction around +Y, degrees; 0 for a spot */
  angleDeg: number;
  /** luminous flux, lumens */
  intensity: number;
  colorTemperatureK: number;
  /** useful radius, meters */
  range: number;
  /** full spread of the light: a strip and a cove wash wide and soft, a spot throws down */
  beamDeg: number;
  /** share of flux emitted as a soft wash, 0..1 */
  diffuse: number;
  /** where the light goes: a ceiling fixture throws down, a cove washes the ceiling up */
  facing: "down" | "up";
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
  /** absolute Y of the finished ceiling plane; the plenum above it varies per floor */
  ceilingElevation: number;
  /** rotation of the building's layout frame; every core rect and stair step is axis-aligned
   *  in that frame, rotated about its own center by this angle for world corners */
  coreAngleDeg: number;
  core: FloorCore;
  /** exact exterior opening volumes kept free of unrelated interior geometry */
  openingReservations: OpeningReservation[];
  rooms: Room[];
  furniture: Furniture[];
  lights: LightFixture[];
}

export interface OpeningReservation {
  opening: string;
  kind: OpeningKind;
  /** centre on the facade in building-local XZ meters */
  position: Point;
  /** wall run direction around +Y */
  angleDeg: number;
  /** unit vector from the facade into the floor */
  inward: Point;
  /** clear opening width plus the full partition safety allowance */
  width: number;
  /** opening bottom and height above this floor's walking surface */
  sill: number;
  height: number;
  /** inward reservation through the shell and any moving leaf */
  depth: number;
}

// ---- npc.schema.json ----

export type AnchorKind =
  | "entrance" | "work_spot" | "counter_spot" | "seat" | "idle_spot" | "patrol_point"
  | "bed" | "toilet" | "machine_spot" | "elevator_wait" | "stair_entry" | "cleaning_spot";

export type NpcRole =
  | "receptionist" | "security" | "vendor" | "barista" | "waiter" | "cook" | "clerk"
  | "office_worker" | "executive" | "cleaner" | "resident" | "trainer" | "guest";

export type Animation =
  | "idle_stand" | "idle_sit" | "idle_lean" | "work_type" | "work_serve" | "work_stock"
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
  /** fitted last-floor stair connection and synthetic nav level for a usable roof */
  roofAccess?: RoofAccess;
}

export interface RoofAccess {
  /** synthetic nav floor, one above the highest blueprint floor */
  floor: number;
  elevation: number;
  stair: "stair-a";
  /** roof-level platform from the stair arrival to the enclosure door */
  landing: Point[];
  door: {
    position: Point;
    normal: Point;
    width: number;
    height: number;
    thresholdElevation: number;
  };
  /** walkable point just outside the enclosure door */
  entry: Point;
}

export interface NpcSupport {
  buildingId: string;
  anchors: Anchor[];
  roles: RoleSlot[];
  routines: Routine[];
  nav: Nav;
}

// ---- result ----

export interface InteriorOutput {
  floors: FloorInterior[];
  npc: NpcSupport;
  /** what the GLB carries: external map URIs, embedded maps, or material keys only */
  textures: { mode: "external" | "embedded" | "keys"; baseUrl?: string; materials: number };
}

export interface InteriorResult extends InteriorOutput {
  glb: Uint8Array;
  /** on request: the interior of each floor band as its own GLB, keyed by floor index */
  floorGlbs?: Map<number, Uint8Array>;
}

/** Floor-streaming result. It intentionally has no combined building GLB. */
export interface FloorInteriorResult extends InteriorOutput {
  floorGlbs: Map<number, Uint8Array>;
}
