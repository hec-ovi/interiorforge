import { InteriorError } from "../core/errors.js";
import { pointInPolygon, polygonArea, polygonBounds, type Point } from "../core/geom.js";
import type { RoomShape } from "./room-shape.js";
import type { UvRect } from "./uv.js";
import { uvRectCorners } from "./uv.js";

interface Segment { a: Point; b: Point }
const EPS = 1e-7;
const key = (point: Point): string => `${Math.round(point[0] / EPS)},${Math.round(point[1] / EPS)}`;
const cross = (a: Point, b: Point): number => a[0] * b[1] - a[1] * b[0];
const vector = (a: Point, b: Point): Point => [b[0] - a[0], b[1] - a[1]];
const at = (segment: Segment, t: number): Point => [
  segment.a[0] + (segment.b[0] - segment.a[0]) * t,
  segment.a[1] + (segment.b[1] - segment.a[1]) * t,
];

/** Exact architectural ownership from an outline and axis-aligned occupied rectangles. */
export class RoomRegion {
  constructor(private readonly outline: readonly Point[]) {}

  subtract(rectangles: readonly UvRect[]): RoomShape[] {
    const cuts = rectangles.filter(rect => rect.lu > EPS && rect.lv > EPS);
    const rings = [this.outline, ...cuts.map(uvRectCorners)];
    const sources: Segment[] = rings.flatMap(ring => ring.map((a, i) => ({ a, b: ring[(i + 1) % ring.length]! })));
    const owns = (point: Point): boolean => pointInPolygon(point, this.outline)
      && !cuts.some(rect => point[0] > rect.u && point[0] < rect.u + rect.lu
        && point[1] > rect.v && point[1] < rect.v + rect.lv);
    const boundary = new Map<string, Segment>();
    for (const source of sources) {
      const direction = vector(source.a, source.b);
      const length = Math.hypot(...direction);
      if (length < EPS) continue;
      const parameters = [0, 1, ...sources.flatMap(other => intersections(source, other))]
        .filter(t => t >= -EPS && t <= 1 + EPS).map(t => Math.max(0, Math.min(1, t)))
        .sort((a, b) => a - b);
      for (let i = 1; i < parameters.length; i++) {
        const lo = parameters[i - 1]!, hi = parameters[i]!;
        if ((hi - lo) * length < EPS) continue;
        const middle = at(source, (lo + hi) / 2);
        const normal: Point = [-direction[1] / length * EPS, direction[0] / length * EPS];
        const left = owns([middle[0] + normal[0], middle[1] + normal[1]]);
        const right = owns([middle[0] - normal[0], middle[1] - normal[1]]);
        if (left === right) continue;
        const a = rounded(at(source, left ? lo : hi)), b = rounded(at(source, left ? hi : lo));
        if (key(a) === key(b)) continue;
        boundary.set(`${key(a)}>${key(b)}`, { a, b });
      }
    }
    return assemble([...boundary.values()]);
  }
}

function rounded(point: Point): Point {
  return point.map(value => Math.round(value / EPS) * EPS) as Point;
}

/** All parameters where two segments intersect, including collinear overlap endpoints. */
function intersections(first: Segment, second: Segment): number[] {
  const r = vector(first.a, first.b), s = vector(second.a, second.b), delta = vector(first.a, second.a);
  const denominator = cross(r, s);
  if (Math.abs(denominator) > 1e-10) {
    const t = cross(delta, s) / denominator, u = cross(delta, r) / denominator;
    return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [t] : [];
  }
  if (Math.abs(cross(delta, r)) > EPS * Math.hypot(...r)) return [];
  const length2 = r[0] ** 2 + r[1] ** 2;
  if (length2 < EPS ** 2) return [];
  return [second.a, second.b].map(point => ((point[0] - first.a[0]) * r[0] + (point[1] - first.a[1]) * r[1]) / length2);
}

function assemble(segments: Segment[]): RoomShape[] {
  const outgoing = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    const indices = outgoing.get(key(segment.a)) ?? [];
    indices.push(index);
    outgoing.set(key(segment.a), indices);
  });
  const used = new Set<number>();
  const rings: Point[][] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used.has(start)) continue;
    const ring: Point[] = [];
    let index = start;
    for (;;) {
      if (used.has(index)) throw new InteriorError("E_FLOOR_TOO_SMALL", "room ownership boundary does not close");
      used.add(index);
      const segment = segments[index]!;
      ring.push(segment.a);
      if (key(segment.b) === key(segments[start]!.a)) break;
      const candidates = (outgoing.get(key(segment.b)) ?? []).filter(next => !used.has(next));
      if (!candidates.length) throw new InteriorError("E_FLOOR_TOO_SMALL", "room ownership has an open boundary");
      const incoming = vector(segment.a, segment.b);
      candidates.sort((a, b) => turn(incoming, vector(segments[a]!.a, segments[a]!.b))
        - turn(incoming, vector(segments[b]!.a, segments[b]!.b)) || a - b);
      index = candidates[0]!;
    }
    const simple = simplify(ring);
    if (simple.length >= 3 && Math.abs(polygonArea(simple)) > EPS) rings.push(simple);
  }
  const rooms = rings.filter(ring => polygonArea(ring) > 0).map(polygon => {
    const bounds = polygonBounds(polygon);
    return { polygon, rect: { u: bounds.x, v: bounds.z, lu: bounds.w, lv: bounds.d }, holes: [] as Point[][] };
  });
  for (const hole of rings.filter(ring => polygonArea(ring) < 0)) {
    const owner = rooms.find(room => pointInPolygon(hole[0]!, room.polygon));
    if (!owner) throw new InteriorError("E_FLOOR_TOO_SMALL", "room exclusion has no containing boundary");
    owner.holes.push(hole);
  }
  return rooms.sort((a, b) => a.rect.u - b.rect.u || a.rect.v - b.rect.v);
}

function turn(incoming: Point, outgoing: Point): number {
  return (Math.atan2(cross(incoming, outgoing), incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) + Math.PI * 2)
    % (Math.PI * 2);
}

function simplify(ring: Point[]): Point[] {
  return ring.filter((point, index) => {
    const before = vector(ring[(index + ring.length - 1) % ring.length]!, point);
    const after = vector(point, ring[(index + 1) % ring.length]!);
    return Math.abs(cross(before, after)) > EPS * (Math.hypot(...before) + Math.hypot(...after));
  });
}
