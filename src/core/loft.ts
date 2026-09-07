import type { Point } from "./geom.js";

/** One occupied partial upper floor and its private stair, all points in world XZ. */
export interface LoftPlan {
  id: string;
  lowerRoom: string;
  upperRoom: string;
  upperFloor: number;
  platform: Point[];
  elevation: number;
  thickness: number;
  supports: Point[];
  stair: {
    start: Point;
    direction: Point;
    width: number;
    run: number;
    risers: number;
    rise: number;
    tread: number;
    lowerEntry: Point;
    upperEntry: Point;
  };
}
