import { expect, it } from "vitest";
import type { Point } from "../../core/geom.js";
import { roomFootprintContains } from "../../core/room-footprint.js";
import { MeshBuilder } from "../../glb/mesh-builder.js";
import type { PlanRoom } from "../../layout/plan-types.js";
import { makeFrame, uvRectCorners, worldToUv } from "../../layout/uv.js";
import { MaterialKeys } from "../materials.js";
import { emitServices } from "./services.js";

it.each(["poor", "mid"])("fits every %s service vertex to the upper outline with overhead clearance", (tier) => {
  const alongU = tier === "poor", frame = makeFrame(31), base = 3, ceiling = base + 2.9;
  // This residual run ends 10 mm beyond a sleeve's center, requiring the final sleeve to be omitted.
  const room: PlanRoom = { id: "service-room", kind: "office_open", doors: [],
    rect: { u: 0, v: 0, lu: alongU ? 3.69 : 3, lv: alongU ? 3 : 3.69 } };
  const upperOutline = uvRectCorners({ u: .5, v: .5, lu: alongU ? 2.69 : .65, lv: alongU ? .65 : 2.69 });
  const mesh = new MeshBuilder(), keys = new MaterialKeys("cyberpunk", tier);
  emitServices(mesh, keys, [room], frame, base, ceiling, upperOutline);
  expect(mesh.isEmpty()).toBe(false);
  expect(mesh.materials()).toContain(tier === "poor" ? keys.door() : keys.trim());
  for (const material of mesh.materials()) {
    const positions = mesh.getGroup(material)!.positions;
    for (let i = 0; i < positions.length; i += 3) {
      const uv = worldToUv([positions[i]!, positions[i + 2]!], frame);
      expect(roomFootprintContains({ polygon: upperOutline }, uv), `${material} leaves the upper plate`).toBe(true);
      expect(positions[i + 1]).toBeGreaterThanOrEqual(base + 2.1);
      expect(positions[i + 1]).toBeLessThanOrEqual(ceiling + 1e-8);
    }
  }
});

it("omits bands crossed by an upper setback or concave notch", () => {
  const room: PlanRoom = { id: "double-height", kind: "living", doors: [], rect: { u: 0, v: 0, lu: 7, lv: 3 } };
  const setback: Point[] = [[0, 0], [6, 0], [6, 3], [0, 3]];
  const notched: Point[] = [[0, 0], [7, 0], [7, 3], [3.1, 3], [3.1, .7], [2.9, .7], [2.9, 3], [0, 3]];
  const corners = uvRectCorners({ u: .5, v: .5, lu: 6, lv: .65 });
  expect(corners.every(point => roomFootprintContains({ polygon: notched }, point))).toBe(true);
  for (const upperOutline of [setback, notched]) {
    const mesh = new MeshBuilder();
    emitServices(mesh, new MaterialKeys("cyberpunk", "poor"), [room], makeFrame(19), 4, 9, upperOutline);
    expect(mesh.isEmpty()).toBe(true);
  }
});

it("omits exposed services from luxury and low rooms", () => {
  const room: PlanRoom = { id: "room", kind: "corridor", doors: [], rect: { u: 0, v: 0, lu: 7, lv: 3 } };
  for (const [tier, height] of [["rich", 3.2], ["poor", 2.8]] as const) {
    const mesh = new MeshBuilder();
    emitServices(mesh, new MaterialKeys("cyberpunk", tier), [room], makeFrame(0), 0, height, uvRectCorners(room.rect));
    expect(mesh.isEmpty()).toBe(true);
  }
});
