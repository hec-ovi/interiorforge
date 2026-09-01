import type { Point } from "../core/geom.js";
import { insetPolygon } from "../core/geom.js";

/** The shell's wall, as the interior keeps clear of it. The skin sits on the floor outline
 *  and the reveals, frames and glazing units behind it reach `depth` inward, by facade
 *  style (measured on exterior output). The facade lining starts behind that depth. */
export const SHELL_WALL = {
  depth: { "curtain-wall": 0.15, glass: 0.15, panel: 0.3, megablock: 0.5 } as Record<string, number>,
  defaultDepth: 0.3,
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

export function shellWallDepth(style: string | undefined): number {
  return (style === undefined ? undefined : SHELL_WALL.depth[style]) ?? SHELL_WALL.defaultDepth;
}

/** Inner face of the facade lining, bands included: the room starts here. */
export function facadeDepth(style: string | undefined): number {
  return shellWallDepth(style) + SHELL_WALL.lining + 2 * BAND_PROUD;
}

/** A floor's plate as the layout sees it: the outline, and the same polygon behind the
 *  facade lining, where furniture and fixtures may stand. */
export interface FloorBounds {
  outline: Point[];
  inner: Point[];
  facadeDepth: number;
}

export function floorBounds(uvOutline: Point[], style: string | undefined): FloorBounds {
  const depth = facadeDepth(style);
  return { outline: uvOutline, inner: insetPolygon(uvOutline, depth), facadeDepth: depth };
}
