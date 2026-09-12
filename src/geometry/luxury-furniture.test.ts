import { expect, it } from "vitest";
import type { PlanFurniture } from "../layout/plan-types.js";
import { makeFrame } from "../layout/uv.js";
import { emitFurniture } from "./furniture/index.js";
import { MaterialKeys } from "./materials.js";
import { PanelMeshBuilder } from "./panels/panel-mesh.js";

it("builds luxury stone and walnut furniture within its planned footprint", () => {
  const keys = new MaterialKeys("cyberpunk", "high_rich");
  const items: PlanFurniture[] = [
    { id: "table", kind: "low_table", room: "r", at: [0, 0], rotationDeg: 0, size: [1.9, 1.1, 0.4] },
    { id: "island", kind: "bar_counter", room: "r", at: [0, 0], rotationDeg: 90, size: [3.5, 0.9, 1.1] },
  ];
  for (const item of items) {
    const mesh = new PanelMeshBuilder(keys.panels);
    emitFurniture(mesh, keys, [item], makeFrame(0), 0);
    expect(mesh.materials()).toContain("cyberpunk/interior-luxury-floor/rich");
    expect(mesh.materials()).toContain("cyberpunk/interior-luxury-timber/rich");
    const [width, depth] = item.rotationDeg ? [item.size[1], item.size[0]] : item.size;
    for (const material of mesh.materials()) {
      const positions = mesh.getGroup(material)!.positions;
      for (let i = 0; i < positions.length; i += 3) {
        expect(Math.abs(positions[i]!)).toBeLessThanOrEqual(width / 2 + 1e-7);
        expect(Math.abs(positions[i + 2]!)).toBeLessThanOrEqual(depth / 2 + 1e-7);
      }
    }
  }
  expect(keys.accent("studio_main")).toBe("cyberpunk/interior-luxury-timber/rich");
});
