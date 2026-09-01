import type { Point } from "../core/geom.js";
import { clipPolygonToConvex, distance, insetPolygon, mitrePoints } from "../core/geom.js";
import type { BlueprintFloor, RoomKind } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { SHELL_WALL } from "../layout/shell.js";
import type { MaterialKeys } from "./materials.js";
import type { OpeningHole } from "./shell-fit.js";
import { openingHole } from "./shell-fit.js";
import type { Exposed, WallBands } from "./wall-detail.js";
import { bandMaterial, layerBands } from "./wall-detail.js";

/** Facade lining: the room side of the shell wall. It is the ring between the plate at the
 *  wall depth and the plate at the wall depth plus the lining (per band), so it follows the
 *  true inset of any outline, tiny steps and sharp corners included. Each outline edge owns
 *  the sector between the corner bisectors; openings cut the sector at their jambs, and the
 *  hole is lined back to the skin clearance so no cavity shows. */

/** how far the sectors reach into the room: past every plate corner they must cut */
const SECTOR_DEPTH = 3;
const EPS = 1e-7;

export function buildFacadeLining(
  mb: MeshBuilder, keys: MaterialKeys, bpFloor: BlueprintFloor, wallDepth: number, wallTop: number,
  ceilingY: number, program: RoomKind,
): void {
  const bands: WallBands = {
    y0: bpFloor.elevation, ceilingY,
    field: keys.wall(program), accent: keys.accent(program), trim: keys.trim(),
  };
  const outline = bpFloor.outline;
  const y0 = bpFloor.elevation;
  const outerPlate = insetPolygon(outline, wallDepth);
  const innerPlates = new Map<number, Point[]>();
  const innerPlate = (proud: number): Point[] => {
    let plate = innerPlates.get(proud);
    if (!plate) {
      plate = insetPolygon(outline, wallDepth + SHELL_WALL.lining + proud);
      innerPlates.set(proud, plate);
    }
    return plate;
  };
  const bisectors = mitrePoints(outline, 1);

  for (let e = 0; e < outline.length; e++) {
    const p0 = outline[e]!;
    const p1 = outline[(e + 1) % outline.length]!;
    const len = distance(p0, p1);
    const dir: Point = [(p1[0] - p0[0]) / len, (p1[1] - p0[1]) / len];
    const inward: Point = [-dir[1], dir[0]];
    const at = (t: number, depth: number): Point => [
      p0[0] + dir[0] * t + inward[0] * depth, p0[1] + dir[1] * t + inward[1] * depth,
    ];
    const sector = (t0: number, t1: number): Point[] => {
      const rect: Point[] = [at(t0, wallDepth - 0.01), at(t1, wallDepth - 0.01), at(t1, SECTOR_DEPTH), at(t0, SECTOR_DEPTH)];
      const inside = at(len / 2, wallDepth);
      const cut = (poly: Point[], v: Point, m: Point): Point[] => poly.length ? clipPolygonToConvex(poly, halfPlane(v, m, inside)) : poly;
      return cut(cut(rect, p0, bisectors[e]!), p1, bisectors[(e + 1) % outline.length]!);
    };

    const piece = (t0: number, t1: number, py0: number, py1: number, exposed: Exposed = {}) => {
      if (t1 - t0 < 1e-3 || py1 - py0 < 1e-3) return;
      const sec = sector(t0 === 0 ? -SECTOR_DEPTH : t0, t1 === len ? len + SECTOR_DEPTH : t1);
      if (sec.length < 3) return;
      const outer = boundaryChain(outerPlate, sec);
      if (outer.length < 2) return;
      layerBands(bands, py0, Math.min(py1, wallTop), (material, proud, by0, by1, caps) => {
        const inner = boundaryChain(innerPlate(proud), sec);
        const polygon = inner.length >= 2 ? [...outer, ...inner.reverse()] : clipPolygonToConvex(outerPlate, sec);
        if (polygon.length >= 3) mb.addPrism(material, polygon, by0, by1, "world", caps);
      }, exposed);
    };

    const openings = bpFloor.openings
      .filter((o) => o.edge === e)
      .sort((o1, o2) => o1.offset - o2.offset);
    let cursor = 0;
    for (const o of openings) {
      const hole = openingHole(o, bpFloor.height);
      piece(cursor, hole.t0, y0, wallTop);
      if (hole.y0 > 0) piece(hole.t0, hole.t1, y0, y0 + hole.y0, { top: true });
      if (hole.y1 < wallTop - y0) piece(hole.t0, hole.t1, y0 + hole.y1, wallTop, { bottom: true });
      emitReveal(mb, bands, at, hole, y0, wallDepth, hole.y1 < wallTop - y0);
      cursor = hole.t1;
    }
    piece(cursor, len, y0, wallTop);
  }
}

/** A large CCW triangle covering the side of the line through `v` and `m` that holds `keep`. */
function halfPlane(v: Point, m: Point, keep: Point): Point[] {
  const len = distance(v, m) || 1;
  const d: Point = [(m[0] - v[0]) / len, (m[1] - v[1]) / len];
  const left = d[0] * (keep[1] - v[1]) - d[1] * (keep[0] - v[0]) >= 0;
  const n: Point = left ? [-d[1], d[0]] : [d[1], -d[0]];
  const far = 1e4;
  const a: Point = [v[0] - d[0] * far, v[1] - d[1] * far];
  const b: Point = [v[0] + d[0] * far, v[1] + d[1] * far];
  const c: Point = [v[0] + n[0] * far, v[1] + n[1] * far];
  return left ? [a, b, c] : [b, a, c];
}

/** The plate's own boundary inside the sector: the longest run of the clipped polygon's
 *  edges that do not lie on the sector's boundary, as a polyline in the plate's CCW order. */
function boundaryChain(plate: Point[], sector: Point[]): Point[] {
  const clipped = clipPolygonToConvex(plate, sector);
  const n = clipped.length;
  if (n < 3) return [];
  const onSector = (a: Point, b: Point): boolean => {
    for (let i = 0; i < sector.length; i++) {
      const s0 = sector[i]!;
      const s1 = sector[(i + 1) % sector.length]!;
      if (lineDistance(a, s0, s1) < EPS && lineDistance(b, s0, s1) < EPS) return true;
    }
    return false;
  };
  const isPlate = clipped.map((p, i) => !onSector(p, clipped[(i + 1) % n]!));
  if (isPlate.every(Boolean)) return [...clipped, clipped[0]!];
  // runs start after a sector edge; keep the longest
  let best: Point[] = [];
  let bestLen = 0;
  for (let start = 0; start < n; start++) {
    if (isPlate[(start + n - 1) % n] || !isPlate[start]) continue;
    const run: Point[] = [clipped[start]!];
    let length = 0;
    for (let k = start; isPlate[k % n]; k++) {
      const next = clipped[(k + 1) % n]!;
      length += distance(run.at(-1)!, next);
      run.push(next);
    }
    if (length > bestLen) {
      bestLen = length;
      best = run;
    }
  }
  return best;
}

function lineDistance(p: Point, a: Point, b: Point): number {
  const len = distance(a, b) || 1;
  return Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len;
}

/** The four faces lining an opening between the shell's skin and the lining: jambs, sill (a
 *  threshold at floor level) and head, each in the band it continues. */
function emitReveal(
  mb: MeshBuilder, bands: WallBands, at: (t: number, depth: number) => Point,
  hole: OpeningHole, y0: number, wallDepth: number, hasHead: boolean,
): void {
  const near = SHELL_WALL.skinClear;
  const v = (p: Point, y: number): [number, number, number] => [p[0], y, p[1]];
  layerBands(bands, y0 + hole.y0, y0 + hole.y1, (material, _proud, by0, by1) => {
    const a = at(hole.t0, near), b = at(hole.t0, wallDepth);
    const c = at(hole.t1, wallDepth), d = at(hole.t1, near);
    mb.addQuad(material, [v(a, by0), v(a, by1), v(b, by1), v(b, by0)]);
    mb.addQuad(material, [v(c, by0), v(c, by1), v(d, by1), v(d, by0)]);
  });
  const sillMaterial = hole.y0 > 0 ? bandMaterial(bands, y0 + hole.y0) : bands.trim;
  const plan = [at(hole.t0, near), at(hole.t1, near), at(hole.t1, wallDepth), at(hole.t0, wallDepth)];
  mb.addHorizontalPolygon(sillMaterial, plan, y0 + hole.y0, "up");
  if (hasHead) mb.addHorizontalPolygon(bandMaterial(bands, y0 + hole.y1 - 1e-3), plan, y0 + hole.y1, "down");
}
