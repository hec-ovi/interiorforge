import { MeshBuilder } from "../glb/mesh-builder.js";
import { furnitureUvRect } from "../layout/navgrid.js";
import type { PlanFurniture } from "../layout/plan-types.js";
import type { Frame } from "../layout/uv.js";
import { uvRectCorners, uvToWorld } from "../layout/uv.js";
import type { MaterialKeys } from "./materials.js";

/** Furniture placeholders: one prism per piece at its planned pose, frame-rotated. */
export function emitFurniture(
  mb: MeshBuilder, keys: MaterialKeys, furniture: PlanFurniture[], frame: Frame, elevation: number,
): void {
  for (const f of furniture) {
    const corners = uvRectCorners(furnitureUvRect(f)).map((p) => uvToWorld(p, frame));
    mb.addPrism(keys.furnitureOf(f.kind), corners, elevation, elevation + f.size[2]);
  }
}
