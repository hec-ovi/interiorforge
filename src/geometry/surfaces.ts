import type { Point } from "../core/geom.js";
import type { FloorInterior, RoomKind } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import type { CorePlan } from "../layout/core-plan.js";
import { uvRectCorners, uvToWorld } from "../layout/uv.js";
import { coreRects } from "./core-geo.js";
import type { MaterialKeys } from "./materials.js";

const SOFFIT_DEPTH = 0.15;
const CEILING_DROP = 0.35;

/** Rooms without a dropped ceiling: raw soffit or open air reads right there. */
const OPEN_CEILING: ReadonlySet<RoomKind> = new Set([
  "parking_area", "mechanical_room", "terrace_open",
]);

export function buildFloorSurfaces(
  mb: MeshBuilder, keys: MaterialKeys, floor: FloorInterior, ceilingHeight: number,
  sealedPolys: Point[][] = [],
): void {
  for (const room of floor.rooms) {
    mb.addHorizontalPolygon(keys.floorOf(room.kind), room.polygon, floor.elevation, "up");
    mb.addHorizontalPolygon(keys.concrete(), room.polygon, floor.elevation - SOFFIT_DEPTH, "down");
    if (!OPEN_CEILING.has(room.kind)) {
      mb.addHorizontalPolygon(keys.ceiling(), room.polygon, floor.elevation + ceilingHeight - CEILING_DROP, "down");
    }
  }
  // sealed service voids still carry the slab
  for (const poly of sealedPolys) {
    mb.addHorizontalPolygon(keys.concrete(), poly, floor.elevation, "up");
    mb.addHorizontalPolygon(keys.concrete(), poly, floor.elevation - SOFFIT_DEPTH, "down");
  }
}

/** Closes shaft bottoms at the lowest served floor so no shaft opens into the void. */
export function buildShaftFloors(mb: MeshBuilder, keys: MaterialKeys, core: CorePlan, elevation: number): void {
  for (const rect of coreRects(core)) {
    mb.addHorizontalPolygon(keys.concrete(), uvRectCorners(rect).map((p) => uvToWorld(p, core.frame)), elevation, "up");
  }
}
