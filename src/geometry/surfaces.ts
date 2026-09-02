import type { Point } from "../core/geom.js";
import type { RoomKind } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import type { CorePlan } from "../layout/core-plan.js";
import { uvRectCorners, uvToWorld } from "../layout/uv.js";
import { coreRects } from "./core-geo.js";
import type { MaterialKeys } from "./materials.js";
import { SOFFIT_DEPTH } from "../layout/constants.js";

/** Rooms without a dropped ceiling: raw soffit or open air reads right there. */
const OPEN_CEILING: ReadonlySet<RoomKind> = new Set([
  "parking_area", "mechanical_room", "terrace_open",
]);

/** A room's world plan, already cut to the plate inside the shell wall. */
export interface RoomPlan {
  kind: RoomKind;
  polygon: Point[];
}

/** Finish floor, slab soffit and ceiling per room; sealed voids carry the slab only. */
export function buildFloorSurfaces(
  mb: MeshBuilder, keys: MaterialKeys, rooms: RoomPlan[], elevation: number, ceilingY: number,
  sealedPolys: Point[][],
): void {
  for (const room of rooms) {
    mb.addHorizontalPolygon(keys.floorOf(room.kind), room.polygon, elevation, "up");
    mb.addHorizontalPolygon(keys.concrete(), room.polygon, elevation - SOFFIT_DEPTH, "down");
    if (!OPEN_CEILING.has(room.kind)) {
      mb.addHorizontalPolygon(keys.ceiling(), room.polygon, ceilingY, "down");
    }
  }
  for (const poly of sealedPolys) {
    mb.addHorizontalPolygon(keys.concrete(), poly, elevation, "up");
    mb.addHorizontalPolygon(keys.concrete(), poly, elevation - SOFFIT_DEPTH, "down");
  }
}

/** Closes shaft bottoms at the lowest served floor so no shaft opens into the void. */
export function buildShaftFloors(mb: MeshBuilder, keys: MaterialKeys, core: CorePlan, elevation: number): void {
  for (const rect of coreRects(core)) {
    mb.addHorizontalPolygon(keys.concrete(), uvRectCorners(rect).map((p) => uvToWorld(p, core.frame)), elevation, "up");
  }
}
