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
};

export const STAIR = {
  riser: 0.17,
  tread: 0.28,
  flightWidth: 1.15,
  flightGap: 0.15,
  landing: 1.2,
  maxRisersPerFlight: 14,
  headroom: 2.03,
};

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

export const ROOM = {
  minArea: 4,
  minDim: 1.6,
  minStripDepth: 3.0,
  maxUnitDepth: 8, // daylight depth from facade
  studioFront: [5, 6.5] as const,
  apartmentFront: [7, 9] as const,
  hotelFront: [4, 4.5] as const,
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

/** Two egress stairs beyond either threshold (IBC-derived). */
export const TWO_STAIRS = { areaOver: 460, floorsOver: 4 };
