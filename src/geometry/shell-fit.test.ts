import { describe, expect, it } from "vitest";
import { boundaryDistance, insetPolygon } from "../core/geom.js";
import type { Blueprint, BlueprintFloor } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { readGlbBytes } from "../glb/io.js";
import { generateInterior, makeFixture } from "../index.js";
import { SHELL_WALL, shellWallDepth } from "../layout/shell.js";
import { assertInsideShell } from "./shell-fit.js";

/** Reads the GLB back and measures every interior vertex against its floor's outline: the
 *  contract promise, checked on the real output rather than the builder. */
async function worstDepth(glb: Uint8Array, blueprint: Blueprint): Promise<{ wall: number; reveal: number }> {
  const doc = await readGlbBytes(glb);
  const worst = { wall: Infinity, reveal: Infinity };
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getName().startsWith("interior:")) continue;
    for (const prim of node.getMesh()!.listPrimitives()) {
      const pos = prim.getAttribute("POSITION")!.getArray()!;
      for (let i = 0; i < pos.length; i += 3) {
        const y = pos[i + 1]!;
        // a vertex on a floor boundary belongs to whichever floor reads it as inside
        const floors = blueprint.floors.filter((f) => y >= f.elevation - 0.15 - 1e-4 && y <= f.elevation + f.height + 1e-4);
        const d = Math.max(...floors.map((f) => boundaryDistance([pos[i]!, pos[i + 2]!], f.outline)));
        if (floors.some((f) => inOpening(pos[i]!, y, pos[i + 2]!, f))) worst.reveal = Math.min(worst.reveal, d);
        else worst.wall = Math.min(worst.wall, d);
      }
    }
  }
  return worst;
}

function inOpening(x: number, y: number, z: number, floor: BlueprintFloor): boolean {
  return floor.openings.some((o) => {
    const a = floor.outline[o.edge]!;
    const b = floor.outline[(o.edge + 1) % floor.outline.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t = ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / len;
    const h = y - floor.elevation;
    return t >= o.offset - 1e-4 && t <= o.offset + o.width + 1e-4 && h >= o.sill - 1e-4 && h <= o.sill + o.height + 1e-4;
  });
}

/** A real city parcel: long edges 45 degrees off axis, a 1.2 m chamfer and an acute corner. */
const SKEWED: [number, number][] = [
  [429.077, 336.47], [412.818, 365.681], [405.696, 361.925], [379.868, 342.18],
  [404.454, 317.471], [414.872, 327.786], [415.85, 328.546],
];

describe("shell fit", () => {
  const cases = [
    { name: "off-axis footprint", options: { seed: 3, floors: 3, basements: 1, rotationDeg: 45 } },
    { name: "curtain-wall shell", options: { seed: 5, floors: 3, type: "corpo" as const, tier: "rich" as const, facadeStyle: "curtain-wall" as const } },
    { name: "acute-cornered parcel", options: { seed: 7, floors: 2, basements: 1, type: "restaurant" as const, tier: "high_rich" as const, facadeStyle: "glass" as const, outline: SKEWED } },
    { name: "deep megablock reveals", options: { seed: 9, floors: 3, type: "residential" as const, tier: "poor" as const, facadeStyle: "megablock" as const } },
  ];
  for (const { name, options } of cases) {
    it(`${name}: every vertex stays behind the shell wall, reveals behind the skin`, async () => {
      const fix = makeFixture(options);
      const result = await generateInterior(fix.request, { shellDoc: fix.shellDoc, textures: { mode: "keys" } });
      const depth = shellWallDepth(fix.request.blueprint.facade);
      const worst = await worstDepth(result.glb, fix.request.blueprint);
      expect(worst.wall).toBeGreaterThanOrEqual(depth - 1e-4);
      expect(worst.reveal).toBeGreaterThanOrEqual(SHELL_WALL.skinClear - 1e-4);
      expect(worst.reveal).toBeLessThan(depth);
    });
  }

  it("a blueprint carrying facade.wallDepth is read at that depth, ahead of the style table", async () => {
    const fix = makeFixture({ seed: 11, floors: 2, facadeStyle: "panel", wallDepth: 0.175 });
    expect(shellWallDepth(fix.request.blueprint.facade)).toBe(0.175);
    const result = await generateInterior(fix.request, { shellDoc: fix.shellDoc, textures: { mode: "keys" } });
    const worst = await worstDepth(result.glb, fix.request.blueprint);
    expect(worst.wall).toBeGreaterThanOrEqual(0.175 - 1e-4);
    expect(worst.wall).toBeLessThan(SHELL_WALL.depth.panel!);
  });

  it("a vertex on the wall plane is E_SHELL_BREACH, never shipped", () => {
    const floor: BlueprintFloor = { index: 0, kind: "lobby", elevation: 0, height: 3, outline: [[0, 0], [10, 0], [10, 8], [0, 8]], openings: [] };
    const mb = new MeshBuilder();
    mb.addBox("x/wall/mid", { x: 4, z: 7.9, w: 1, d: 0.1 }, 0, 2);
    expect(() => assertInsideShell(mb, [floor], 0.3)).toThrow(expect.objectContaining({ code: "E_SHELL_BREACH", floor: 0 }));
  });

  it("insetPolygon collapses a chamfer the offset folds over", () => {
    const chamfered: [number, number][] = [[0, 0], [9.7, 0], [10, 0.3], [10, 8], [0, 8]];
    const plate = insetPolygon(chamfered, 0.6);
    expect(plate.length).toBe(4);
    for (const p of plate) expect(boundaryDistance(p, chamfered)).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });
});
