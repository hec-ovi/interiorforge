import { InteriorError } from "../core/errors.js";
import type { Opening } from "../core/types.js";

const TOLERANCE = 1e-6;

/** A window's clear field and covering housing must fit their authored wall cut. */
export function validateWindowGlazing(opening: Opening, wallDepth: number | undefined, floor: number): void {
  const field = opening.glazing;
  if (opening.kind !== "window" || !field) return;
  if (
    field.offset < opening.offset - TOLERANCE ||
    field.offset + field.width > opening.offset + opening.width + TOLERANCE ||
    field.sill < opening.sill - TOLERANCE ||
    field.sill + field.height > opening.sill + opening.height + TOLERANCE
  ) {
    throw new InteriorError("E_BLUEPRINT_INVALID", `window ${opening.id} glazing exceeds its wall opening`, floor);
  }
  if (field.glassDepth > field.housingBackDepth + TOLERANCE) {
    throw new InteriorError("E_BLUEPRINT_INVALID", `window ${opening.id} glazing lies behind its housing`, floor);
  }
  if (wallDepth !== undefined && field.housingBackDepth > wallDepth + TOLERANCE) {
    throw new InteriorError("E_BLUEPRINT_INVALID", `window ${opening.id} housing exceeds facade wall depth`, floor);
  }
}
