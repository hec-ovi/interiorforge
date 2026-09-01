import type { Point } from "../core/geom.js";
import { rectCorners } from "../core/geom.js";
import type { FloorInterior, RoomKind } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import type { MaterialKeys } from "./materials.js";

const SOFFIT_DEPTH = 0.15;
const CEILING_DROP = 0.35;

/** Rooms without a dropped ceiling: raw soffit or open air reads right there. */
const OPEN_CEILING: ReadonlySet<RoomKind> = new Set([
  "parking_area", "mechanical_room", "terrace_open",
]);

export function buildFloorSurfaces(
  mb: MeshBuilder, keys: MaterialKeys, floor: FloorInterior, ceilingHeight: number,
): void {
  for (const room of floor.rooms) {
    mb.addHorizontalPolygon(keys.floorOf(room.kind), room.polygon, floor.elevation, "up");
    mb.addHorizontalPolygon(keys.concrete(), room.polygon, floor.elevation - SOFFIT_DEPTH, "down");
    if (!OPEN_CEILING.has(room.kind)) {
      mb.addHorizontalPolygon(keys.ceiling(), room.polygon, floor.elevation + ceilingHeight - CEILING_DROP, "down");
    }
  }
}

/** Closes shaft bottoms at the lowest served floor so no shaft opens into the void. */
export function buildShaftFloors(mb: MeshBuilder, keys: MaterialKeys, lowest: FloorInterior): void {
  const plates: Point[][] = [
    ...lowest.core.elevators.map((e) => rectCorners(e.rect)),
    ...lowest.core.stairs.map((s) => rectCorners(s.rect)),
    ...lowest.core.shafts.map((s) => rectCorners(s)),
  ];
  for (const poly of plates) {
    mb.addHorizontalPolygon(keys.concrete(), poly, lowest.elevation, "up");
  }
}
