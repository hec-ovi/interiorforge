import type { Rng } from '../core/rng.js';
import type { PlanRoom } from './plan-types.js';
import type { UvRect } from './uv.js';
import { fitCompactFixtures, type CompactFixture, type CompactFixtureGroup } from './compact-fixtures.js';
import { overlaps } from './bathroom-recipe.js';

type KitchenKind = 'kitchen_block' | 'fridge';
type Size = readonly [number, number, number];
export const KITCHEN_OPERATION_FRONT = { kitchen_block: .9, fridge: .8 } as const;

export function kitchenOperation(footprint: UvRect, kind: KitchenKind, rotation: CompactFixture['rotationDeg']): UvRect {
  const operation = { ...footprint }, front = KITCHEN_OPERATION_FRONT[kind];
  if (rotation === 0) operation.lv += front;
  if (rotation === 180) { operation.v -= front; operation.lv += front; }
  if (rotation === 90) operation.lu += front;
  if (rotation === 270) { operation.u -= front; operation.lu += front; }
  return operation;
}

/** Reconsider the full-size appliances together. The common solver retains real
 * doorway/body paths; this caller additionally preserves the generous fronts. */
export function fitKitchenFixtures(
  room: PlanRoom, sizes: Record<KitchenKind, Size>, rng: Rng,
  fits: (footprint: UvRect) => boolean, covers: (operation: UvRect) => boolean,
  obstacles: readonly UvRect[] = [],
): CompactFixtureGroup | null {
  // Only the two requested kinds are read by fitCompactFixtures. Other sizes are
  // supplied to satisfy its shared fixture vocabulary, never used as candidates.
  return fitCompactFixtures(room, ['kitchen_block', 'fridge'], {
    ...sizes, sink: [0, 0, 0], toilet: [0, 0, 0], shower: [0, 0, 0],
  }, rng, fits, covers, obstacles, {
    front: KITCHEN_OPERATION_FRONT,
    accepts: fixtures => fixtures.every((fixture, index) =>
      obstacles.every(obstacle => !overlaps(fixture.operation, obstacle))
      && fixtures.slice(index + 1).every(other => !overlaps(fixture.footprint, other.footprint, .15)
        && !overlaps(fixture.footprint, other.operation) && !overlaps(fixture.operation, other.footprint))),
  });
}
