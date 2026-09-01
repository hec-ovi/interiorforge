import type { BuildingType, Tier } from "../../core/types.js";
import type { AppParams, AppState } from "../app-state.js";
import { el, labeled } from "../components/dom.js";

const TYPES: BuildingType[] = [
  "offices", "corpo", "residential", "hotel", "hospital", "clinic", "police",
  "military", "factory", "commerce", "mall", "restaurant", "coffee_shop",
];
const TIERS: Tier[] = ["poor", "mid", "rich", "high_rich"];

export function createControls(
  state: AppState, onGenerate: (params: AppParams) => void, onLoadFiles: (files: File[]) => void,
): HTMLElement {
  const seed = el("input", { type: "number", value: state.params.seed, name: "seed" });
  const floors = el("input", { type: "number", value: state.params.floors, min: 1, max: 80, name: "floors" });
  const basements = el("input", { type: "number", value: state.params.basements, min: 0, max: 4, name: "basements" });
  const type = el("select", { name: "type" }, TYPES.map((t) => el("option", { value: t }, [t])));
  const tier = el("select", { name: "tier" }, TIERS.map((t) => el("option", { value: t }, [t])));
  type.value = state.params.type;
  tier.value = state.params.tier;

  const generate = el("button", {
    onclick: () => onGenerate({
      seed: Number(seed.value), floors: Number(floors.value), basements: Number(basements.value),
      type: type.value as BuildingType, tier: tier.value as Tier,
    }),
  }, ["generate"]);

  const modeBuilding = el("button", { class: "mode active", onclick: () => state.setMode("building") }, ["building"]);
  const modeFloor = el("button", { class: "mode", onclick: () => state.setMode("floor") }, ["floor editor"]);
  const floorSelect = el("select", { name: "floor", onchange: () => state.setFloor(Number(floorSelect.value)) });

  state.on("mode", () => {
    modeBuilding.classList.toggle("active", state.mode === "building");
    modeFloor.classList.toggle("active", state.mode === "floor");
  });
  state.on("result", () => {
    floorSelect.replaceChildren(
      ...(state.result?.floors ?? [])
        .filter((f) => f.rooms.length > 0)
        .map((f) => el("option", { value: f.floor }, [`floor ${f.floor} (${f.kind})`])),
    );
    floorSelect.value = String(state.floorIndex);
  });
  state.on("busy", () => {
    generate.toggleAttribute("disabled", state.busy);
    generate.textContent = state.busy ? "generating..." : "generate";
  });

  const loadInput = el("input", {
    type: "file", multiple: true, name: "load",
    onchange: () => {
      if (loadInput.files && loadInput.files.length > 0) onLoadFiles(Array.from(loadInput.files));
    },
  });

  return el("div", { class: "controls" }, [
    labeled("seed", seed), labeled("floors", floors), labeled("basements", basements),
    labeled("type", type), labeled("tier", tier), generate,
    el("div", { class: "load-row" }, [
      el("span", { class: "load-hint" }, ["or load a real building (shell .glb + blueprint .json + request .json)"]),
      loadInput,
    ]),
    el("div", { class: "mode-row" }, [modeBuilding, modeFloor, labeled("floor", floorSelect)]),
  ]);
}
