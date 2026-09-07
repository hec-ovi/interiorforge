import { expect, it } from "vitest";
import { MeshBuilder, type Vec3 } from "../../glb/mesh-builder.js";
import { ElevationSplitMesh } from "./elevation-split.js";

it("keeps complete sloped faces in their slab bands with joined cuts and interpolated UVs", () => {
  const lower = new MeshBuilder(), upper = new MeshBuilder();
  const split = new ElevationSplitMesh(lower, upper, 0, { cos: 1, sin: 0 }, [0, 0]);
  // The first cut produces a triangle and pentagon; the second produces two quads.
  for (const offset of [-.3, -1.3]) {
    const vertices: [Vec3, Vec3, Vec3, Vec3] = [[0, offset, 0], [0, offset + 2, 1],
      [1, offset + 2.7, 1], [1, offset + .7, 0]];
    split.addQuadUv("rail", vertices, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  }
  let area = 0;
  const boundary = [new Set<string>(), new Set<string>()];
  for (const [band, mesh] of [lower, upper].entries()) {
    const { positions: p, indices, normals: n, uvs } = mesh.getGroup("rail")!;
    for (let i = 0; i < p.length; i += 3) {
      expect(band === 0 ? p[i + 1]! <= 0 : p[i + 1]! >= 0).toBe(true);
      expect(uvs[i / 3 * 2]).toBeCloseTo(p[i]!, 12);
      expect(uvs[i / 3 * 2 + 1]).toBeCloseTo(p[i + 2]!, 12);
      expect(Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!)).toBeCloseTo(1, 12);
      expect(n[i + 1]).toBeGreaterThan(0);
      if (p[i + 1] === 0) boundary[band]!.add(`${p[i]!.toFixed(10)},${p[i + 2]!.toFixed(10)}`);
    }
    for (let i = 0; i < indices.length; i += 3) {
      const ids = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
      const points = ids.map(index => [p[index * 3]!, p[index * 3 + 1]!, p[index * 3 + 2]!] as Vec3);
      const a = points[1]!.map((v, j) => v - points[0]![j]!), b = points[2]!.map((v, j) => v - points[0]![j]!);
      const cross = [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
      const length = Math.hypot(...cross);
      expect(length).toBeGreaterThan(1e-12);
      for (const index of ids) for (let j = 0; j < 3; j++) expect(n[index * 3 + j]).toBeCloseTo(cross[j]! / length, 12);
      area += length / 2;
    }
  }
  expect(area).toBeCloseTo(2 * Math.sqrt(1 + .7 ** 2 + 2 ** 2), 12);
  // Cut tessellation can add midpoint vertices, but both original crossing endpoints must agree.
  const shared = [...boundary[0]!].filter(point => boundary[1]!.has(point));
  expect(shared.length).toBeGreaterThanOrEqual(4);
});
