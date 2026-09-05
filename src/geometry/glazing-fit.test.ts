import { describe, expect, it } from "vitest";
import type { Point } from "../core/geom.js";
import type { BlueprintFloor, Opening } from "../core/types.js";
import { readGlbBytes } from "../glb/io.js";
import { generateFloorInteriors, makeFixture } from "../index.js";

type Vertex = [number, number, number];
type Triangle = [Vertex, Vertex, Vertex];

/** Read each exported triangle in the selected facade's U, floor-relative Y, inward depth. */
async function facadeTriangles(glb: Uint8Array, floor: BlueprintFloor, opening: Opening): Promise<Triangle[]> {
  const a = floor.outline[opening.edge]!, b = floor.outline[(opening.edge + 1) % floor.outline.length]!;
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const direction: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  const doc = await readGlbBytes(glb);
  const triangles: Triangle[] = [];
  for (const node of doc.getRoot().listNodes()) {
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const positions = primitive.getAttribute("POSITION")!.getArray()!;
      const indices = primitive.getIndices()!.getArray()!;
      for (let i = 0; i < indices.length; i += 3) {
        triangles.push([0, 1, 2].map((offset): Vertex => {
          const k = indices[i + offset]! * 3;
          const x = positions[k]! - a[0], z = positions[k + 2]! - a[1];
          return [x * direction[0] + z * direction[1], positions[k + 1]! - floor.elevation,
            -x * direction[1] + z * direction[0]];
        }) as Triangle);
      }
    }
  }
  return triangles;
}

/** Depth intersections along the outward view ray, independent of triangle winding. */
function depthsAt(triangles: Triangle[], u: number, y: number): number[] {
  return triangles.flatMap(([a, b, c]) => {
    const divisor = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(divisor) < 1e-10) return [];
    const p = ((b[1] - c[1]) * (u - c[0]) + (c[0] - b[0]) * (y - c[1])) / divisor;
    const q = ((c[1] - a[1]) * (u - c[0]) + (a[0] - c[0]) * (y - c[1])) / divisor;
    if (p < -1e-7 || q < -1e-7 || p + q > 1 + 1e-7) return [];
    return [a[2] * p + b[2] * q + c[2] * (1 - p - q)];
  }).filter((depth) => depth >= 0 && depth < 0.4);
}

describe("fitted glazing lining", () => {
  it("closes the opaque perimeter, preserves the clear field and keeps returns behind the window housing", async () => {
    const source = makeFixture({ seed: 92, floors: 2, width: 40, depth: 24,
      rotationDeg: 35, type: "hotel", tier: "rich", facadeStyle: "curtain-wall", wallDepth: 0.23 });
    const blueprint = structuredClone(source.request.blueprint);
    const opening = blueprint.floors[0]!.openings.find((candidate) => candidate.kind === "window" && candidate.width > 2)!;
    opening.offset += 1;
    opening.width -= 2;
    opening.glazing = { offset: opening.offset + 0.055, sill: opening.sill + 0.055,
      width: opening.width - 0.11, height: opening.height - 1.11, glassDepth: 0.04, housingBackDepth: 0.13 };
    const fixture = makeFixture({ seed: 92, blueprint, type: "hotel", tier: "rich" });
    const result = await generateFloorInteriors(fixture.request, { shellDoc: fixture.shellDoc, textures: { mode: "keys" } });
    const floor = blueprint.floors[0]!, glass = opening.glazing;
    const triangles = await facadeTriangles(result.floorGlbs.get(0)!, floor, opening);
    const middle = glass.offset + glass.width * 0.43;
    const centerY = glass.sill + glass.height * 0.43;
    expect(depthsAt(triangles, middle, centerY)).toEqual([]);
    expect(depthsAt(triangles, middle, glass.sill + glass.height + 0.2).length).toBeGreaterThan(0);
    expect(depthsAt(triangles, glass.offset - 0.025, centerY).length).toBeGreaterThan(0);
    const revealVertices = triangles.flat().filter(([u, y, depth]) =>
      u > opening.offset + 0.01 && u < opening.offset + opening.width - 0.01
      && y >= opening.sill - 1e-6 && y <= opening.sill + opening.height + 1e-6
      && depth < 0.23 - 1e-5 && depth > 0);
    expect(revealVertices.length).toBeGreaterThan(0);
    expect(Math.min(...revealVertices.map((vertex) => vertex[2]))).toBeCloseTo(glass.housingBackDepth, 5);
    expect(revealVertices.every(([u, y]) => u >= glass.offset - 1e-5 && u <= glass.offset + glass.width + 1e-5
      && y >= glass.sill - 1e-5 && y <= glass.sill + glass.height + 1e-5)).toBe(true);
  });
});
