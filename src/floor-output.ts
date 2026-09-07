import type { MeshBuilder } from "./glb/mesh-builder.js";
import { createDocument, writeGlb } from "./glb/io.js";
import { textureDocument, type TextureOptions, type TextureReport } from "./materials/index.js";
import { appendFurnitureAssets, type PreparedFurnitureAssets } from "./assets/index.js";
import type { FloorInterior } from "./core/types.js";

export interface FloorGlbOutput {
  floorGlbs: Map<number, Uint8Array>;
  textures: TextureReport;
}

/** Serializes one floor document at a time and releases its source mesh before the next. */
export async function writeFloorGlbs(
  floorMeshes: Map<number, MeshBuilder>, theme: string, options?: TextureOptions,
  assets?: PreparedFurnitureAssets, floors: readonly FloorInterior[] = [],
): Promise<FloorGlbOutput> {
  const slots = new Set<string>();
  for (const mesh of floorMeshes.values()) {
    for (const material of mesh.materials()) slots.add(material);
  }
  const floorGlbs = new Map<number, Uint8Array>();
  let textureReport: TextureReport | undefined;
  for (const index of [...floorMeshes.keys()]) {
    const mesh = floorMeshes.get(index)!;
    floorMeshes.delete(index);
    const floor = floors.find((entry) => entry.floor === index);
    const output = await writeFloorGlb(mesh, theme, options, floor, assets);
    textureReport ??= output.textures;
    floorGlbs.set(index, output.glb);
  }
  const base = textureReport ?? { mode: "keys" as const, materials: 0 };
  return {
    floorGlbs,
    textures: { ...base, materials: base.mode === "keys" ? 0 : slots.size },
  };
}

async function writeFloorGlb(
  mesh: MeshBuilder, theme: string, options?: TextureOptions,
  floor?: FloorInterior, assets?: PreparedFurnitureAssets,
): Promise<{ glb: Uint8Array; textures: TextureReport }> {
  const document = createDocument(mesh);
  if (floor && assets) {
    await appendFurnitureAssets(document, assets.byFloor.get(floor.floor) ?? [], assets.documents, floor.elevation);
  }
  const textures = await textureDocument(document, theme, options);
  return { glb: await writeGlb(document), textures };
}
