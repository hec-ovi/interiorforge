import { STAIR, WALL } from "./constants.js";

/** Shared stair arithmetic used by both core feasibility and emitted geometry. */
export interface FlightPlan {
  /** Even, so a U-return stair arrives over its entry landing. */
  flights: number;
  risersPerFlight: number;
  rise: number;
}

/** Split a climb into equal flights with risers inside the comfort band. */
export function planFlights(climb: number): FlightPlan {
  const { min, ideal, max } = STAIR.riser;
  const idealCount = climb / ideal;
  const flights = 2 * Math.ceil(idealCount / (2 * STAIR.maxRisersPerFlight));
  const low = Math.ceil(climb / max - 1e-9);
  const high = Math.floor(climb / min + 1e-9);
  let total: number | null = null;
  for (let count = low; count <= high; count++) {
    if (count % flights !== 0) continue;
    if (total === null || Math.abs(count - idealCount) < Math.abs(total - idealCount)) total = count;
  }
  const resolved = total ?? Math.max(flights, Math.round(idealCount / flights) * flights);
  return { flights, risersPerFlight: resolved / flights, rise: climb / resolved };
}

/** Two clear flights plus the wall halves standing on the shaft boundary. */
export const SHAFT_WIDTH = 2 * STAIR.flightWidth + WALL;

/** Shaft length for one flight between two full landings, including boundary wall halves. */
export function shaftLength(risersPerFlight: number): number {
  return roundUpTo(risersPerFlight * STAIR.tread + 2 * STAIR.landing + WALL, 0.1);
}

/** Size for the longest flight required by any climb in the building. */
export function shaftDepthFor(climbs: readonly number[]): number {
  let worst = 0;
  for (const climb of climbs) worst = Math.max(worst, planFlights(climb).risersPerFlight);
  return shaftLength(worst);
}

function roundUpTo(value: number, step: number): number {
  return Math.round(Math.ceil(value / step - 1e-9) * step * 1000) / 1000;
}
