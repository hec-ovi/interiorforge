import { generateInterior, makeFixture } from "../index.js";
import { readGlbBytes } from "../glb/io.js";
import type { InteriorRequest } from "../core/types.js";
import type { TextureOptions, ThemeIndex } from "../materials/index.js";
import type { AppParams, AppState } from "./app-state.js";
import { createAppState } from "./app-state.js";
import { createPlanView } from "./views/plan-view.js";
import type { Viewer3D } from "./views/viewer3d.js";
import { createControls } from "./widgets/controls.js";
import { createInfoPanel } from "./widgets/info-panel.js";

/** Wires the app into `root`. The 3D viewer is injected so tests can stub WebGL. */
const MATERIALS_BASE = "/materials/themes";

/** The dev server serves the materials database; textures resolve against it, so what the
 *  preview shows is the finished interior. Without it the GLB keeps its material keys. */
async function textureOptions(theme: string): Promise<TextureOptions> {
  const baseUrl = `${MATERIALS_BASE}/${theme}`;
  try {
    const response = await fetch(`${baseUrl}/theme.json`);
    if (!response.ok) return { mode: "keys" };
    return { mode: "external", theme: (await response.json()) as ThemeIndex, baseUrl };
  } catch {
    return { mode: "keys" };
  }
}

export function mountApp(root: HTMLElement, viewer: Viewer3D): AppState {
  const state = createAppState();

  async function regenerate(params: AppParams): Promise<void> {
    state.setParams(params);
    state.setBusy(true);
    try {
      const fixture = makeFixture(params);
      const result = await generateInterior(fixture.request, {
        shellDoc: fixture.shellDoc,
        textures: await textureOptions(fixture.request.materialTheme),
      });
      state.setResult(result);
      await viewer.setGlb(result.glb);
      applySlice();
    } finally {
      state.setBusy(false);
    }
  }

  /** Real-building mode: shell .glb plus blueprint .json (plus the exterior request .json
   *  for type, tier and theme) straight from the engine output directory. */
  async function loadBuilding(files: File[]): Promise<void> {
    state.setBusy(true);
    try {
      interface ExtRequest {
        building?: { type?: string; tier?: string };
        theme?: string;
      }
      let shellBytes: Uint8Array | null = null;
      let blueprint: Record<string, unknown> | null = null;
      let extRequest: ExtRequest | null = null;
      for (const file of files) {
        if (file.name.endsWith(".glb")) {
          shellBytes = new Uint8Array(await file.arrayBuffer());
        } else if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
          if (Array.isArray(parsed.floors)) blueprint = parsed;
          else if (parsed.building) extRequest = parsed as ExtRequest;
        }
      }
      if (!shellBytes || !blueprint) throw new Error("need a shell .glb and a blueprint .json");
      const request = {
        seed: (blueprint.seed as string | number | undefined) ?? 1,
        building: {
          id: (blueprint.buildingId as string | undefined) ?? "loaded",
          type: extRequest?.building?.type ?? "offices",
          tier: extRequest?.building?.tier ?? "mid",
        },
        shellGlb: "(loaded)",
        blueprint,
        materialTheme: extRequest?.theme ?? "cyberpunk",
      } as unknown as InteriorRequest;
      const shellDoc = await readGlbBytes(shellBytes);
      const result = await generateInterior(request, {
        shellDoc,
        textures: await textureOptions(request.materialTheme),
      });
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
  side.append(
    createControls(state, (p) => void regenerate(p), (files) => void loadBuilding(files)),
    createInfoPanel(state),
  );

  const planWrap = document.createElement("div");
  planWrap.className = "plan-wrap";
  planWrap.append(createPlanView(state));
  const showPlan = () => planWrap.toggleAttribute("hidden", state.mode !== "floor");
  state.on("mode", showPlan);
  showPlan();

  root.append(side, viewer.el, planWrap);
  void regenerate(state.params); // first load shows a finished building, no picking needed
  return state;
}

async function boot(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return; // test environment mounts explicitly
  const { createViewer3d } = await import("./views/viewer3d.js");
  mountApp(root, createViewer3d());
}

void boot();
