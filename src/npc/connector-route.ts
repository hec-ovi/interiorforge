import type { Point } from "../core/geom.js";
import type { NavConnector } from "../core/types.js";
import type { PathLeg, PathQuery } from "./find-path.js";

type Portal = PathQuery & { connector?: NavConnector };
type Walk = (floor: number, from: Point, to: Point) => Point[] | null;

/** Walking-distance equivalents keep stair travel additive and charge for boarding a lift. */
const STAIR_PER_FLOOR = 12;
const ELEVATOR_PER_FLOOR = 2;
const ELEVATOR_BOARDING = 12;

/** Dijkstra across reachable portal pairs, including private mezzanine transfers. */
export function connectorRoute(
  connectors: readonly NavConnector[], from: PathQuery, to: PathQuery, walk: Walk,
): PathLeg[] | null {
  const nodes: Portal[] = [from, to, ...connectors.flatMap(connector => connector.floors.flatMap(floor => {
    const position = connector.entryByFloor[String(floor)];
    return position ? [{ floor, position, connector }] : [];
  }))];
  const costs = nodes.map(() => Infinity), done = new Set<number>();
  costs[0] = 0;
  const previous = new Map<number, { node: number; leg: PathLeg }>();
  while (done.size < nodes.length) {
    let current = -1, best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!done.has(i) && costs[i]! < best) { current = i; best = costs[i]!; }
    }
    if (current < 0) return null;
    if (current === 1) {
      const path: PathLeg[] = [];
      let at = 1;
      while (at !== 0) {
        const step = previous.get(at)!;
        path.push(step.leg);
        at = step.node;
      }
      return joinRides(path.reverse());
    }
    done.add(current);
    const a = nodes[current]!;
    for (let i = 0; i < nodes.length; i++) {
      if (done.has(i)) continue;
      const b = nodes[i]!;
      let leg: PathLeg, cost: number;
      if (a.floor === b.floor) {
        const points = walk(a.floor, a.position, b.position);
        if (!points) continue;
        leg = { kind: "walk", floor: a.floor, points };
        cost = points.slice(1).reduce((sum, p, k) =>
          sum + Math.hypot(p[0] - points[k]![0], p[1] - points[k]![1]), 0);
      } else if (a.connector && a.connector === b.connector) {
        leg = { kind: "ride", connector: a.connector.id, fromFloor: a.floor, toFloor: b.floor };
        const span = Math.abs(a.floor - b.floor);
        cost = a.connector.kind === "stair" ? span * STAIR_PER_FLOOR
          : ELEVATOR_BOARDING + span * ELEVATOR_PER_FLOOR;
      } else continue;
      if (best + cost < costs[i]!) {
        costs[i] = best + cost;
        previous.set(i, { node: current, leg });
      }
    }
  }
  return null;
}

function joinRides(path: PathLeg[]): PathLeg[] {
  const joined: PathLeg[] = [];
  for (const leg of path) {
    const previous = joined.at(-1);
    if (previous?.kind === "ride" && leg.kind === "ride" && previous.connector === leg.connector
      && previous.toFloor === leg.fromFloor) previous.toFloor = leg.toFloor;
    else joined.push(leg);
  }
  return joined;
}
