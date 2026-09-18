import { makeFixture, type FixtureOptions } from './fixture.js';
import type { BlueprintFloor, InteriorRequest } from '../core/types.js';
/** Standalone sample with one repeated middle band and an exact rectangular grid. */
export function makePlacementFixture(options: FixtureOptions = {}): InteriorRequest {
    const width = options.width ?? 40, depth = options.depth ?? 40, count = options.floors ?? 6;
    if (!Number.isInteger(count) || count < 3)
        throw new RangeError('at least three floors required');
    const original = makeFixture({ ...options, floors: 3, basements: 0, outline: options.outline ?? [[0, 0], [width, 0], [width, depth], [0, depth]] }).request;
    const templates = original.blueprint.floors, assignments = original.assignments!, floors: BlueprintFloor[] = [];
    let elevation = 0;
    original.assignments = [];
    for (let index = 0; index < count; index++) {
        const source = index === 0 ? 0 : index === count - 1 ? 2 : 1;
        const floor = structuredClone(templates[source]!);
        floor.index = index;
        floor.elevation = elevation;
        floor.openings.forEach((o, i) => { o.id = `floor:${index}/opening:${i}`; });
        floors.push(floor);
        elevation += floor.height;
        original.assignments.push({ floor: index, kind: assignments[source]!.kind });
    }
    original.blueprint.floors = floors;
    return original;
}
