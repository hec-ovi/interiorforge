import { expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "../layout/index.js";
import { buildInteriorBands } from "./index.js";

it.each(["poor", "mid", "rich"] as const)("keeps deep %s opening returns on their published jamb and head planes", (tier) => {
  const { request } = makeFixture({ seed: "deep-opening-return", floors: 1, outline: [[0, 0], [28, 0], [28, 20], [0, 20]], type: "commerce", tier });
  const floor = request.blueprint.floors[0]!;
  floor.height = 4.5;
  request.blueprint.facade = { ...request.blueprint.facade, wallDepth: .52 };
  floor.openings = [
    { id: "entrance", kind: "door", edge: 1, offset: 4, width: 3, height: 3.5, sill: 0, leaves: 3,
      material: `cyberpunk/door/${tier}` },
    { id: "deep-window", kind: "window", edge: 1, offset: 10, width: 5, height: 3, sill: .5,
      glazing: { offset: 10.1, width: 4.8, sill: .6, height: 2.7, glassDepth: .015, housingBackDepth: .02 },
      material: `cyberpunk/window-glass/${tier}` },
  ];
  const plan = planBuilding(request, resolveAssignments(request));
  const mesh = buildInteriorBands(plan, request).floorMeshes.get(0)!;
  const a = floor.outline[1]!, b = floor.outline[2]!;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / length, dz = (b[1] - a[1]) / length;
  const openings = [{ left: 4.01, right: 6.99, bottom: 0, top: 3.49 }, { left: 10.1, right: 14.9, bottom: .6, top: 3.3 }];
  const surfaces = openings.map(() => new Set<string>());
  for (const material of mesh.materials()) {
    const { positions, indices, normals, uvs } = mesh.getGroup(material)!;
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
      const vertices = ids.map(index => {
        const x = positions[index * 3]! - a[0], z = positions[index * 3 + 2]! - a[1];
        return { t: x * dx + z * dz, depth: -x * dz + z * dx, y: positions[index * 3 + 1]! };
      });
      // Only return faces reach between the shell skin and its inner attachment plane.
      if (!vertices.some(vertex => vertex.depth < .5) || vertices.some(vertex => vertex.depth < .0199 || vertex.depth > .5201)) continue;
      const which = openings.findIndex(opening => vertices.every(vertex => vertex.t >= opening.left - 1e-4 && vertex.t <= opening.right + 1e-4));
      if (which < 0) continue;
      const opening = openings[which]!;
      const planes = { left: (v: typeof vertices[number]) => v.t - opening.left, right: (v: typeof vertices[number]) => v.t - opening.right,
        bottom: (v: typeof vertices[number]) => v.y - opening.bottom, top: (v: typeof vertices[number]) => v.y - opening.top };
      const plane = Object.entries(planes).find(([, distance]) => vertices.every(vertex => Math.abs(distance(vertex)) < 1e-4));
      expect(plane, `${material} return leaves its opening plane: ${JSON.stringify(vertices)}`).toBeDefined();
      surfaces[which]!.add(plane![0]);
      for (const index of ids) expect(Math.hypot(normals[index * 3]!, normals[index * 3 + 1]!, normals[index * 3 + 2]!)).toBeCloseTo(1, 6);
      for (let edge = 0; edge < 3; edge++) {
        const from = ids[edge]!, to = ids[(edge + 1) % 3]!;
        const physical = Math.hypot(...[0, 1, 2].map(axis => positions[to * 3 + axis]! - positions[from * 3 + axis]!));
        const mapped = Math.hypot(uvs[to * 2]! - uvs[from * 2]!, uvs[to * 2 + 1]! - uvs[from * 2 + 1]!);
        expect(mapped).toBeCloseTo(physical, 5);
      }
    }
  }
  for (const faces of surfaces) expect([...faces].sort()).toEqual(["bottom", "left", "right", "top"]);
}, 30_000);
