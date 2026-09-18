import type { Point } from "../core/geom.js";
import { insetPolygon } from "../core/geom.js";
import type { Facade } from "../core/types.js";
import { WALL_BACKING_DEPTH } from "./constants.js";

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

export function floorBounds(uvOutline: Point[], facade: Facade | undefined): FloorBounds {
  const depth = facadeDepth(facade);
  return { outline: uvOutline, inner: insetPolygon(uvOutline, depth), facadeDepth: depth };
}
