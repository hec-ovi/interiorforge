import type { Point } from "../core/geom.js";
import type { NavConnector } from "../core/types.js";
import type { NavLeg, NavRoute, NavTransfer } from "./find-path.js";
import { MinHeap } from "./min-heap.js";

interface Portal { floor: number; position: Point; connector?: NavConnector }
/** A walk between two points of one floor; `portals` marks a pair of published connector
 *  entries, whose walk depends on the building alone. */
export type FloorWalk = (floor: number, from: Point, to: Point, portals: boolean) => Point[] | null;
type Step = { walk: NavLeg } | { ride: NavTransfer };

/** Walking-distance equivalents keep stair travel additive and charge for boarding a lift. */
const STAIR_PER_FLOOR = 12;
const ELEVATOR_PER_FLOOR = 2;
const ELEVATOR_BOARDING = 12;

/** A way into a node: a ride or priced walk, or a walk known only by its straight-line
 *  lower bound until it reaches the front of the queue. */
interface Offer { node: number; via: number; cost: number; step?: Step }

/** Dijkstra across the endpoints and every connector entry: walks join points of one floor
 *  and rides join entries of one connector, so walks and rides alternate. An entry reached on
 *  foot only boards, since a walk through it is never shorter than the direct one, and an
 *  entry reached by a ride only walks on, since every entry rides straight to every floor of
 *  its connector at no more than a chain of rides costs. A walk is priced only when its
 *  straight-line bound reaches the front of the queue, so far entries never run a grid
 *  search. Null when no route exists. */
export function connectorRoute(
  connectors: readonly NavConnector[], from: Portal, to: Portal, walk: FloorWalk,
): NavRoute | null {
  const nodes: Portal[] = [from, to, ...connectors.flatMap(connector => connector.floors.flatMap(floor => {
    const position = connector.entryByFloor[String(floor)];
    return position ? [{ floor, position, connector }] : [];
  }))];
  const settled = new Uint8Array(nodes.length), reached = new Float64Array(nodes.length);
  const previous = new Map<number, { node: number; step: Step }>();
  const offers: Offer[] = [], queue = new MinHeap();
  const offer = (item: Offer): void => queue.push(offers.push(item) - 1, item.cost);
  offer({ node: 0, via: -1, cost: 0 });
  while (queue.size > 0) {
    const item = offers[queue.pop()]!;
    if (settled[item.node]) continue;
    const b = nodes[item.node]!;
    if (item.via >= 0 && !item.step) {
      const a = nodes[item.via]!;
      const points = walk(b.floor, a.position, b.position, Boolean(a.connector && b.connector));
      if (points) offer({ ...item, cost: reached[item.via]! + length(points), step: { walk: { floor: b.floor, points } } });
      continue;
    }
    settled[item.node] = 1;
    reached[item.node] = item.cost;
    if (item.step) previous.set(item.node, { node: item.via, step: item.step });
    if (item.node === 1) {
      const steps: Step[] = [];
      for (let at = 1; at !== 0;) {
        const back = previous.get(at)!;
        steps.push(back.step);
        at = back.node;
      }
      return join(steps.reverse());
    }
    const walked = item.step !== undefined && "walk" in item.step, rode = item.step !== undefined && !walked;
    for (let i = 0; i < nodes.length; i++) {
      const next = nodes[i]!;
      if (settled[i]) continue;
      if (next.floor === b.floor) {
        if (!walked) offer({ node: i, via: item.node, cost: item.cost + distance(b.position, next.position) });
      } else if (!rode && b.connector && b.connector === next.connector) {
        const span = Math.abs(b.floor - next.floor);
        offer({ node: i, via: item.node, step: { ride: { id: b.connector.id, kind: b.connector.kind, fromFloor: b.floor, toFloor: next.floor, from: b.position, to: next.position } },
          cost: item.cost + (b.connector.kind === "stair" ? span * STAIR_PER_FLOOR : ELEVATOR_BOARDING + span * ELEVATOR_PER_FLOOR) });
      }
    }
  }
  return null;
}

/** Walks alternate with rides, the route starting and ending on foot, so `legs` holds
 *  exactly one more entry than `connectors`. Points are fresh arrays, never the cached walks
 *  or the nav's own entries. */
function join(steps: readonly Step[]): NavRoute {
  const legs: NavLeg[] = [], connectors: NavTransfer[] = [];
  for (const step of steps) {
    if ("walk" in step) legs.push({ floor: step.walk.floor, points: step.walk.points.map(copy) });
    else connectors.push({ ...step.ride, from: copy(step.ride.from), to: copy(step.ride.to) });
  }
  return { legs, connectors };
}

function copy([x, z]: Point): Point {
  return [x, z];
}

function length(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += distance(points[i - 1]!, points[i]!);
  return sum;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}
