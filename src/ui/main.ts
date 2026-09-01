import { generateInterior, makeFixture } from "../index.js";
import type { AppParams, AppState } from "./app-state.js";
import { createAppState } from "./app-state.js";
import { createPlanView } from "./views/plan-view.js";
import type { Viewer3D } from "./views/viewer3d.js";
import { createControls } from "./widgets/controls.js";
import { createInfoPanel } from "./widgets/info-panel.js";

/** Wires the app into `root`. The 3D viewer is injected so tests can stub WebGL. */
export function mountApp(root: HTMLElement, viewer: Viewer3D): AppState {
  const state = createAppState();

  async function regenerate(params: AppParams): Promise<void> {
    state.setParams(params);
    state.setBusy(true);
    try {
      const fixture = makeFixture(params);
      const result = await generateInterior(fixture.request, { shellDoc: fixture.shellDoc });
      state.setResult(result);
      await viewer.setGlb(result.glb);
      applySlice();
    } finally {
      state.setBusy(false);
    }
  }

  function applySlice(): void {
    const floor = state.floorData();
    if (state.mode === "floor" && floor) {
      viewer.setFloorSlice({ y0: floor.elevation - 0.3, y1: floor.elevation + floor.height - 0.4 });
    } else {
      viewer.setFloorSlice(null);
    }
  }
  state.on("mode", applySlice);
  state.on("floor", applySlice);

  const side = document.createElement("div");
  side.className = "sidebar";
  side.append(createControls(state, (p) => void regenerate(p)), createInfoPanel(state));

  const planWrap = document.createElement("div");
  planWrap.className = "plan-wrap";
  planWrap.append(createPlanView(state));
  const showPlan = () => planWrap.toggleAttribute("hidden", state.mode !== "floor");
  state.on("mode", showPlan);
  showPlan();

  root.append(side, viewer.el, planWrap);
  return state;
}

async function boot(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return; // test environment mounts explicitly
  const { createViewer3d } = await import("./views/viewer3d.js");
  mountApp(root, createViewer3d());
}

void boot();
