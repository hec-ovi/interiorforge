import type { Document } from "@gltf-transform/core";
import { readGlbFile, writeGlb } from "./glb/io.js";
import { resolveAssignments, validateRequest, validateShell } from "./blueprint/validate.js";
import { buildInterior } from "./geometry/index.js";
import { planBuilding } from "./layout/index.js";
import { buildNpcSupport } from "./npc/index.js";
import type { FloorInterior, InteriorResult } from "./core/types.js";

export { makeFixture, type FixtureOptions } from "./blueprint/fixture.js";
export { findPath, type PathLeg, type PathQuery } from "./npc/index.js";
export { InteriorError } from "./core/errors.js";
export type * from "./core/types.js";

/** The box surface: validates, plans, builds NPC support and geometry, returns the result.
 *  Same request, identical output. Pass `shellDoc` to skip reading `request.shellGlb` from disk. */
export async function generateInterior(
  request: unknown, options: { shellDoc?: Document } = {},
): Promise<InteriorResult> {
  const validated = validateRequest(request);
  const shellDoc = options.shellDoc ?? (await readGlbFile(validated.shellGlb));
  validateShell(validated, shellDoc);

  const assignments = resolveAssignments(validated);
  const plan = planBuilding(validated, assignments);
  const npc = buildNpcSupport(plan, validated);
  const { doc, stepsByFloor } = buildInterior(plan, validated, shellDoc);

  const floors: FloorInterior[] = plan.floors.map((floor) => ({
    ...floor,
    core: {
      ...floor.core,
      stairs: floor.core.stairs.map((stair) => {
        const steps = stepsByFloor.get(floor.floor)?.[stair.id];
        return steps ? { ...stair, steps } : stair;
      }),
    },
  }));

  return { glb: await writeGlb(doc), floors, npc };
}
