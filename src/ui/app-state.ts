import type { BuildingType, FloorInterior, InteriorResult, Tier } from "../core/types.js";
import type { PathLeg } from "../npc/index.js";

export interface AppParams {
  seed: number;
  floors: number;
  basements: number;
  type: BuildingType;
  tier: Tier;
}

export type AppMode = "building" | "floor";

export type AppEvent = "result" | "mode" | "floor" | "selection" | "path" | "busy";

export interface AppState {
  params: AppParams;
  result: InteriorResult | null;
  mode: AppMode;
  floorIndex: number;
  selectedRoom: string | null;
  path: PathLeg[] | null;
  busy: boolean;

  on(event: AppEvent, cb: () => void): void;
  setParams(params: AppParams): void;
  setResult(result: InteriorResult): void;
  setMode(mode: AppMode): void;
  setFloor(index: number): void;
  selectRoom(roomId: string | null): void;
  setPath(path: PathLeg[] | null): void;
  setBusy(busy: boolean): void;
  floorData(): FloorInterior | undefined;
}

export function createAppState(): AppState {
  const listeners = new Map<AppEvent, (() => void)[]>();
  const emit = (event: AppEvent) => {
    for (const cb of listeners.get(event) ?? []) cb();
  };

  const state: AppState = {
    params: { seed: 1, floors: 12, basements: 1, type: "office", tier: "standard" },
    result: null,
    mode: "building",
    floorIndex: 0,
    selectedRoom: null,
    path: null,
    busy: false,

    on(event, cb) {
      listeners.set(event, [...(listeners.get(event) ?? []), cb]);
    },
    setParams(params) {
      state.params = params;
    },
    setResult(result) {
      state.result = result;
      state.selectedRoom = null;
      state.path = null;
      if (!result.floors.some((f) => f.floor === state.floorIndex)) state.floorIndex = 0;
      emit("result");
    },
    setMode(mode) {
      state.mode = mode;
      emit("mode");
    },
    setFloor(index) {
      state.floorIndex = index;
      state.selectedRoom = null;
      state.path = null;
      emit("floor");
    },
    selectRoom(roomId) {
      state.selectedRoom = roomId;
      emit("selection");
    },
    setPath(path) {
      state.path = path;
      emit("path");
    },
    setBusy(busy) {
      state.busy = busy;
      emit("busy");
    },
    floorData() {
      return state.result?.floors.find((f) => f.floor === state.floorIndex);
    },
  };
  return state;
}
