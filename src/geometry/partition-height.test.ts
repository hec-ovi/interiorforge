import { expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "../layout/index.js";
import { buildInteriorBands } from "./index.js";
import type { MeshBuilder } from "../glb/mesh-builder.js";

function topOf(mesh: MeshBuilder, material: string): number {
  const { positions, normals } = mesh.getGroup(material)!;
  let top = -Infinity;
  // Stair risers share the wall finish but have no upward cap in this material.
  for (let i = 1; i < positions.length; i += 3) if (normals[i]! > 0.99) top = Math.max(top, positions[i]!);
  return top;
}

it("ends partition finishes at the structural soffit beneath ordinary and double-height slabs", () => {
  const { request } = makeFixture({ seed: 8, width: 40, depth: 32, floors: 3, type: "residential", tier: "high_rich" });
  request.assignments = [{ floor: 0, kind: "lobby" }, { floor: 1, kind: "residence_studio", spans: 2 }];
  const plan = planBuilding(request, resolveAssignments(request));
  const skipFurnitureIdsByFloor = new Map(plan.floors.map(floor => [floor.floor, new Set(floor.furniture.map(item => item.id))]));
  const { floorMeshes } = buildInteriorBands(plan, request, { skipFurnitureIdsByFloor });
  for (const [floor, upper] of [[0, 0], [1, 2]]) {
    const slab = request.blueprint.floors.find(item => item.index === upper)!;
    const soffit = slab.elevation + slab.height - 0.15;
    const mesh = floorMeshes.get(floor!)!;
    for (const material of ["cyberpunk/interior-luxury-wall/rich", "cyberpunk/interior-luxury-timber/rich"]) {
      expect(topOf(mesh, material), `${floor}: ${material}`).toBeCloseTo(soffit, 5);
    }
  }
});

it("ends shaft enclosures in an unoccupied upper storey at its structural soffit", () => {
  const { request } = makeFixture({ seed: 8, width: 40, depth: 32, floors: 3, type: "residential", tier: "high_rich" });
  request.assignments = [{ floor: 0, kind: "lobby", spans: 2 }, { floor: 2, kind: "residence_studio" }];
  const plan = planBuilding(request, resolveAssignments(request));
  expect(plan.floors.find(floor => floor.floor === 1)!.rooms).toHaveLength(0);
  const { floorMeshes } = buildInteriorBands(plan, request);
  const upper = request.blueprint.floors.find(floor => floor.index === 1)!;
  expect(topOf(floorMeshes.get(1)!, "cyberpunk/concrete/high_rich")).toBeCloseTo(upper.elevation + upper.height - 0.15, 5);
});
