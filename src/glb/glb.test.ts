import { describe, expect, it } from "vitest";
import { MeshBuilder } from "./mesh-builder.js";
import { createDocument, readGlbBytes, sceneBounds, writeGlb } from "./io.js";

function faceNormalsOf(group: {
  positions: ArrayLike<number>; normals: ArrayLike<number>; indices: ArrayLike<number>;
}) {
  const out: [number, number, number][] = [];
  for (let i = 0; i < group.indices.length; i += 3) {
    const [a, b, c] = [group.indices[i]!, group.indices[i + 1]!, group.indices[i + 2]!];
    const p = (k: number): [number, number, number] => [
      group.positions[k * 3]!, group.positions[k * 3 + 1]!, group.positions[k * 3 + 2]!,
    ];
    const [ax, ay, az] = p(a);
    const [bx, by, bz] = p(b);
    const [cx, cy, cz] = p(c);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    out.push([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
  }
  return out;
}

describe("MeshBuilder", () => {
  it("addBox winds every face outward", () => {
    const mb = new MeshBuilder();
    mb.addBox("t/concrete/std", { x: 0, z: 0, w: 2, d: 3 }, 0, 1);
    const g = mb.getGroup("t/concrete/std")!;
    const center = [1, 0.5, 1.5];
    faceNormalsOf(g).forEach((n, i) => {
      const tri = i * 3;
      const v = g.indices[tri]! * 3;
      const toFace = [
        g.positions[v]! - center[0]!,
        g.positions[v + 1]! - center[1]!,
        g.positions[v + 2]! - center[2]!,
      ];
      const dot = n[0] * toFace[0]! + n[1] * toFace[1]! + n[2] * toFace[2]!;
      expect(dot).toBeGreaterThan(0);
    });
  });

  it("horizontal polygons face the declared direction, including non-convex outlines", () => {
    const mb = new MeshBuilder();
    const lShape: [number, number][] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    mb.addHorizontalPolygon("t/wood/std", lShape, 1, "up");
    mb.addHorizontalPolygon("t/plaster/std", lShape, 3, "down");
    for (const n of faceNormalsOf(mb.getGroup("t/wood/std")!)) expect(n[1]).toBeGreaterThan(0);
    for (const n of faceNormalsOf(mb.getGroup("t/plaster/std")!)) expect(n[1]).toBeLessThan(0);
    expect(mb.getGroup("t/wood/std")!.indices.length).toBe((lShape.length - 2) * 3);
  });

  it("wall UVs are world meters: u spans the wall length, v the height", () => {
    const mb = new MeshBuilder();
    mb.addQuad("t/wall/std", [[0, 0, 0], [0, 2.5, 0], [4, 2.5, 0], [4, 0, 0]]);
    const g = mb.getGroup("t/wall/std")!;
    const us = [g.uvs[0]!, g.uvs[2]!, g.uvs[4]!, g.uvs[6]!];
    const vs = [g.uvs[1]!, g.uvs[3]!, g.uvs[5]!, g.uvs[7]!];
    expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(4);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2.5);
  });

  it("seal compacts completed groups and rejects later geometry", () => {
    const mb = new MeshBuilder();
    mb.addBox("t/concrete/std", { x: 0, z: 0, w: 2, d: 3 }, 0, 1);
    mb.seal();
    const group = mb.getGroup("t/concrete/std")!;
    expect(group.positions).toBeInstanceOf(Float32Array);
    expect(group.indices).toBeInstanceOf(Uint32Array);
    expect(() => mb.addBox("t/concrete/std", { x: 0, z: 0, w: 1, d: 1 }, 0, 1))
      .toThrow("cannot add geometry to a sealed mesh");
  });
});

describe("MeshBuilder unit faces", () => {
  it("a unit-mapped side face reads left to right and upright from its front", () => {
    const mb = new MeshBuilder();
    mb.addPrism("screen", [[0, 0], [2, 0], [2, 1], [0, 1]], 0, 1, "unit", "none");
    const g = mb.getGroup("screen")!;
    for (let q = 0; q < 4; q++) {
      const v = (i: number) => g.positions.slice((q * 4 + i) * 3, (q * 4 + i) * 3 + 3);
      const n = g.normals.slice(q * 4 * 3, q * 4 * 3 + 3);
      const u = (i: number) => g.uvs[(q * 4 + i) * 2]!;
      // the viewer's right when facing this side: up x normal
      const right = [n[2]!, 0, -n[0]!];
      const along = (i: number, j: number) => (v(j)[0]! - v(i)[0]!) * right[0]! + (v(j)[2]! - v(i)[2]!) * right[2]!;
      expect(Math.sign(u(3) - u(0))).toBe(Math.sign(along(0, 3)));
      expect(u(1) - u(0)).toBe(0);
      // glTF: v grows downward, so the top vertex (index 1) carries v 0 and the bottom (index 0) v 1
      const vAt = (i: number) => g.uvs[(q * 4 + i) * 2 + 1]!;
      expect(vAt(1)).toBe(0);
      expect(vAt(0)).toBe(1);
    }
  });
});

describe("glb io", () => {
  it("writes a GLB that reads back with material names and bounds intact, byte-identically", async () => {
    const build = (sealed = false) => {
      const mb = new MeshBuilder();
      mb.addBox("theme/concrete/poor", { x: 0, z: 0, w: 10, d: 8 }, 0, 3);
      mb.addHorizontalPolygon("theme/wood/rich", [[0, 0], [10, 0], [10, 8], [0, 8]], 0.02, "up");
      if (sealed) mb.seal();
      return createDocument(mb);
    };
    const bytes1 = await writeGlb(build());
    const bytes2 = await writeGlb(build());
    const sealedBytes = await writeGlb(build(true));
    expect(Buffer.from(bytes1).equals(Buffer.from(bytes2))).toBe(true);
    expect(Buffer.from(bytes1).equals(Buffer.from(sealedBytes))).toBe(true);

    const doc = await readGlbBytes(bytes1);
    const names = doc.getRoot().listMaterials().map((m) => m.getName()).toSorted();
    expect(names).toEqual(["theme/concrete/poor", "theme/wood/rich"]);
    const { min, max } = sceneBounds(doc);
    expect(min[1]).toBeCloseTo(0);
    expect(max).toEqual([10, 3, 8]);
  });
});
