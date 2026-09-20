import luxury from "./luxury.json" with { type: "json" };
import plans from "./plans.json" with { type: "json" };
import type { Point } from "../../core/geom.js";
import { polygonArea } from "../../core/geom.js";
import { roomFootprintAnchor, roomFootprintClearance, roomFootprintContains } from "../../core/room-footprint.js";
import type { Room } from "../../core/types.js";
import type { AppState } from "../app-state.js";
import type { Viewer3D } from "../views/viewer3d.js";
import type { PreviewSample } from "./schema.js";

const samples = new Map<string, PreviewSample>([
  ["luxury", luxury as PreviewSample],
  ...(plans as (PreviewSample & { name: string })[]).map((sample) => [sample.name, sample] as [string, PreviewSample]),
]);

export function previewSample(name?: string | null): PreviewSample | undefined {
  return name ? samples.get(name) : undefined;
}

/** Clear standing space the eye keeps off any wall face. */
const EYE_CLEAR = 1;

/** Pulls the eye back along its own offset until it stands inside the room with space
 *  around it: a view aimed from beyond the plate would otherwise look straight into that
 *  room's own wall face. */
function standingPoint(room: Room, anchor: Point, at: Point): Point {
  const shape = { polygon: room.polygon, holes: room.holes };
  for (let reach = 1; reach > 0.05; reach -= 0.05) {
    const point: Point = [anchor[0] + (at[0] - anchor[0]) * reach, anchor[1] + (at[1] - anchor[1]) * reach];
    if (roomFootprintContains(shape, point) && roomFootprintClearance(shape, point) >= EYE_CLEAR) return point;
  }
  return roomFootprintAnchor(shape);
}

/** Stands the eye camera at the view's furniture or room; a view its floor cannot place
 *  leaves the floor overview. */
export function showSample(sample: PreviewSample, state: AppState, viewer: Viewer3D, viewIndex = 0): void {
  const view = sample.views[viewIndex];
  if (!view) return;
  state.setFloor(view.floor);
  state.setMode("floor");
  const floor = state.floorData();
  if (!floor) return;
  let at: [number, number] | undefined;
  let anchor: Point | undefined;
  let room: string | undefined;
  let heading = view.heading;
  if (view.furniture) {
    const item = floor.furniture.find((item) => item.kind === view.furniture && (view.width === undefined || item.size[0] === view.width));
    if (item) {
      // the offset is in the piece's own frame, x across and z in front; the eye looks back at it
      const rad = item.rotationDeg * Math.PI / 180, [ox, oz] = view.offset;
      at = [item.position[0] + ox * Math.cos(rad) + oz * Math.sin(rad), item.position[1] - ox * Math.sin(rad) + oz * Math.cos(rad)];
      anchor = [item.position[0], item.position[1]];
      heading = (item.rotationDeg + 180 + view.heading) % 360;
      room = item.room;
    }
  } else if (view.room) {
    const largest = floor.rooms.filter((r) => r.kind === view.room).sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon))[0];
    if (largest) {
      const xs = largest.polygon.map((p) => p[0]), zs = largest.polygon.map((p) => p[1]);
      at = [(Math.min(...xs) + Math.max(...xs)) / 2 + view.offset[0], (Math.min(...zs) + Math.max(...zs)) / 2 + view.offset[1]];
      anchor = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
      room = largest.id;
    }
  }
  const standing = floor.rooms.find((r) => r.id === room);
  if (!at || !room || !standing || !anchor) return;
  state.selectRoom(room);
  viewer.setFloorSlice({ y0: floor.elevation - 0.3, y1: floor.ceilingElevation + 0.2 });
  viewer.standIn(standingPoint(standing, anchor, at), floor.elevation + 1.65, heading);
}
