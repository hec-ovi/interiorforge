import { expect, it } from "vitest";
import { MeshBuilder } from "../../glb/mesh-builder.js";
import { makeFrame, worldToUv } from "../../layout/uv.js";
import type { PlanFurniture } from "../../layout/plan-types.js";
import { MaterialKeys } from "../materials.js";
import { emitOrnament } from "./index.js";

const examples = [
  ["rich", "ornament_wall", [2.6, .5, 2], "interior-leaf/rich"],
  ["rich", "room_divider", [1, .5, 1.5], "interior-leaf/rich"],
  ["poor", "ornament_wall", [3, .5, 2], "interior-paper/poor"],
  ["poor", "room_divider", [2.6, .5, 2], "interior-leaf-dry/poor"],
  ["mid", "ornament_wall", [1, .5, 1.5], "interior-led-cyan/mid"],
  ["mid", "room_divider", [3, .5, 2], "interior-led-cyan/mid"],
  ["mid", "sleeping_pod", [2.5, 1.5, 2], "fabric/mid#flat"],
] as const;

it.each(examples)("fits deterministic %s %s geometry and face normals to its envelope", (tier, kind, size, feature) => {
  const frame = makeFrame(31), elevation = 3;
  const item: PlanFurniture = { kind, id: `sample-${kind}`, room: "room", at: [5, 7], rotationDeg: 90, size: [...size] };
  const keys = new MaterialKeys("cyberpunk", tier), mesh = new MeshBuilder(), repeat = new MeshBuilder();
  emitOrnament(mesh, keys, item, frame, elevation);
  emitOrnament(repeat, keys, item, frame, elevation);
  expect(mesh.materials()).toContain(keys.door());
  expect(mesh.materials()).toContain(`cyberpunk/${feature}`);
  expect(mesh.materials()).toEqual(repeat.materials());
  const angle = item.rotationDeg * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  for (const material of mesh.materials()) {
    const group = mesh.getGroup(material)!;
    expect(group).toEqual(repeat.getGroup(material));
    const p = group.positions;
    for (let i = 0; i < p.length; i += 3) {
      const [u, v] = worldToUv([p[i]!, p[i + 2]!], frame), du = u - item.at[0], dv = v - item.at[1];
      expect(Math.abs(du * cos - dv * sin)).toBeLessThanOrEqual(item.size[0] / 2 + 1e-7);
      expect(Math.abs(du * sin + dv * cos)).toBeLessThanOrEqual(item.size[1] / 2 + 1e-7);
      expect(p[i + 1]).toBeGreaterThanOrEqual(elevation - 1e-7);
      expect(p[i + 1]).toBeLessThanOrEqual(elevation + item.size[2] + 1e-7);
    }
    for (let i = 0; i < group.indices.length; i += 3) {
      const a = group.indices[i]! * 3, b = group.indices[i + 1]! * 3, c = group.indices[i + 2]! * 3;
      const u = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
      const v = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
      const normal = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const area = Math.hypot(...normal);
      expect(area).toBeGreaterThan(1e-10);
      for (const offset of [a, b, c]) {
        const stored = Array.from(group.normals.slice(offset, offset + 3));
        expect(Math.hypot(...stored)).toBeCloseTo(1, 6);
        expect(normal.reduce((dot, value, axis) => dot + value * stored[axis]!, 0) / area).toBeCloseTo(1, 6);
      }
    }
  }
});

it("closes both pod entrance chamfers with complete triangular faces", () => {
  const mesh = new MeshBuilder(), keys = new MaterialKeys("cyberpunk", "mid");
  const item: PlanFurniture = { kind: "sleeping_pod", id: "pod", room: "room", at: [0, 0], rotationDeg: 0, size: [2.5, 1.5, 2] };
  emitOrnament(mesh, keys, item, makeFrame(0), 0);
  const group = mesh.getGroup(keys.panels.surface("wall"))!, p = group.positions;
  let area = 0;
  for (let i = 0; i < group.indices.length; i += 3) {
    const vertices = [0, 1, 2].map((n) => group.indices[i + n]! * 3);
    if (!vertices.every((n) => Math.abs(p[n + 2]! - .75) < 1e-9 && Math.abs(p[n]!) <= 1.14 + 1e-9
      && p[n + 1]! >= 1.66 - 1e-9 && p[n + 1]! <= 1.9 + 1e-9)) continue;
    const [a, b, c] = vertices as [number, number, number];
    const signed = (p[b]! - p[a]!) * (p[c + 1]! - p[a + 1]!) - (p[b + 1]! - p[a + 1]!) * (p[c]! - p[a]!);
    if (signed > 0) area += signed / 2;
  }
  expect(area).toBeCloseTo(2 * .24 * .24 / 2, 10);
});

it.each([
  ["ornament_wall", [.9, .5, 1.5]], ["room_divider", [1, .4, 1.5]],
  ["sleeping_pod", [2.5, 1.5, 1.9]], ["ornament_wall", [Infinity, .5, 2]],
] as const)("rejects invalid %s dimensions before appending geometry", (kind, size) => {
  const mesh = new MeshBuilder(), keys = new MaterialKeys("cyberpunk", "mid");
  const item: PlanFurniture = { kind, id: "invalid", room: "room", at: [0, 0], rotationDeg: 0, size: [...size] };
  expect(() => emitOrnament(mesh, keys, item, makeFrame(0), 0)).toThrow(RangeError);
  expect(mesh.isEmpty()).toBe(true);
});
