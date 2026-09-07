import type { Document } from "@gltf-transform/core";
import { InteriorError } from "./core/errors.js";
import { readGlbFile, writeGlb } from "./glb/io.js";
import { resolveAssignments, validateRequest, validateShell } from "./blueprint/validate.js";
import { buildInterior, buildInteriorBands } from "./geometry/index.js";
import { planBuilding } from "./layout/index.js";
import { textureDocument, type TextureOptions } from "./materials/index.js";
import { buildNpcSupport } from "./npc/index.js";
import type { FloorInterior, FloorInteriorResult, InteriorRequest, InteriorResult, Rect3 } from "./core/types.js";
import { writeFloorGlbs } from "./floor-output.js";
import { appendFurnitureAssets, prepareFurnitureAssets, type AssetReader } from "./assets/index.js";
import { readBundledAssetModel } from "./assets/bundled.js";
import { styleForTier } from "./geometry/panels/palette.js";

export { makeFixture, type FixtureOptions } from "./blueprint/fixture.js";
export { findPath, type PathLeg, type PathQuery } from "./npc/index.js";
export { coreFeasibility, type CoreFeasibility } from "./layout/index.js";
export { type TextureMode, type TextureOptions, type TextureReport } from "./materials/index.js";
export { InteriorError };
export type * from "./core/types.js";

export interface GenerateOptions {
  /** parsed shell GLB; skips reading `request.shellGlb` from disk */
  shellDoc?: Document;
  /** how the GLB carries its maps; external by default (a finished, textured interior) */
  textures?: TextureOptions;
  /** also return each floor band's interior as its own GLB (`floorGlbs` on the result),
   *  same materials, node scheme and texture mode as the whole building */
  floorGlbs?: boolean;
  /** imported furniture models; true by default, false keeps procedural furniture only */
  assets?: boolean | { read?: AssetReader };
}

export type FloorGenerateOptions = Omit<GenerateOptions, "floorGlbs">;

/** The box surface: validates, plans, builds NPC support and geometry, resolves the material
 *  keys through the materials database and returns the finished result. Same request, same
 *  database, same options, identical output. */
export async function generateInterior(
  request: unknown, options: GenerateOptions = {},
): Promise<InteriorResult> {
  const validated = validateRequest(request);
  const shellDoc = options.shellDoc ?? (await readShell(validated.shellGlb));
  validateShell(validated, shellDoc);

  const assignments = resolveAssignments(validated);
  const plan = planBuilding(validated, assignments);
  const npc = buildNpcSupport(plan, validated);
  const assets = await prepareAssets(plan.floors, validated, options.assets);
  const { doc, stepsByFloor, floorMeshes } = buildInterior(plan, validated, shellDoc, {
    skipFurnitureIdsByFloor: assets?.skipIdsByFloor,
  });
  if (assets) {
    for (const floor of plan.floors) {
      await appendFurnitureAssets(doc, assets.byFloor.get(floor.floor) ?? [], assets.documents, floor.elevation);
    }
  }
  const textures = await textureDocument(doc, validated.materialTheme, options.textures);

  let floorGlbs: Map<number, Uint8Array> | undefined;
  if (options.floorGlbs) {
    floorGlbs = (await writeFloorGlbs(floorMeshes, validated.materialTheme, options.textures, assets, plan.floors)).floorGlbs;
  }

  const floors = finishFloors(plan.floors, stepsByFloor);

  return { glb: await writeGlb(doc), floors, npc, textures, ...(floorGlbs ? { floorGlbs } : {}) };
}

/** Generates validated per-floor GLBs without allocating the merged building mesh or document. */
export async function generateFloorInteriors(
  request: unknown, options: FloorGenerateOptions = {},
): Promise<FloorInteriorResult> {
  const validated = await validateFloorRequest(request, options.shellDoc);
  const assignments = resolveAssignments(validated);
  const plan = planBuilding(validated, assignments);
  const npc = buildNpcSupport(plan, validated);
  const assets = await prepareAssets(plan.floors, validated, options.assets);
  const { stepsByFloor, floorMeshes } = buildInteriorBands(plan, validated, {
    skipFurnitureIdsByFloor: assets?.skipIdsByFloor,
  });
  const output = await writeFloorGlbs(floorMeshes, validated.materialTheme, options.textures, assets, plan.floors);
  return { floors: finishFloors(plan.floors, stepsByFloor), npc, ...output };
}

async function prepareAssets(
  floors: readonly FloorInterior[], request: InteriorRequest, option: GenerateOptions["assets"],
) {
  if (option === false) return undefined;
  const read = typeof option === "object" && option.read ? option.read : defaultAssetReader;
  return prepareFurnitureAssets(
    floors,
    request,
    [styleForTier(request.building.tier), request.building.tier],
    read,
  );
}

async function defaultAssetReader(asset: Parameters<AssetReader>[0]): ReturnType<AssetReader> {
  if (typeof process !== "undefined" && process.versions?.node) {
    const { readAssetModel } = await import("./assets/io.js");
    return readAssetModel(asset);
  }
  return readBundledAssetModel(asset);
}

async function validateFloorRequest(request: unknown, supplied?: Document): Promise<InteriorRequest> {
  const validated = validateRequest(request);
  const shell = supplied ?? (await readShell(validated.shellGlb));
  validateShell(validated, shell);
  return validated;
}

async function readShell(path: string): Promise<Document> {
  try {
    return await readGlbFile(path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new InteriorError("E_SHELL_MISMATCH", `cannot read shell GLB "${path}": ${message}`);
  }
}

function finishFloors(
  floors: FloorInterior[], stepsByFloor: Map<number, Record<string, Rect3[]>>,
): FloorInterior[] {
  return floors.map((floor) => ({
    ...floor,
    core: {
      ...floor.core,
      stairs: floor.core.stairs.map((stair) => {
        const steps = stepsByFloor.get(floor.floor)?.[stair.id];
        return steps ? { ...stair, steps } : stair;
      }),
    },
  }));
}
