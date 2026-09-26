import type { Point } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import type { Nav, NavConnector } from "../core/types.js";
import { connectorRoute, type FloorWalk } from "./connector-route.js";
import { GridSearch, gridPath, nearestWalkable } from "./grid-path.js";

/** Metres an endpoint off the walkable grid may move to the nearest walkable cell centre. */
export const NAV_SNAP_RADIUS = 1;

/** One point of a building's navigation: nav floor index and XZ in the nav's frame. */
export interface NavPoint { floor: number; x: number; z: number }
export interface NavRouteRequest { nav: Nav; from: NavPoint; to: NavPoint }
/** A walk on one floor, from its first point to its last. */
export interface NavLeg { floor: number; points: Point[] }
/** A stair or lift transfer between entries of one connector. */
export interface NavTransfer {
  id: string;
  kind: NavConnector["kind"];
  fromFloor: number;
  toFloor: number;
  from: Point;
  to: Point;
}
/** `legs[i]` ends at `connectors[i].from`, and `connectors[i].to` starts `legs[i + 1]`. */
export interface NavRoute { legs: NavLeg[]; connectors: NavTransfer[] }
export type NavErrorCode = "E_NAV_INPUT" | "E_NAV_FLOOR" | "E_NAV_OFF_GRID" | "E_NAV_UNREACHABLE";
export interface NavFailure { error: { code: NavErrorCode; message: string } }

/** Floor-aware route over a building's published `npc.nav`, or the reason there is none.
 *  Endpoints off the walkable grid snap within NAV_SNAP_RADIUS; walks use grid A* with
 *  line-of-sight smoothing and floors change only through published connectors. */
export function findPath(request: NavRouteRequest): NavRoute | NavFailure {
  const problem = endpointProblem(request);
  if (problem) return failure("E_NAV_INPUT", problem);
  const { nav, from, to } = request;
  const cache = navCache(nav);
  if (typeof cache === "string") return failure("E_NAV_INPUT", cache);
  const start = endpoint(cache.grids, from, "from");
  if ("error" in start) return start;
  const goal = endpoint(cache.grids, to, "to");
  if ("error" in goal) return goal;
  // A walk touching an endpoint grows that endpoint's one search, headed for every point
  // it may be asked to reach on its floor.
  const searches = new Map<Point, GridSearch>();
  const walk: FloorWalk = (floor, a, b, portals) => {
    const grid = cache.grids.get(floor);
    if (!grid) return null;
    if (!portals) {
      const outward = a === start.position, root = outward ? a : b;
      let search = searches.get(root);
      if (!search) {
        const other = root === start.position ? goal : start;
        search = new GridSearch(grid, root, [...cache.entries.get(floor) ?? [], ...other.floor === floor ? [other.position] : []]);
        searches.set(root, search);
      }
      return search.walk(outward ? b : a, outward);
    }
    const key = `${floor}|${a[0]},${a[1]}|${b[0]},${b[1]}`;
    if (!cache.walks.has(key)) cache.walks.set(key, gridPath(grid, a, b));
    return cache.walks.get(key)!;
  };
  return connectorRoute(nav.connectors, start, goal, walk)
    ?? failure("E_NAV_UNREACHABLE", `no route joins ${describe(from)} to ${describe(to)}`);
}

interface NavCache {
  grids: Map<number, WalkGrid>;
  /** connector entries by floor */
  entries: Map<number, Point[]>;
  /** walks between connector entries, which every query of this building shares */
  walks: Map<string, Point[] | null>;
}

/** Each nav object's decoded grids, or why it cannot be routed over. */
const caches = new WeakMap<Nav, NavCache | string>();

function navCache(nav: Nav): NavCache | string {
  let cache = caches.get(nav);
  if (cache === undefined) {
    cache = navProblem(nav) ?? decode(nav);
    caches.set(nav, cache);
  }
  return cache;
}

function decode(nav: Nav): NavCache {
  const grids = new Map(nav.floors.map(f => [f.floor, WalkGrid.fromBase64(f.walkable, f.origin, nav.cellSize, f.cols, f.rows)]));
  const entries = new Map<number, Point[]>();
  for (const connector of nav.connectors) for (const floor of connector.floors) {
    const entry = connector.entryByFloor[String(floor)];
    if (entry) entries.set(floor, [...entries.get(floor) ?? [], entry]);
  }
  return { grids, entries, walks: new Map() };
}

function endpoint(grids: Map<number, WalkGrid>, point: NavPoint, name: string): { floor: number; position: Point } | NavFailure {
  const grid = grids.get(point.floor);
  if (!grid) return failure("E_NAV_FLOOR", `${name} floor ${point.floor} has no navigation grid`);
  const position = nearestWalkable(grid, [point.x, point.z], NAV_SNAP_RADIUS);
  if (!position) return failure("E_NAV_OFF_GRID", `${name} ${describe(point)} is over ${NAV_SNAP_RADIUS} m from walkable floor`);
  return { floor: point.floor, position };
}

function endpointProblem(request: NavRouteRequest): string | null {
  if (typeof request?.nav !== "object" || request.nav === null) return "nav must be a building's npc.nav object";
  for (const name of ["from", "to"] as const) {
    const point = request[name];
    if (!point || !Number.isInteger(point.floor) || !Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      return `${name} must be {floor: integer, x: number, z: number}`;
    }
  }
  return null;
}

/** What makes a nav unreadable: anything findPath reads that npc.schema.json's nav would reject,
 *  or a bitmask shorter than its grid. */
function navProblem(nav: Nav): string | null {
  if (!(typeof nav.cellSize === "number" && nav.cellSize > 0 && Number.isFinite(nav.cellSize))) return "nav.cellSize must be a positive number";
  if (!Array.isArray(nav.floors) || !Array.isArray(nav.connectors)) return "nav must carry floors and connectors arrays";
  for (const [i, f] of nav.floors.entries()) {
    if (!f || !Number.isInteger(f.floor) || !isPoint(f.origin) || !isCount(f.cols) || !isCount(f.rows)
      || typeof f.walkable !== "string" || !BASE64.test(f.walkable)) {
      return `nav.floors[${i}] must be {floor: integer, origin: [x, z], cols, rows: positive integers, walkable: base64}`;
    }
    if (Math.floor(f.walkable.replace(/=+$/, "").length * 3 / 4) < Math.ceil(f.cols * f.rows / 8)) {
      return `nav.floors[${i}].walkable holds fewer than its ${f.cols} x ${f.rows} cells`;
    }
  }
  for (const [i, c] of nav.connectors.entries()) {
    if (!c || typeof c.id !== "string" || (c.kind !== "stair" && c.kind !== "elevator") || !Array.isArray(c.floors)
      || !c.floors.every(Number.isInteger) || typeof c.entryByFloor !== "object" || c.entryByFloor === null
      || !c.floors.every(floor => c.entryByFloor[String(floor)] === undefined || isPoint(c.entryByFloor[String(floor)]))) {
      return `nav.connectors[${i}] must be {id, kind: stair or elevator, floors: integers, entryByFloor: floor to [x, z]}`;
    }
  }
  return null;
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
}

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0;
}

function describe(point: NavPoint): string {
  return `floor ${point.floor} (${point.x}, ${point.z})`;
}

function failure(code: NavErrorCode, message: string): NavFailure {
  return { error: { code, message } };
}
