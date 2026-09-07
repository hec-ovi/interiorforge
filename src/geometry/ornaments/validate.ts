import type { PlanFurniture } from "../../layout/plan-types.js";

export function validateEnvelope(item: PlanFurniture): void {
  const minimum = item.kind === "sleeping_pod" ? [2.5, 1.5, 2] : [1, .5, 1.5];
  if (item.size.length !== 3 || item.size.some((value, axis) => !Number.isFinite(value) || value < minimum[axis]!)) {
    throw new RangeError(`${item.kind} requires finite width, depth and height of at least ${minimum.join(" × ")} metres`);
  }
}
