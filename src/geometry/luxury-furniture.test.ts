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

it("exports closed luxury upholstery and bronze supports inside the seating reservation", () => {
  const keys = new MaterialKeys("cyberpunk", "high_rich");
  const items: PlanFurniture[] = [
    { id: "sofa", kind: "sofa", room: "r", at: [0, 0], rotationDeg: 90, size: [3.5, 1.05, 0.9] },
    { id: "chair", kind: "chair", room: "r", at: [0, 0], rotationDeg: 0, size: [0.8, 0.85, 0.95] },
    { id: "stool", kind: "stool", room: "r", at: [0, 0], rotationDeg: 0, size: [0.45, 0.45, 0.8] },
  ];
  for (const item of items) {
    const mesh = new PanelMeshBuilder(keys.panels);
    emitFurniture(mesh, keys, [item], makeFrame(0), 0);
    expect(mesh.materials()).toContain("cyberpunk/interior-bronze/rich");
    const [width, depth] = item.rotationDeg ? [item.size[1], item.size[0]] : item.size;
    for (const material of mesh.materials()) {
      const { positions } = mesh.getGroup(material)!;
      for (let i = 0; i < positions.length; i += 3) {
        expect(Math.abs(positions[i]!)).toBeLessThanOrEqual(width / 2 + 1e-7);
        expect(Math.abs(positions[i + 2]!)).toBeLessThanOrEqual(depth / 2 + 1e-7);
        expect(positions[i + 1]!).toBeGreaterThanOrEqual(-1e-7);
        expect(positions[i + 1]!).toBeLessThanOrEqual(item.size[2] + 1e-7);
      }
    }
    const { positions, normals, indices } = mesh.getGroup(keys.furniture("fabric"))!;
    expect(Array.from(normals).every(Number.isFinite)).toBe(true);
    expect(Array.from(normals).some(value => Math.abs(value) > 0.2 && Math.abs(value) < 0.8)).toBe(true);
    const vertex = (index: number) => [positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!] as const;
    const point = (index: number): string => vertex(index).map(value => Math.round(value * 1e7)).join(",");
    const edges = new Map<string, [number, number]>();
    let signedVolume = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
      for (let edge = 0; edge < 3; edge++) {
        const from = point(triangle[edge]!), to = point(triangle[(edge + 1) % 3]!);
        expect(from).not.toBe(to);
        const key = [from, to].sort().join("|");
        const pair = edges.get(key) ?? [0, 0];
        pair[from < to ? 0 : 1]++;
        edges.set(key, pair);
      }
      const a = vertex(triangle[0]!), b = vertex(triangle[1]!), c = vertex(triangle[2]!);
      const cross = [
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ];
      expect(Math.hypot(...cross)).toBeGreaterThan(1e-12);
      for (const index of triangle) {
        expect(cross.reduce((dot, value, axis) => dot + value * normals[index * 3 + axis]!, 0)).toBeGreaterThan(0);
      }
      signedVolume += cross.reduce((volume, value, axis) => volume + a[axis]! * value, 0);
    }
    // Separate closed cushions can share edges; every incidence still needs an opposite mate.
    expect(Array.from(edges.values()).every(([forward, reverse]) => forward > 0 && forward === reverse)).toBe(true);
    expect(signedVolume).toBeGreaterThan(0);
  }
});
