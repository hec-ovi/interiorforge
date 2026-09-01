import type { Document } from "@gltf-transform/core";
import { readGlbFile, writeGlb } from "./glb/io.js";
import { resolveAssignments, validateRequest, validateShell } from "./blueprint/validate.js";
import { buildInterior } from "./geometry/index.js";
import { planBuilding } from "./layout/index.js";
import { textureDocument, type TextureOptions } from "./materials/index.js";
import { buildNpcSupport } from "./npc/index.js";
import type { FloorInterior, InteriorResult } from "./core/types.js";

export { makeFixture, type FixtureOptions } from "./blueprint/fixture.js";
export { findPath, type PathLeg, type PathQuery } from "./npc/index.js";
export { coreFeasibility, type CoreFeasibility } from "./layout/index.js";
export { materialsDir, type TextureMode, type TextureOptions, type TextureReport } from "./materials/index.js";
export { InteriorError } from "./core/errors.js";
export type * from "./core/types.js";

export interface GenerateOptions {
  /** parsed shell GLB; skips reading `request.shellGlb` from disk */
  shellDoc?: Document;
  /** how the GLB carries its maps; external by default (a finished, textured interior) */
  textures?: TextureOptions;
}

/** The box surface: validates, plans, builds NPC support and geometry, resolves the material
 *  keys through the materials database and returns the finished result. Same request, same
 *  database, same options, identical output. */
export async function generateInterior(
  request: unknown, options: GenerateOptions = {},
): Promise<InteriorResult> {
  const validated = validateRequest(request);
  const shellDoc = options.shellDoc ?? (await readGlbFile(validated.shellGlb));
  validateShell(validated, shellDoc);

  const assignments = resolveAssignments(validated);
  const plan = planBuilding(validated, assignments);
  const npc = buildNpcSupport(plan, validated);
  const { doc, stepsByFloor } = buildInterior(plan, validated, shellDoc);
  const textures = textureDocument(doc, validated.materialTheme, options.textures);

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

  return { glb: await writeGlb(doc), floors, npc, textures };
}
