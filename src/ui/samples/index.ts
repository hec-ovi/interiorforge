import data from "./luxury.json" with { type: "json" };
import type { AppState } from "../app-state.js";
import type { Viewer3D } from "../views/viewer3d.js";
import type { PreviewSample } from "./schema.js";

const samples = new Map<string, PreviewSample>([["luxury", data as PreviewSample]]);
export function previewSample(name?: string | null): PreviewSample | undefined {
  return name ? samples.get(name) : undefined;
}

export function showSample(sample: PreviewSample, state: AppState, viewer: Viewer3D, viewIndex = 0): void {
  const view = sample.views[viewIndex];
  if (!view) return;
  state.setFloor(view.floor);
  state.setMode("floor");
  const floor = state.floorData();
  const item = floor?.furniture.find(item => item.kind === view.furniture && item.size[0] === view.width);
  if (!floor || !item) return;
  state.selectRoom(item.room);
  viewer.setFloorSlice({ y0: floor.elevation - 0.3, y1: floor.ceilingElevation + 0.05 });
  viewer.standIn([item.position[0] + view.offset[0], item.position[1] + view.offset[1]],
    floor.elevation + 1.65, view.heading);
}
