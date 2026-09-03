import type { MeshBuilder } from "../glb/mesh-builder.js";
import { STAIR } from "../layout/constants.js";
import type { CorePlan } from "../layout/core-plan.js";
import type { RoofAccessPlan } from "../layout/roof-access.js";
import { uvRectCorners, uvToWorld } from "../layout/uv.js";
import type { MaterialKeys } from "./materials.js";

/** Closed roof-level platform from stair A's arrival landing to Exterior's door threshold. */
export function emitRoofLanding(
  mb: MeshBuilder, keys: MaterialKeys, core: CorePlan, roof: RoofAccessPlan,
): void {
  const rect = roof.landingUv;
  const corners = uvRectCorners({ u: rect.x, v: rect.z, lu: rect.w, lv: rect.d })
    .map((point) => uvToWorld(point, core.frame));
  const y = roof.access.elevation;
  mb.addPrism(keys.concrete(), corners, y - STAIR.slab, y);
}
