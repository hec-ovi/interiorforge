import { describe, expect, it } from "vitest";
import { boundaryDistance, insetPolygon } from "../core/geom.js";
import type { Blueprint, BlueprintFloor, Opening } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { readGlbBytes } from "../glb/io.js";
import { generateInterior, makeFixture } from "../index.js";
import { SHELL_WALL, shellWallDepth } from "../layout/shell.js";
import cityP53 from "./fixtures/city-p53.blueprint.json" with { type: "json" };
import { assertInsideShell, edgeFrame, openingHole } from "./shell-fit.js";

/** Reads the GLB back and measures every interior vertex against its floor's outline: the
 *  contract promise, checked on the real output rather than the builder. `wall` is the depth
 *  of the closest vertex outside any opening, `reveal` the closest inside one, `corner` how
 *  far a reveal vertex keeps from the other edges' walls. */
async function worstDepth(glb: Uint8Array, blueprint: Blueprint): Promise<{ wall: number; reveal: number; corner: number }> {
  const doc = await readGlbBytes(glb);
  const worst = { wall: Infinity, reveal: Infinity, corner: Infinity };
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getName().startsWith("interior:")) continue;
    for (const prim of node.getMesh()!.listPrimitives()) {
      const pos = prim.getAttribute("POSITION")!.getArray()!;
      for (let i = 0; i < pos.length; i += 3) {
        const p: [number, number] = [pos[i]!, pos[i + 2]!];
        const y = pos[i + 1]!;
        // a vertex on a floor boundary belongs to whichever floor reads it as inside
        const floors = blueprint.floors.filter((f) => y >= f.elevation - 0.15 - 1e-4 && y <= f.elevation + f.height + 1e-4);
        const d = Math.max(...floors.map((f) => boundaryDistance(p, f.outline)));
        const holes = floors.flatMap((f) => f.openings.filter((o) => inOpening(p, y, f, o)).map((o) => ({ f, o })));
        if (holes.length === 0) {
          worst.wall = Math.min(worst.wall, d);
          continue;
        }
        worst.reveal = Math.min(worst.reveal, d);
        worst.corner = Math.min(worst.corner, Math.max(...holes.map(({ f, o }) => otherWallDepth(p, f.outline, o.edge))));
      }
    }
  }
  return worst;
}

function inOpening(p: [number, number], y: number, floor: BlueprintFloor, o: Opening): boolean {
  const f = edgeFrame(floor.outline, o.edge);
  const t = (p[0] - f.a[0]) * f.dir[0] + (p[1] - f.a[1]) * f.dir[1];
  const h = y - floor.elevation;
  return t >= o.offset - 1e-4 && t <= o.offset + o.width + 1e-4 && h >= o.sill - 1e-4 && h <= o.sill + o.height + 1e-4;
}

/** How deep `p` stands behind the closest other edge it lies in front of. */
function otherWallDepth(p: [number, number], outline: [number, number][], skip: number): number {
  let depth = Infinity;
  outline.forEach((_, k) => {
    if (k === skip) return;
    const f = edgeFrame(outline, k);
    const t = (p[0] - f.a[0]) * f.dir[0] + (p[1] - f.a[1]) * f.dir[1];
    if (t > 0 && t < f.len) depth = Math.min(depth, (p[0] - f.a[0]) * f.inward[0] + (p[1] - f.a[1]) * f.inward[1]);
  });
  return depth;
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
    // basement under a 59-degree apex, curtain-wall bays ending 0.11 m before it
    { name: "city parcel p53", options: { seed: "urbe-small:p53", type: "offices" as const, tier: "high_rich" as const, blueprint: cityP53 as unknown as Blueprint } },
  ];
  for (const { name, options } of cases) {
    it(`${name}: every vertex stays behind the shell wall, reveals behind the skin and out of the other walls`, async () => {
      const fix = makeFixture(options);
      const result = await generateInterior(fix.request, { shellDoc: fix.shellDoc, textures: { mode: "keys" } });
      const depth = shellWallDepth(fix.request.blueprint.facade);
      const worst = await worstDepth(result.glb, fix.request.blueprint);
      expect(worst.wall).toBeGreaterThanOrEqual(depth - 1e-4);
      expect(worst.reveal).toBeGreaterThanOrEqual(SHELL_WALL.skinClear - 1e-4);
      expect(worst.reveal).toBeLessThan(depth);
      expect(worst.corner).toBeGreaterThanOrEqual(depth - 1e-4);
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

  it("an opening's hole closes where its reveal would stand in the neighbouring wall", () => {
    // edge 0 runs 10 m from a right angle to a 60-degree apex
    const apex = 10 - 8 * Math.tan(Math.PI / 6);
    const floor: BlueprintFloor = {
      index: 0, kind: "lobby", elevation: 0, height: 3,
      outline: [[0, 0], [10, 0], [apex, 8], [0, 8]],
      openings: [{ id: "w", kind: "window", edge: 0, offset: 0.12, width: 9.76, height: 3, sill: 0 }],
    };
    const hole = openingHole(floor, floor.openings[0]!, 0.3);
    expect(hole.t0).toBeCloseTo(0.3, 6);
    expect(hole.t1).toBeCloseTo(10 - 0.3 / Math.tan(Math.PI / 6), 6);
  });

  it("an open front lining meets the fitted portal's exact clear dimensions", () => {
    const floor: BlueprintFloor = {
      index: 0, kind: "commerce", elevation: 0, height: 4,
      outline: [[0, 0], [18, 0], [18, 12], [0, 12]],
      openings: [{
        id: "open", kind: "openFront", edge: 0, offset: 3, width: 12, height: 3.5, sill: 0,
        portal: {
          frameWidth: 0.16, frameDepth: 0.1, recessDepth: 0.35,
          clearWidth: 11.68, clearHeight: 3.34, clearDepth: 0.35,
        },
        accessRole: "main",
      }],
    };
    const hole = openingHole(floor, floor.openings[0]!, 0.3);
    expect(hole).toEqual({ t0: 3.16, t1: 14.84, y0: 0, y1: 3.34 });
  });

  it("a vertex on the wall plane is E_SHELL_BREACH, never shipped", () => {
    const floor: BlueprintFloor = { index: 0, kind: "lobby", elevation: 0, height: 3, outline: [[0, 0], [10, 0], [10, 8], [0, 8]], openings: [] };
    const mb = new MeshBuilder();
    mb.addBox("x/wall/mid", { x: 4, z: 7.9, w: 1, d: 0.1 }, 0, 2);
    expect(() => assertInsideShell(mb, [floor], 0.3)).toThrow(expect.objectContaining({ code: "E_SHELL_BREACH", floor: 0 }));
  });

  it("a reveal standing in the next wall's depth is E_SHELL_BREACH", () => {
    const floor: BlueprintFloor = {
      index: 0, kind: "lobby", elevation: 0, height: 3, outline: [[0, 0], [10, 0], [10, 8], [0, 8]],
      openings: [{ id: "w", kind: "window", edge: 0, offset: 0.12, width: 2, height: 3, sill: 0 }],
    };
    // a reveal piece inside the window's opening, 0.05 m behind the skin, starting `x` from the side wall
    const reveal = (x: number) => {
      const mb = new MeshBuilder();
      mb.addBox("x/metal/mid", { x, z: 0.05, w: 0.5, d: 0.02 }, 0, 2);
      return () => assertInsideShell(mb, [floor], 0.3);
    };
    expect(reveal(0.15)).toThrow(expect.objectContaining({ code: "E_SHELL_BREACH" }));
    expect(reveal(0.3)).not.toThrow();
  });

  it("insetPolygon collapses a chamfer the offset folds over", () => {
    const chamfered: [number, number][] = [[0, 0], [9.7, 0], [10, 0.3], [10, 8], [0, 8]];
    const plate = insetPolygon(chamfered, 0.6);
    expect(plate.length).toBe(4);
    for (const p of plate) expect(boundaryDistance(p, chamfered)).toBeGreaterThanOrEqual(0.6 - 1e-9);
  });
});
