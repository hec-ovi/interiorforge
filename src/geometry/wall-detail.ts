import { BAND_PROUD } from "../layout/shell.js";

/** Walls are never bare planes: a trim band at the floor, a dado in the accent tone, the
 *  field above it and a band under the ceiling. The feature wall of a room takes the accent
 *  tone as its field, corner to corner (see walls.ts). */

export const BASEBOARD = 0.12;
export const DADO_TOP = 1.05;
export const TOP_TRIM = 0.09;
const PROUD = BAND_PROUD;
/** Small hidden overlap between neighbouring solid bands. It closes the thickness step
 *  without putting two caps on the same plane. */
export const BAND_SEAL = 0.002;

export interface WallBands {
  /** absolute y of the floor and of the ceiling plane */
  y0: number;
  ceilingY: number;
  field: string;
  accent: string;
  trim: string;
  /** door casings: jambs and head around every doorway */
  casing: string;
  /** window casings on the room side of every window */
  frame: string;
}

/** Which ends of a wall slice are seen: the underside of a lintel over a door, the top of a
 *  spandrel under a window. Ends that meet a slab are never capped. */
export interface Exposed {
  bottom?: boolean;
  top?: boolean;
}

/** One layered stretch of wall: the bands, each clipped to the vertical slice asked for.
 *  `emit` draws one band, given its material, thickness, y range and whether it needs caps. */
export function layerBands(
  bands: WallBands, sy0: number, sy1: number,
  emit: (material: string, thickness: number, y0: number, y1: number, caps: "both" | "none") => void,
  exposed: Exposed = {},
): void {
  const slice = (material: string, thickness: number, a: number, b: number): void => {
    const lo = Math.max(sy0, a - BAND_SEAL);
    const hi = Math.min(sy1, b + BAND_SEAL);
    if (hi - lo <= 1e-3) return;
    // Every band is a closed box. Neighbouring sections overlap inside the wall by 2 mm,
    // so their caps never coincide and a proud baseboard or trim leaves no open ledge.
    emit(material, thickness, lo, hi, "both");
  };
  const base = bands.y0;
  const trimStart = Math.max(base + DADO_TOP, bands.ceilingY - TOP_TRIM);
  slice(bands.trim, 2 * PROUD, base, base + BASEBOARD);
  slice(bands.accent, PROUD, base + BASEBOARD, base + DADO_TOP);
  slice(bands.field, 0, base + DADO_TOP, trimStart);
  slice(bands.trim, PROUD, trimStart, bands.ceilingY);
  slice(bands.field, 0, bands.ceilingY, Number.POSITIVE_INFINITY);
}

/** The band a wall wears at height `y`: what a cap or a reveal face there continues. */
export function bandMaterial(bands: WallBands, y: number): string {
  const trimStart = Math.max(bands.y0 + DADO_TOP, bands.ceilingY - TOP_TRIM);
  if (y < bands.y0 + BASEBOARD) return bands.trim;
  if (y < bands.y0 + DADO_TOP) return bands.accent;
  if (y >= trimStart && y < bands.ceilingY) return bands.trim;
  return bands.field;
}
