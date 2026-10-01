import type { Rect } from "../core/geom.js";
import type { Point } from "../core/geom.js";
import type { RoomKind, FurnitureKind, StyleId } from "../core/types.js";
import type { UvRect } from "./uv.js";

/** Working representation while planning one floor, all in uv space. */

export type EdgeName = "v0" | "v1" | "u0" | "u1";

interface PlanConnection {
  id: string;
  width: number;
  /** Outward wall direction and the u or v coordinate along it. */
  edge: EdgeName;
  at: number;
  /** Exact UV mounting point when the wall is an inset edge of a polygon room. */
  position?: Point;
}

export type PlanDoor = PlanConnection & ({
  to: string; // room id, "outside", or a core element id
  leaves: 1 | 2 | 3 | 4;
  /** inward moving-leaf reservation on an exterior door */
  clearDepth?: number;
  openFront?: never;
} | {
  to: "outside";
  /** permanently open facade portal; no leaf or swing exists */
  openFront: {
    clearHeight: number;
    clearDepth: number;
    /** exact portal center and wall direction in layout-frame coordinates */
    position: Point;
    angleDeg: number;
    /** unit vector from the facade into the room, in layout-frame coordinates */
    inward: Point;
  };
  leaves?: never;
});

export interface PlanRoom {
  /** Composed floor: use only its authored furniture and preserve its exact poses. */
  authoredOnly?: boolean;
  id: string;
  kind: RoomKind;
  rect: UvRect;
  /** Authoritative CCW simple UV footprint, already fitted inside the slab plate.
   *  The rectangle remains its bounds. Absence retains the outline-clipped rectangle. */
  polygon?: Point[];
  /** Clockwise disjoint interior rings, strictly inside the outer footprint. */
  holes?: Point[][];
  unit?: string;
  /** Planning-only clear arrival/route floor. Never serialized as furniture or a wall. */
  furnishingKeepouts?: UvRect[];
  /** Producer-only living group chosen before circulation. Furnishing commits
   * these exact pieces after the physical routes have been planned around them. */
  plannedLiving?: {
    profile: string;
    recipe: string;
    reservation: UvRect;
    pieces: Pick<PlanFurniture, 'kind' | 'at' | 'size' | 'rotationDeg' | 'elevation'>[];
    paths: Point[][];
    routeClearance: number;
  };
  doors: PlanDoor[];
  /** reference style id of the room (`e1`…`r1`), stamped by templates and kind policy */
  style?: StyleId;
  /** `<template key>/<template room id>` for rooms an authored SpaceTemplate produced */
  template?: string;
  /** reference meaning inside the closed room kind: foyer, dressing, bar, study, … */
  role?: string;
  /** m below the floor ceiling, from the template's per-room reference height */
  ceilingDrop?: number;
  /** raised or sunken zones inside the room, uv polygons (consumed by the levels pass) */
  levels?: { polygon: Point[]; delta: number; edge: "step" | "guard" | "open";
    stair?: { at: Point; axis: "u" | "v"; width: number } }[];
  /** Planning-only pieces the template authored at exact places; furnishing commits them
   *  before the family dispatch. */
  authored?: AuthoredPiece[];
  /** Placement-only: lowered ceiling boxes under a pit of the storey above, uv, each `drop`
   *  metres below the room's own ceiling (`placements/plenum.ts`). */
  bulkheads?: { rect: UvRect; drop: number }[];
}

/** One authored piece of a templated room, in uv. */
export interface AuthoredPiece {
  id: string;
  kind: FurnitureKind;
  /** 'asm-<sid>-<name>' built-in assembly or 'fit-<module>' exact module */
  fit?: string;
  at: Point;
  rotationDeg: 0 | 90 | 180 | 270;
  /** [along-u, along-v, height] at rotation 0 */
  size: [number, number, number];
  elevation?: number;
  required: boolean;
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
  /** base height above the floor; wall pieces hang, everything else stands at 0 */
  elevation?: number;
  /** authored assembly or exact module ('asm-…' / 'fit-…') */
  fit?: string;
}

export interface FloorFrame {
  /** usable u range of the corridor band */
  corridorU: [number, number];
  /** corridor band rect (u range excludes an inline stair B shaft) */
  corridor: UvRect;
  /** usable landing between an inline stair B shaft and the facade, when that tail exists */
  corridorTail?: UvRect;
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
