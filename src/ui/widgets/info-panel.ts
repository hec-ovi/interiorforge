import { polygonArea } from "../../core/geom.js";
import type { AppState } from "../app-state.js";
import { el } from "../components/dom.js";

export function createInfoPanel(state: AppState): HTMLElement {
  const container = el("div", { class: "info-panel" });

  function render(): void {
    container.replaceChildren();
    const floor = state.floorData();
    const result = state.result;
    if (!floor || !result) {
      container.append(el("p", {}, ["generate a building, then inspect floors and rooms"]));
      return;
    }
    container.append(el("h3", {}, [`floor ${floor.floor}: ${floor.kind}`]));
    container.append(el("p", {}, [
      `${floor.rooms.length} rooms, ${floor.furniture.length} furniture, height ${floor.height.toFixed(2)}m`,
    ]));

    const room = floor.rooms.find((r) => r.id === state.selectedRoom);
    if (room) {
      container.append(el("h4", {}, [`${room.id}: ${room.kind}`]));
      const lines = [
        `area ${Math.abs(polygonArea(room.polygon)).toFixed(1)} m2`,
        room.unit ? `unit ${room.unit}` : "",
        `doors: ${room.doors.map((d) => `${d.leaves}-leaf to ${d.to}`).join(", ") || "none"}`,
        `furniture: ${floor.furniture.filter((f) => f.room === room.id).map((f) => f.kind).join(", ") || "none"}`,
        `anchors: ${result.npc.anchors.filter((a) => a.floor === floor.floor && a.room === room.id).map((a) => a.kind).join(", ") || "none"}`,
      ].filter(Boolean);
      for (const line of lines) container.append(el("p", { class: "detail" }, [line]));
    } else {
      container.append(el("p", { class: "hint" }, ["click a room to inspect it"]));
    }

    if (state.path) {
      const walk = state.path.find((l) => l.kind === "walk");
      const points = walk && walk.kind === "walk" ? walk.points.length : 0;
      container.append(el("p", { class: "path-status" }, [`path found: ${points} waypoints`]));
    } else {
      container.append(el("p", { class: "hint" }, ["shift-click two plan points to test a walk path"]));
    }
  }

  for (const event of ["result", "floor", "selection", "path"] as const) state.on(event, render);
  render();
  return container;
}
