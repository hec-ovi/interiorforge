import { InteriorError } from '../../core/errors.js';
import type { FloorAssignment, InteriorRequest } from '../../core/types.js';

export interface DuplexPair { lower: number; upper: number }

/** A private paired program shares public storeys; it does not remove either
 * floor from the public core. Both constituent floors receive ordinary bands. */
export function duplexAssignments(request: InteriorRequest, assignments: FloorAssignment[]): {
  assignments: FloorAssignment[]; pairs: DuplexPair[];
} {
  const pairs: DuplexPair[] = [];
  const result: FloorAssignment[] = [];
  for (const assignment of assignments) {
    if ((assignment.spans ?? 1) === 1) { result.push(assignment); continue; }
    if (request.building.interiorStyle !== 'apartment-1702' || assignment.kind !== 'apartment') {
      throw new InteriorError('E_ASSIGNMENT_INVALID', 'two-storey placement assignments require the apartment-1702 private duplex program');
    }
    const lower = request.blueprint.floors.find(floor => floor.index === assignment.floor);
    const upper = request.blueprint.floors.find(floor => floor.index === assignment.floor + 1);
    if (!lower || !upper || lower.index <= Math.min(...request.blueprint.floors.map(floor => floor.index))) {
      throw new InteriorError('E_ASSIGNMENT_INVALID', 'private duplex pairs require two consecutive occupied floors above the special ground floor');
    }
    pairs.push({ lower: lower.index, upper: upper.index });
    result.push({ floor: lower.index, kind: assignment.kind }, { floor: upper.index, kind: assignment.kind });
  }
  return { assignments: result.sort((a, b) => a.floor - b.floor), pairs };
}
