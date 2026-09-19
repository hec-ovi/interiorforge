import type { Point } from "../core/geom.js";
import { clipPolygonToRect, insetPolygon, polygonBounds } from "../core/geom.js";
import type { BlueprintFloor, Facade } from "../core/types.js";
import { WALL_BACKING_DEPTH } from "./constants.js";
import type { Frame } from "./uv.js";
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
