// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getByRole, findByText, waitFor } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { mountApp } from "./main.js";
import type { FloorSlice, Viewer3D } from "./views/viewer3d.js";

function fakeViewer(): Viewer3D & { glb: Uint8Array | null; slice: FloorSlice | null } {
  const el = document.createElement("div");
  return {
    el,
    glb: null,
    slice: null,
    async setGlb(bytes: Uint8Array) {
      this.glb = bytes;
    },
    setFloorSlice(slice: FloorSlice | null) {
      this.slice = slice;
    },
  };
}

async function mountAndGenerate() {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  document.body.append(root);
  const viewer = fakeViewer();
  const state = mountApp(root, viewer);
  const user = userEvent.setup();

  const seed = root.querySelector<HTMLInputElement>('input[name="seed"]')!;
  await user.clear(seed);
  await user.type(seed, "6");
  const floors = root.querySelector<HTMLInputElement>('input[name="floors"]')!;
  await user.clear(floors);
  await user.type(floors, "5");
  await user.click(getByRole(root, "button", { name: "generate" }));
  await waitFor(() => expect(state.result).not.toBeNull(), { timeout: 15000 });
  return { root, viewer, state, user };
}

describe("preview ui", () => {
  it("generates a building from the controls and hands the GLB to the viewer", async () => {
    const { root, viewer, state } = await mountAndGenerate();
    expect(viewer.glb).toBeInstanceOf(Uint8Array);
    expect(viewer.glb!.length).toBeGreaterThan(1000);
    const floorSelect = root.querySelector<HTMLSelectElement>('select[name="floor"]')!;
    expect(floorSelect.options.length).toBe(state.result!.floors.length);
    await findByText(root, /floor 0: lobby/);
  }, 30000);

  it("floor editor mode shows the plan, slices the 3D view, and inspects a clicked room", async () => {
    const { root, viewer, state, user } = await mountAndGenerate();
    await user.click(getByRole(root, "button", { name: "floor editor" }));
    expect(viewer.slice).not.toBeNull();
    expect(viewer.slice!.y0).toBeLessThan(state.floorData()!.elevation);

    const roomShapes = root.querySelectorAll("[data-room]");
    expect(roomShapes.length).toBe(state.floorData()!.rooms.length);
    await user.click(roomShapes[roomShapes.length - 1]!);
    expect(state.selectedRoom).not.toBeNull();
    const selected = state.floorData()!.rooms.find((r) => r.id === state.selectedRoom)!;
    await findByText(root, new RegExp(`${selected.id}: ${selected.kind}`));
  }, 30000);

  it("two plan clicks draw a walk path on the current floor", async () => {
    const { root, state, user } = await mountAndGenerate();
    await user.click(getByRole(root, "button", { name: "floor editor" }));
    const svg = root.querySelector<SVGSVGElement>("svg.plan-svg")!;
    // jsdom has no layout: give the svg a real box so click coordinates resolve
    svg.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });

    const vb = svg.viewBox.baseVal;
    const clickAt = async (wx: number, wz: number) => {
      const cx = ((wx - vb.x) / vb.width) * 300;
      const cz = ((wz - vb.y) / vb.height) * 300;
      svg.dispatchEvent(new MouseEvent("click", { clientX: cx, clientY: cz, bubbles: true, shiftKey: true }));
      await Promise.resolve();
    };
    // two points inside the corridor band of the fixture floor
    const corridor = state.floorData()!.rooms.find((r) => r.kind === "elevator_lobby" || r.kind === "corridor")!;
    const xs = corridor.polygon.map((p) => p[0]);
    const zs = corridor.polygon.map((p) => p[1]);
    const midZ = (Math.min(...zs) + Math.max(...zs)) / 2;
    await clickAt(Math.min(...xs) + 1, midZ);
    await clickAt(Math.max(...xs) - 1, midZ);

    await waitFor(() => expect(state.path).not.toBeNull());
    expect(root.querySelector("polyline.path")).not.toBeNull();
    await findByText(root, /path found/);
  }, 30000);
});
