import { expect, it } from "vitest";
import { MeshBuilder } from "../../glb/mesh-builder.js";
import { makeFrame, worldToUv } from "../../layout/uv.js";
import type { PlanFurniture } from "../../layout/plan-types.js";
import { MaterialKeys } from "../materials.js";
import { emitFurniture } from "./index.js";

it("keeps loose furniture and refuse geometry inside their reserved footprint", () => {
  const frame = makeFrame(19), keys = new MaterialKeys("cyberpunk", "poor");
  const cases: [PlanFurniture["kind"], PlanFurniture["size"]][] = [
    ["office_chair", [.65, .65, 1.15]], ["desk", [1.6, .8, .75]], ["floor_clutter", [.8, .8, .8]],
  ];
  for (const [kind, size] of cases) {
    const item: PlanFurniture = { id: `test-${kind}`, kind, size, room: "room", at: [2, 3], rotationDeg: 90 };
    const mesh = new MeshBuilder(), repeat = new MeshBuilder();
    emitFurniture(mesh, keys, [item], frame, 5);
    emitFurniture(repeat, keys, [item], frame, 5);
    for (const material of mesh.materials()) {
      const group = mesh.getGroup(material)!;
      expect(group).toEqual(repeat.getGroup(material));
      for (let i = 0; i < group.positions.length; i += 3) {
        const [u, v] = worldToUv([group.positions[i]!, group.positions[i+2]!], frame);
        expect(Math.abs(u - 2)).toBeLessThanOrEqual(size[1] / 2 + 1e-7);
        expect(Math.abs(v - 3)).toBeLessThanOrEqual(size[0] / 2 + 1e-7);
        expect(group.positions[i+1]).toBeGreaterThanOrEqual(5 - 1e-7);
        if (kind === "floor_clutter") expect(group.positions[i+1]).toBeLessThanOrEqual(5 + size[2]);
      }
    }
  }
});
