import { polygonBounds } from "../../core/geom.js";
import type { Point } from "../../core/geom.js";
import { findPath } from "../../npc/index.js";
import type { AppState } from "../app-state.js";
import { svgEl } from "../components/dom.js";

const ROOM_FILL: Record<string, string> = {
  corridor: "#2c3340", elevator_lobby: "#2c3340", reception: "#3a4358", lounge: "#3a4358",
  office_open: "#31424a", office_private: "#31424a", meeting: "#38505a", executive_office: "#405a64",
  dining_area: "#4a4034", kitchen: "#54483a", counter_area: "#54483a", bar: "#4a4034",
  bedroom: "#3d3a52", living: "#44405c", studio_main: "#44405c", bathroom: "#2f4448", toilets: "#2f4448",
  gym_floor: "#354a3b", locker_room: "#3b5242", storage: "#33363c", mechanical_room: "#33363c",
  terrace_open: "#2e3a46", parking_area: "#2b2e34",
};

const ANCHOR_FILL: Record<string, string> = {
  entrance: "#7fd47f", work_spot: "#e8c96a", counter_spot: "#e8a06a", seat: "#b7a3e0",
  idle_spot: "#8fb7e0", patrol_point: "#e07f7f", bed: "#c6a3e0", toilet: "#6ad0c8",
  machine_spot: "#a3e0b7", elevator_wait: "#f0f0f0", stair_entry: "#f0f0f0", cleaning_spot: "#d0d06a",
};

/** SVG plan of the selected floor. Click a room to select it; click two clear points to
 *  run findPath on this floor and draw the route. */
export function createPlanView(state: AppState): HTMLElement {
  const container = document.createElement("div");
  container.className = "plan-view";
  let pathStart: Point | null = null;

  function render(): void {
    container.replaceChildren();
    const floor = state.floorData();
    const result = state.result;
    if (!floor || !result || floor.rooms.length === 0) {
      container.append("no floor data");
      return;
    }
    const allPoints = floor.rooms.flatMap((r) => r.polygon);
    const b = polygonBounds(allPoints);
    const pad = 1.5;
    const svg = svgEl("svg", {
      viewBox: `${b.x - pad} ${b.z - pad} ${b.w + 2 * pad} ${b.d + 2 * pad}`,
      class: "plan-svg",
    });
    svg.setAttribute("data-floor", String(floor.floor));

    for (const room of floor.rooms) {
      const poly = svgEl("polygon", {
        points: room.polygon.map(([x, z]) => `${x},${z}`).join(" "),
        fill: ROOM_FILL[room.kind] ?? "#333",
        stroke: state.selectedRoom === room.id ? "#ffffff" : "#0d0e10",
        "stroke-width": state.selectedRoom === room.id ? 0.22 : 0.1,
      });
      poly.setAttribute("data-room", room.id);
      poly.addEventListener("click", (ev) => {
        if (ev.shiftKey) return; // shift-clicks fall through to path picking on the svg
        ev.stopPropagation();
        state.selectRoom(room.id);
      });
      svg.append(poly);
    }

    for (const room of floor.rooms) {
      for (const door of room.doors) {
        const along = door.angleDeg === 0 || door.angleDeg === 180 ? [1, 0] : [0, 1];
        svg.append(svgEl("line", {
          x1: door.position[0] - (along[0]! * door.width) / 2,
          y1: door.position[1] - (along[1]! * door.width) / 2,
          x2: door.position[0] + (along[0]! * door.width) / 2,
          y2: door.position[1] + (along[1]! * door.width) / 2,
          stroke: door.to === "outside" ? "#7fd47f" : "#e8e2c9",
          "stroke-width": 0.16,
          class: "door",
        }));
      }
    }

    for (const f of floor.furniture) {
      const swap = f.rotationDeg === 90 || f.rotationDeg === 270;
      const w = swap ? f.size[1] : f.size[0];
      const d = swap ? f.size[0] : f.size[1];
      svg.append(svgEl("rect", {
        x: f.position[0] - w / 2, y: f.position[1] - d / 2, width: w, height: d,
        fill: "#1d2126", opacity: 0.85, class: "furniture",
      }));
    }

    for (const anchor of result.npc.anchors.filter((a) => a.floor === floor.floor)) {
      const dot = svgEl("circle", {
        cx: anchor.position[0], cy: anchor.position[1], r: 0.22,
        fill: ANCHOR_FILL[anchor.kind] ?? "#fff", class: "anchor",
      });
      dot.setAttribute("data-anchor", anchor.kind);
      svg.append(dot);
    }

    const walkLegs = state.path?.filter((l) => l.kind === "walk") ?? [];
    for (const leg of walkLegs) {
      if (leg.kind !== "walk" || leg.floor !== floor.floor) continue;
      svg.append(svgEl("polyline", {
        points: leg.points.map(([x, z]) => `${x},${z}`).join(" "),
        fill: "none", stroke: "#6ae86a", "stroke-width": 0.18, class: "path",
      }));
    }

    svg.addEventListener("click", (ev) => {
      if (!ev.shiftKey) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const vb = svg.viewBox.baseVal;
      const x = vb.x + ((ev.clientX - rect.left) / rect.width) * vb.width;
      const z = vb.y + ((ev.clientY - rect.top) / rect.height) * vb.height;
      handlePick([x, z]);
    });
    container.append(svg);
  }

  function handlePick(point: Point): void {
    const floor = state.floorData();
    if (!floor || !state.result) return;
    if (!pathStart) {
      pathStart = point;
      state.setPath(null);
      return;
    }
    const legs = findPath(
      state.result.npc,
      { floor: floor.floor, position: pathStart },
      { floor: floor.floor, position: point },
    );
    pathStart = null;
    state.setPath(legs);
  }

  for (const event of ["result", "floor", "selection", "path", "mode"] as const) {
    state.on(event, render);
  }
  render();
  return container;
}
