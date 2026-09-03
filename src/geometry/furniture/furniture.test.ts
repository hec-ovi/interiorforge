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

function mesh(kind: FurnitureKind, size: [number, number, number], rotationDeg: 0 | 90 = 0): MeshBuilder {
  const mb = new MeshBuilder();
  emitFurniture(mb, new MaterialKeys("cyberpunk", "mid"), [{
    id: `review-${kind}`, kind, room: "r", at: [0, 0], rotationDeg, size,
  }], makeFrame(0), 0);
  return mb;
}

function bounds(mb: MeshBuilder): { x: [number, number]; y: [number, number]; z: [number, number] } {
  const points = mb.materials().flatMap((material) => Array.from(mb.getGroup(material)!.positions));
  const xs: number[] = [], ys: number[] = [], zs: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    xs.push(points[i]!);
    ys.push(points[i + 1]!);
    zs.push(points[i + 2]!);
  }
  return { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)], z: [Math.min(...zs), Math.max(...zs)] };
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

  it("builds a fitted steel wardrobe inside its declared collision bounds", () => {
    const size: [number, number, number] = [1.6, 0.65, 2];
    const mb = mesh("wardrobe", size);
    expect(mb.materials()).toContain("cyberpunk/metal/mid");
    expect(mb.materials()).toContain("cyberpunk/door/mid");
    expect(mb.materials().some((material) => material.includes("/wood/"))).toBe(false);
    expect(bounds(mb)).toEqual({ x: [-0.8, 0.8], y: [0, 2], z: [-0.325, 0.325] });
  });

  it("uses one aspect-preserving screen family for displays and electronic art", () => {
    const cases: { kind: FurnitureKind; size: [number, number, number]; rotation: 0 | 90 }[] = [
      { kind: "display_screen", size: [1.2, 0.08, 0.7], rotation: 0 },
      { kind: "wall_art", size: [0.9, 0.06, 0.7], rotation: 90 },
    ];
    for (const { kind, size, rotation } of cases) {
      const mb = mesh(kind, size, rotation);
      expect(mb.materials().some((material) => material.includes("/wood/"))).toBe(false);
      const screen = mb.getGroup("cyberpunk/ad-screen/mid")!;
      const xs: number[] = [], ys: number[] = [], zs: number[] = [];
      for (let i = 0; i < screen.positions.length; i += 3) {
        xs.push(screen.positions[i]!);
        ys.push(screen.positions[i + 1]!);
        zs.push(screen.positions[i + 2]!);
      }
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      const aspect = span / (Math.max(...ys) - Math.min(...ys));
      expect(aspect).toBeCloseTo(size[0] / size[2], 6);
      const box = bounds(mb);
      expect(Math.max(box.x[1] - box.x[0], box.z[1] - box.z[0])).toBeCloseTo(size[0], 6);
      expect(Math.min(box.x[1] - box.x[0], box.z[1] - box.z[0])).toBeCloseTo(size[1], 6);

      // In local orientation, only the narrow mount reaches the rear plane, proving that its
      // volume stays distinct from the casing.
      const straight = mesh(kind, size);
      const metal = straight.getGroup("cyberpunk/metal/mid")!;
      const rearX: number[] = [], rearY: number[] = [];
      for (let i = 0; i < metal.positions.length; i += 3) {
        if (Math.abs(metal.positions[i + 2]! + size[1] / 2) > 1e-6) continue;
        rearX.push(metal.positions[i]!);
        rearY.push(metal.positions[i + 1]!);
      }
      expect([Math.min(...rearX), Math.max(...rearX)]).toEqual([-0.14, 0.14]);
      expect([Math.min(...rearY), Math.max(...rearY)]).toEqual([size[2] * 0.3, size[2] * 0.7]);
    }
  });
});
