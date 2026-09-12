import type { Rng } from "../../core/rng.js";
import type { FurnitureKind } from "../../core/types.js";
import type { PlanFurniture } from "../plan-types.js";
import type { UvRect } from "../uv.js";

export type LuxuryGroup = "salon" | "seating" | "kitchen" | "suite";
export type QuarterTurn = 0 | 90 | 180 | 270;

export interface GroupPiece {
  kind: FurnitureKind;
  at: [number, number];
  size: [number, number, number];
  rotationDeg: QuarterTurn;
}

export interface GroupRecipe {
  span: [number, number];
  pieces: GroupPiece[];
}

export interface GroupFit {
  kind: LuxuryGroup;
  bounds: UvRect;
  rng: Rng;
  accepts: (reservation: UvRect) => boolean;
}

export interface FittedGroup {
  reservation: UvRect;
  pieces: Pick<PlanFurniture, "kind" | "at" | "size" | "rotationDeg">[];
}
