import type { Point } from "../core/geom.js";
import { boundaryDistance, clipPolygonToRect, distanceToSegment, insetPolygon, polygonArea, polygonBounds } from "../core/geom.js";
import type { BlueprintFloor, Facade } from "../core/types.js";
import { WALL_BACKING_DEPTH } from "./constants.js";
import type { Frame, UvRect } from "./uv.js";
import { toUvPolygon } from "./uv.js";

/** The shell's wall, as the interior keeps clear of it. The skin sits on the floor outline
 *  and the reveals, frames and glazing units behind it reach `depth` inward. The blueprint's
 *  `facade.wallDepth` publishes that depth; omission uses the kit backing default.
 *  The facade lining starts behind that depth. */
export const SHELL_WALL = {
  /** reveal returns stop this far behind the skin, so nothing reaches the wall plane */
  skinClear: 0.02,
  /** the lining's hole sits this far inside the shell's opening: its reveal faces never
   *  share a plane with the shell's own reveal */
  recess: 0.01,
  /** facade lining slab */
  lining: 0.08,
};

/** How far a wall band stands off the wall face, each side; the baseboard stands twice. */
export const BAND_PROUD = 0.02;

export function shellWallDepth(facade: Facade | undefined): number {
  return facade?.wallDepth ?? WALL_BACKING_DEPTH;
}

/** Inner face of the facade lining, bands included: the room starts here. */
export function facadeDepth(facade: Facade | undefined): number {
  return shellWallDepth(facade) + SHELL_WALL.lining + 2 * BAND_PROUD;
}

/** A floor's plate as the layout sees it: the outline, and the same polygon behind the
 *  facade lining, where furniture and fixtures may stand. */
export interface FloorBounds {
  outline: Point[];
  inner: Point[];
  facadeDepth: number;
}

export function floorBounds(floor: BlueprintFloor, frame: Frame, facade: Facade | undefined): FloorBounds {
  const depth = facadeDepth(facade);
  return { outline: toUvPolygon(floor.outline, frame), inner: constructionPlate(floor, frame, depth), facadeDepth: depth };
}

/** Where Interior builds, in uv space: the floor's published room envelope kept behind `depth`
 *  of shell, or the outline inset by it when Exterior publishes no envelope. The band between
 *  the plate and the outline is Exterior's slab: open floor, walkable, no interior surface. */
export function constructionPlate(floor: BlueprintFloor, frame: Frame, depth: number): Point[] {
  const inset = insetPolygon(toUvPolygon(floor.outline, frame), depth);
  if (!floor.roomEnvelope) return inset;
  const clipped = clipPolygonToRect(inset, polygonBounds(toUvPolygon(floor.roomEnvelope.corners, frame)));
  return clipped.length >= 3 ? clipped : inset;
}

/** The longest run a step of the shell face takes along either construction axis where the
 *  facade is curved or chamfered. */
const FACE_STEP = 0.2;

/** A facade the shell closes itself keeps this seam at its inner face: a partition's end
 *  piece runs 2 cm past its line and still stops 5 mm off the shell. */
export const SHELL_SEAM = 0.025;

/** The shell's inner face as the rooms reach it, in uv: the outline inset by `depth`, with
 *  every edge on the construction axes. An oblique facade edge (a curve or a chamfer) is
 *  stepped just inside the face: each step starts and ends on it, and so does every line in
 *  `breaks` (u of the vertical partitions, v of the horizontal ones), so a partition reaching
 *  a curved facade ends on the face, not short of it. */
export function shellFace(floor: BlueprintFloor, frame: Frame, depth: number,
  breaks: { u: readonly number[]; v: readonly number[] } = { u: [], v: [] }): Point[] {
  const face = insetPolygon(toUvPolygon(floor.outline, frame), depth);
  if (face.length < 3) return [];
  const inside = polygonArea(face) > 0 ? 1 : -1;
  const out: Point[] = [];
  face.forEach((a, i) => {
    const b = face[(i + 1) % face.length]!;
    const du = b[0] - a[0], dv = b[1] - a[1];
    out.push(a);
    if (Math.abs(du) < 1e-7 || Math.abs(dv) < 1e-7) return;
    const cuts = new Set<number>();
    const n = Math.ceil(Math.max(Math.abs(du), Math.abs(dv)) / FACE_STEP - 1e-9);
    for (let k = 1; k < n; k++) cuts.add(k / n);
    for (const u of breaks.u) cuts.add((u - a[0]) / du);
    for (const v of breaks.v) cuts.add((v - a[1]) / dv);
    const points = [0, ...[...cuts].filter(t => t > 1e-6 && t < 1 - 1e-6).sort((x, y) => x - y), 1]
      .map((t): Point => t === 0 ? a : t === 1 ? b : [a[0] + du * t, a[1] + dv * t]);
    for (let k = 0; k + 1 < points.length; k++) {
      const p = points[k]!, q = points[k + 1]!;
      if (k > 0) out.push(p);
      // The corner on the room side of the chord: the step never reaches into the wall.
      out.push(du * dv * inside > 0 ? [p[0], q[1]] : [q[0], p[1]]);
    }
  });
  return simplifyRing(out);
}

/** The steps a room reaches a curved or chamfered face by: `edge` tells whether a segment is
 *  one (it runs along the face deeper than the face's own depth, so it stands off an oblique
 *  facade edge), `strip` whether a rectangle is one of the thin fills between a room and such
 *  a step, which take a plain floor and ceiling rather than a full surface system. */
export function faceSteps(face: readonly Point[], outline: readonly Point[]): {
  edge: (a: Point, b: Point) => boolean; strip: (rect: UvRect) => boolean;
} {
  const depth = Math.min(...face.map(point => boundaryDistance(point, outline)));
  const onFace = (point: Point) => face.some((a, i) => distanceToSegment(point, a, face[(i + 1) % face.length]!) < 1e-6);
  const edge = (a: Point, b: Point) => {
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return onFace(mid) && boundaryDistance(mid, outline) > depth + 1e-3;
  };
  const strip = (rect: UvRect) => {
    if (Math.min(rect.lu, rect.lv) > FACE_STEP + 1e-6) return false;
    const [u0, v0, u1, v1] = [rect.u, rect.v, rect.u + rect.lu, rect.v + rect.lv];
    return edge([u0, v0], [u1, v0]) || edge([u1, v0], [u1, v1]) || edge([u0, v1], [u1, v1]) || edge([u0, v0], [u0, v1]);
  };
  return { edge, strip };
}

/** Drops repeated points and points in the middle of a straight run. */
function simplifyRing(ring: Point[]): Point[] {
  let points = ring.filter((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    return Math.abs(p[0] - q[0]) > 1e-9 || Math.abs(p[1] - q[1]) > 1e-9;
  });
  for (let changed = true; changed && points.length > 3;) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length]!, p = points[i]!, b = points[(i + 1) % points.length]!;
      const cross = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
      if (Math.abs(cross) < 1e-12) { points = points.filter((_, k) => k !== i); changed = true; break; }
    }
  }
  return points;
}
