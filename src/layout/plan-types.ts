import type { Rect } from "../core/geom.js";
import type { Point } from "../core/geom.js";
import type { RoomKind, FurnitureKind } from "../core/types.js";
import type { UvRect } from "./uv.js";

/** Working representation while planning one floor, all in uv space. */

export type EdgeName = "v0" | "v1" | "u0" | "u1";

export interface PlanDoor {
  id: string;
  to: string; // room id, "outside", or a core element id
  leaves: 1 | 2 | 3 | 4;
  width: number;
  /** which edge of the owning room's rect the door sits on, and the u or v coordinate along it */
  edge: EdgeName;
  at: number;
}

export interface PlanRoom {
  id: string;
  kind: RoomKind;
  rect: UvRect;
  unit?: string;
  doors: PlanDoor[];
}

export interface PlanFurniture {
  id: string;
  kind: FurnitureKind;
  room: string;
  /** uv center */
  at: Point;
  /** rotation in uv space, degrees; converted with the axis at export */
  rotationDeg: 0 | 90 | 180 | 270;
  /** [along-u, along-v, height] at rotation 0 */
  size: [number, number, number];
}

export interface FloorFrame {
  /** usable u range of the corridor band */
  corridorU: [number, number];
  /** corridor band rect (u range excludes an inline stair B shaft) */
  corridor: UvRect;
  /** stair B shaft in uv, when the building has one */
  stairB?: UvRect;
  /** south strip: from the south facade to the corridor */
  south: UvRect;
  /** north strip segments flanking the core block */
  northSegments: UvRect[];
  /** core block (stair A, elevators, riser), full north depth */
  coreBlock: UvRect;
}

export interface PlannedRooms {
  rooms: PlanRoom[];
  furniture: PlanFurniture[];
}

export interface CoreWorldRects {
  elevators: { id: string; rect: Rect; doorEdge: 0 | 1 | 2 | 3 }[];
  stairs: { id: string; rect: Rect; entry: Point }[];
  shafts: Rect[];
}
