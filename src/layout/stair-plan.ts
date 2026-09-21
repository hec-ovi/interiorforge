import { STAIR, WALL } from "./constants.js";

/** Shared stair arithmetic used by both core feasibility and emitted geometry. */
export interface FlightPlan {
  /** Even, so a U-return stair arrives over its entry landing. */
  flights: number;
  risersPerFlight: number;
  rise: number;
}

/** Split a climb into the fewest equal flights with risers inside the comfort band. */
export function planFlights(climb: number): FlightPlan {
  const { min, ideal, max } = STAIR.riser;
  const idealCount = climb / ideal;
  const low = Math.ceil(climb / max - 1e-9);
  const high = Math.floor(climb / min + 1e-9);
  // Use the tallest allowed riser to decide whether another pair of flights is
  // necessary. A 5 m climb fits two flights of 14 at 0.1786 m: sizing from the
  // ideal 0.17 m instead needlessly stacks four short flights in the same shaft.
  const flights = 2 * Math.ceil(low / (2 * STAIR.maxRisersPerFlight));
  let total: number | null = null;
  for (let count = low; count <= high; count++) {
    if (count % flights !== 0 || count / flights > STAIR.maxRisersPerFlight) continue;
    if (total === null || Math.abs(count - idealCount) < Math.abs(total - idealCount)) total = count;
  }
  const resolved = total ?? Math.max(flights, Math.round(idealCount / flights) * flights);
  return { flights, risersPerFlight: resolved / flights, rise: climb / resolved };
}

/** Two clear flights plus the wall halves standing on the shaft boundary. */
export const SHAFT_WIDTH = 2 * (STAIR.flightWidth + 2 * STAIR.railAllowance) + WALL;

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
