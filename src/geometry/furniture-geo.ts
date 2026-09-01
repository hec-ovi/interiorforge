import type { FloorInterior } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import type { MaterialKeys } from "./materials.js";

/** Furniture placeholders: one box per piece at its planned pose. */
export function emitFurniture(mb: MeshBuilder, keys: MaterialKeys, floor: FloorInterior): void {
  for (const f of floor.furniture) {
    const swap = f.rotationDeg === 90 || f.rotationDeg === 270;
    const w = swap ? f.size[1] : f.size[0];
    const d = swap ? f.size[0] : f.size[1];
    mb.addBox(
      keys.furnitureOf(f.kind),
      { x: f.position[0] - w / 2, z: f.position[1] - d / 2, w, d },
      floor.elevation,
      floor.elevation + f.size[2],
    );
  }
}
