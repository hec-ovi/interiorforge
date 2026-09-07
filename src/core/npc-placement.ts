import type { Point } from "./geom.js";

/** A reserved standing body and a reachable point from which another character can approach. */
export interface NpcPlacement {
  id: string;
  purpose: "vendor" | "staff" | "story";
  floor: number;
  room: string;
  position: Point;
  facingDeg: number;
  radius: number;
  approach: Point;
  anchor?: string;
  role?: string;
}
