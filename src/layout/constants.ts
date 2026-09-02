/** Architecture constants. Sources and reasoning: docs/RESEARCH.md. Meters. */

export const CELL = 0.25; // nav grid cell
export const SNAP = 0.5; // layout rects snap to this grid
export const WALL = 0.1; // interior partition thickness
export const AGENT_RADIUS = 0.3; // NPC body radius used to erode walkable space

export const CORRIDOR = {
  /** uniform main corridor width: stair shafts and elevator banks sit flush inside its band */
  width: 2.5,
  serviceStub: 1.2,
  deadEndMax: 6,
};

export const DOOR = {
  single: 0.9,
  interior: 0.8,
  bath: 0.7,
  double: 1.8,
  triple: 2.7,
  quad: 3.6,
  clearance: 1.0, // free depth kept on both sides of any door
  jamb: 0.15, // free width kept beyond each jamb, so a leaf swings past the frame
  clearHeight: 2.1, // an item entirely above this is out of the way (ceiling fixtures)
};

export const STAIR = {
  riser: 0.17,
  tread: 0.28,
  flightWidth: 1.15,
  flightGap: 0.15,
  landing: 1.2,
  maxRisersPerFlight: 14,
  /** clear width of one flight; the game capsule is 0.7 m wide */
  clearWidth: 1.0,
  /** clear height over every tread and landing along the walk line */
  headroom: 2.1,
  /** structural thickness under treads and landings */
  slab: 0.15,
  minSlab: 0.06,
};

/** Tread slab for one storey: thin enough that the flight above keeps the headroom. Floors
 *  are at least 2.2 m (blueprint schema), which the minimum slab still clears. */
export function stairSlab(storeyHeight: number): number {
  return Math.max(STAIR.minSlab, Math.min(STAIR.slab, storeyHeight - STAIR.headroom));
}

export const ELEVATOR = {
  shaft: 2.5, // square shaft per car
  lobbyDepth: 2.4,
  officeAreaPerCar: 4200,
  unitsPerCar: 70,
  unitAreaGuess: 80,
  maxCars: 8,
  serviceAboveElevation: 36.6,
};

export const RISER_SHAFT = { w: 1.2, d: 2.5 }; // AC and wiring vertical run

export const CEILING = {
  drop: 0.35, // dropped ceiling under the structural soffit: services and light housings
  minClear: 2.1, // clear height kept under it, whatever the storey
};

/** Ceiling plane of a space, above its own floor level. Low storeys keep the clear height
 *  and lose the service void instead. */
export function ceilingClear(spaceHeight: number): number {
  return spaceHeight - Math.min(CEILING.drop, Math.max(0, spaceHeight - CEILING.minClear));
}

/**
 * The ceiling height a floor takes: under a curtain wall it meets the spandrel
 * line the exterior drew (the band that hides the slab), so nothing shows
 * between ceiling and glass; elsewhere the standard drop.
 */
export function ceilingUnder(openings: readonly { spandrel?: number }[], spaceHeight: number): number {
  const spandrel = Math.max(0, ...openings.map((o) => o.spandrel ?? 0));
  const atSpandrel = spaceHeight - spandrel;
  return spandrel > 0 && atSpandrel >= CEILING.minClear ? atSpandrel : ceilingClear(spaceHeight);
}

export const ROOM = {
  minArea: 4,
  minDim: 1.6,
  minStripDepth: 3.0,
  maxUnitDepth: 8, // daylight depth from facade
  studioFront: [5, 6.5] as const,
  apartmentFront: [7, 9] as const,
  hotelFront: [4, 4.5] as const,
  shopFront: [7, 11] as const,
  /** back-of-shop stock band, kept when the strip is deep enough for both */
  stockDepth: 3,
  bath: { w: 1.7, d: 2.4 },
  kitchen: { w: 2.4, d: 2.7 },
  toilets: { w: 2.4, d: 2.5 },
  meeting: { w: 4, d: 5 },
  officePrivate: { w: 3, d: 4 },
  executive: { w: 5, d: 6 },
  locker: { w: 3, d: 4 },
  storage: { w: 2, d: 2.5 },
  restaurantKitchenShare: [0.28, 0.38] as const,
};

/** The walkable spine every floor hangs off: rooms flood from it and it carries the patrol,
 *  cleaning and core anchors. */
export const SPINE_KINDS: ReadonlySet<string> = new Set(["corridor", "elevator_lobby", "concourse"]);

/** Two egress stairs beyond either threshold (IBC-derived). */
export const TWO_STAIRS = { areaOver: 460, floorsOver: 4 };

/** Plates shallower than this get a single-loaded corridor: core row flush to the back
 *  facade, one deep strip of rooms instead of two shallow ones. */
export const SINGLE_LOADED_BELOW = 12.5;

/** Stair-only degrade for footprints whose band cannot hold an elevator core. */
export const WALKUP = { maxFloors: 6 };
