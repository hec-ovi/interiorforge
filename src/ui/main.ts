import "./style.css";
import { polygonArea } from "../core/geom.js";
import { generate as generateInterior } from "../placements/generate.js";
import { makePlacementFixture } from "../blueprint/placement-fixture.js";
import type { InteriorRequest } from "../core/types.js";
import type { AppParams, AppState } from "./app-state.js";
import { createAppState } from "./app-state.js";
import { toast } from "./components/toast.js";
import { createPlanView } from "./views/plan-view.js";
import type { Viewer3D } from "./views/viewer3d.js";
import { createControls } from "./widgets/controls.js";
import { createInfoPanel } from "./widgets/info-panel.js";
import { previewSample, showSample } from "./samples/index.js";
import type { PreviewSample } from "./samples/schema.js";
import { createSampleTour } from "./components/sample-tour.js";

export function mountApp(root: HTMLElement, viewer: Viewer3D, sampleName?: string, viewIndex = 0): AppState {
  const state = createAppState();
  const sample = previewSample(sampleName);
  if (sample?.fixture) state.setParams({ ...state.params, ...sample.fixture });
  /** Tells a capture the scene it asked for is standing. */
  const ready = (): void => { root.dataset.ready = "1"; };
  const tour = sample ? createSampleTour(sample.title, sample.views, index => {
    showSample(sample, state, viewer, index);
  }) : undefined;
  state.on("busy", () => {
    tour?.querySelectorAll("button").forEach(button => { button.disabled = state.busy; });
  });

  async function regenerate(params: AppParams, review?: PreviewSample): Promise<void> {
    if (tour) tour.hidden = !review;
    state.setParams(params);
    state.setBusy(true);
    try {
      const request = review?.plan ? await planRequest(review) : makePlacementFixture({ ...params, outline: [[0,0],[40,0],[40,40],[0,40]] });
      if (review?.assignments) request.assignments = review.assignments;
      const result = await generateInterior(request);
      state.setResult(result);
      warnMissing(result.missingModels, await viewer.setPlacements(result));
      applySlice();
      if (review) showSample(review, state, viewer, viewIndex);
      ready();
      toast.success(
        review ? `${review.title} · Seed ${params.seed}`
          : `Generated ${result.building.floors.length}F ${params.type} (${params.tier}) · Seed ${params.seed}`,
        "Interior Generated",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), "Generation Failed");
    } finally {
      state.setBusy(false);
    }
  }

  /** A published kit plan from the shared resources route, generated as the sample's building. */
  async function planRequest(review: PreviewSample): Promise<InteriorRequest> {
    const response = await fetch(`/shared/${review.plan}`);
    if (!response.ok) throw new Error(`plan ${review.plan} is unavailable: HTTP ${response.status}`);
    const blueprint = await response.json() as InteriorRequest["blueprint"];
    return { seed: review.building!.id, building: review.building!, blueprint, materialTheme: "cyberpunk" };
  }

  /** Loads the assembled blueprint and optional building request metadata. */
  async function loadBuilding(files: File[]): Promise<void> {
    if (tour) tour.hidden = true;
    state.setBusy(true);
    try {
      interface ExtRequest {
        building?: { type?: string; tier?: string };
        theme?: string;
      }
      let blueprint: Record<string, unknown> | null = null;
      let extRequest: ExtRequest | null = null;
      for (const file of files) {
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
          if (Array.isArray(parsed.floors)) blueprint = parsed;
          else if (parsed.building) extRequest = parsed as ExtRequest;
        }
      }
      if (!blueprint) throw new Error("need an assembled blueprint .json");
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
      const result = await generateInterior(request);
      state.setResult(result);
      warnMissing(result.missingModels, await viewer.setPlacements(result));
      applySlice();
      toast.success(
        `Imported ${request.building.id} with ${result.building.floors.length} floors`,
        "Model Loaded",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), "Load Failed");
    } finally {
      state.setBusy(false);
    }
  }

  /** Lists the furniture models this preview lacks: those generation passed over and those
   *  drawn as placeholder boxes. */
  function warnMissing(passedOver: readonly string[], placeholders: readonly string[]): void {
    const missing = [...new Set([...passedOver, ...placeholders])].sort();
    if (missing.length) toast.warning(`${missing.join(", ")}. Their furniture wears another model, leaves the layout or stands as a box.`, "Missing Furniture Models");
  }

  function applySlice(): void {
    const floor = state.floorData();
    if (state.mode === "floor" && floor) {
      viewer.setFloorSlice({ y0: floor.elevation - 0.3, y1: floor.elevation + floor.height - 0.4 });
      viewer.setLights(floor.lights);
    } else {
      viewer.setFloorSlice(null);
      viewer.setLights(null);
    }
  }
  state.on("mode", applySlice);
  state.on("floor", applySlice);
  state.on("result", applySlice);

  /** Stand in the selected room (or the biggest one on the floor) and look across it. */
  function standIn(): void {
    const floor = state.floorData();
    if (!floor || floor.rooms.length === 0) return;
    if (state.mode !== "floor") state.setMode("floor");
    const room = floor.rooms.find((r) => r.id === state.selectedRoom)
      ?? [...floor.rooms].sort((a, b) => polygonArea(b.polygon) - polygonArea(a.polygon))[0]!;
    const xs = room.polygon.map((p) => p[0]);
    const zs = room.polygon.map((p) => p[1]);
    const at: [number, number] = [
      (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2,
    ];
    const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs);
    viewer.setFloorSlice({ y0: floor.elevation - 0.3, y1: floor.ceilingElevation + 0.05 });
    viewer.standIn(at, floor.elevation + 1.65, wide ? 90 : 0);
    toast.info(`Camera placed in room ${room.id} (${room.kind}) at eye level (+1.65m)`, "Eye View");
  }

  const side = document.createElement("div");
  side.className = "sidebar";
  if (tour) side.append(tour);
  side.append(
    createControls(state, (p) => void regenerate(p), (files) => void loadBuilding(files), standIn),
    createInfoPanel(state),
  );

  const planWrap = document.createElement("div");
  planWrap.className = "plan-wrap";
  planWrap.append(createPlanView(state));
  const showPlan = () => {
    planWrap.toggleAttribute("hidden", state.mode !== "floor");
  };
  state.on("mode", showPlan);
  showPlan();

  root.append(side, viewer.el, planWrap);
  void regenerate(state.params, sample);
  return state;
}

async function boot(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return; // test environment mounts explicitly
  try {
    const { createViewer3d } = await import("./views/viewer3d.js");
    const query = new URLSearchParams(window.location.search);
    mountApp(root, createViewer3d(), query.get("sample") ?? undefined, Number(query.get("view") ?? 0));
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err), "Preview Failed");
  }
}

void boot();
