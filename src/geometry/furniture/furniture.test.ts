import { describe, expect, it } from "vitest";
import type { FurnitureKind } from "../../core/types.js";
import { MeshBuilder } from "../../glb/mesh-builder.js";
import type { PlanFurniture } from "../../layout/plan-types.js";
import { makeFrame } from "../../layout/uv.js";
import { MaterialKeys } from "../materials.js";
import { emitFurniture } from "./index.js";

const KINDS: FurnitureKind[] = [
  "desk", "office_chair", "meeting_table", "counter", "shelf", "sofa", "low_table",
  "bed_single", "bed_double", "wardrobe", "kitchen_block", "fridge", "dining_table", "chair",
  "toilet", "sink", "shower", "gym_machine", "bench", "reception_desk", "plant",
  "bar_counter", "stool", "display_rack", "wall_shelf", "display_screen", "wall_art",
];

const SIZE: Record<string, [number, number, number]> = {
  shelf: [1.8, 0.5, 2.0], bar_counter: [3.0, 0.65, 1.1], display_rack: [1.4, 0.6, 1.6],
};

function build(kind: FurnitureKind, rotationDeg: 0 | 90 = 0, angleDeg = 0): number {
  const mb = new MeshBuilder();
  const item: PlanFurniture = {
    id: `f-${kind}`, kind, room: "r", at: [10, 10], rotationDeg,
    size: SIZE[kind] ?? [1.0, 0.8, 0.9],
  };
  emitFurniture(mb, new MaterialKeys("cyberpunk", "mid"), [item], makeFrame(angleDeg), 0);
  return mb.materials().reduce((n, m) => n + mb.getGroup(m)!.positions.length / 3, 0);
}

describe("shaped furniture", () => {
  it("builds every kind as a shaped assembly", () => {
    for (const kind of KINDS) {
      const verts = build(kind);
      // a single box is 24 vertices; every piece is made of several
      expect(verts, `${kind} needs shaped geometry`).toBeGreaterThan(48);
    }
  });

  it("is identical whatever the parcel's rotation, and deterministic", () => {
    for (const kind of ["chair", "shelf", "counter"] as FurnitureKind[]) {
      expect(build(kind, 0, 37)).toBe(build(kind));
      expect(build(kind, 90)).toBe(build(kind));
      expect(build(kind)).toBe(build(kind));
    }
  });

  it("puts a piece where it is planned, at its own rotation", () => {
    const mb = new MeshBuilder();
    const item: PlanFurniture = {
      id: "f-1", kind: "dining_table", room: "r", at: [10, 4], rotationDeg: 0, size: [1.2, 0.8, 0.75],
    };
    emitFurniture(mb, new MaterialKeys("cyberpunk", "mid"), [item], makeFrame(0), 3);
    const group = mb.getGroup("cyberpunk/wood/mid")!;
    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];
    for (let i = 0; i < group.positions.length; i += 3) {
      xs.push(group.positions[i]!);
      ys.push(group.positions[i + 1]!);
      zs.push(group.positions[i + 2]!);
    }
    expect(Math.min(...xs)).toBeCloseTo(9.4, 6);
    expect(Math.max(...xs)).toBeCloseTo(10.6, 6);
    expect(Math.min(...zs)).toBeCloseTo(3.6, 6);
    expect(Math.max(...ys)).toBeCloseTo(3.75, 6); // the floor's elevation plus the table top
  });
});
