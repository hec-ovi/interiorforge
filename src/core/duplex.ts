import type { Point } from './geom.js';

/** One dwelling's contribution to a normal shared-core floor. Unlike the older
 * whole-floor mezzanine flag, this never removes the building's public stops. */
export interface FloorDuplex {
  id: string;
  unit: string;
  lowerFloor: number;
  upperFloor: number;
  level: 'lower' | 'upper';
  /** Private section axes, independent of the building's core orientation. */
  frame: { origin: Point; angleDeg: number };
  width: number;
  depth: number;
  pitch: number;
  /** Exact seam from the lower finished ceiling to the upper walking datum. */
  lowerCeilingGap?: number;
  /** World XZ ownership and actual void boundaries; these are not texture masks. */
  footprint: Point[];
  loungeVoids: Point[][];
  stairOpening: Point[];
  lowerEntry: Point;
  upperEntry: Point;
  stairOpeningDepth: number;
  /** The private stair stands against the section's low or high side wall (a composed loft's);
   *  absent, in the middle of the section. */
  stairWall?: 'low' | 'high';
  area: { lower: number; upper: number; loungeVoid: number; stairOpening: number };
}
