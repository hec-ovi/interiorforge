import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "../layout/index.js";
import { writeGlb } from "../glb/io.js";
import { buildInterior } from "./index.js";

/** Variants the interior may ask for: joint-free surface patterns, flat upholstery and lamp shapes. A
 *  texture whose module repeats (panel, slab, hex, bond) would cut mid-tile against rooms on
 *  the half-metre grid, so every grid the interior shows is geometry it placed itself. */
const ALLOWED_VARIANTS = new Set(["plain", "flat", "lamp", "strip"]);

describe("buildInterior", () => {
  it("asks for no tiling pattern that would cut against the room grid", () => {
    const fix = makeFixture({ seed: 5, floors: 6, basements: 1, facadeStyle: "curtain-wall" });
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    const { floorMeshes } = buildInterior(plan, fix.request, fix.shellDoc);
    const variants = new Set<string>();
    for (const [, mb] of floorMeshes) {
      for (const slot of mb.materials()) {
        const cut = slot.indexOf("#");
        if (cut >= 0) variants.add(slot.slice(cut + 1));
      }
    }
    expect(variants.size).toBeGreaterThan(0);
    for (const variant of variants) expect(ALLOWED_VARIANTS.has(variant)).toBe(true);
  });

  it("is byte-deterministic, replaces shell separators, uses only theme/kind/tier materials", async () => {
    const build = async () => {
      const fix = makeFixture({ seed: 8, floors: 6, basements: 1 });
      const plan = planBuilding(fix.request, resolveAssignments(fix.request));
      const { doc } = buildInterior(plan, fix.request, fix.shellDoc);
      return { doc, bytes: await writeGlb(doc) };
    };
    const a = await build();
    const b = await build();
    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);

    const nodes = a.doc.getRoot().listNodes().map((n) => n.getName());
    expect(nodes.some((n) => /^floor:-?\d+\/slab$/.test(n))).toBe(false);
    for (const m of a.doc.getRoot().listMaterials()) {
      expect(m.getName()).toMatch(/^[a-z0-9_-]+\/[a-z0-9_-]+\/[a-z0-9_-]+$/);
    }
  });

  it("carries one emissive lens in a separate plain housing for every light", () => {
    const fix = makeFixture({ seed: 8, floors: 4 });
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    const { doc } = buildInterior(plan, fix.request, fix.shellDoc);
    const lights = plan.floors.flatMap((f) => f.lights);
    expect(lights.length).toBeGreaterThan(0);
    const lightMeshes = doc.getRoot().listMeshes().filter((m) => m.getName().includes("/light-fixture/"));
    const lenses = lightMeshes
      .reduce((n, m) => n + m.listPrimitives().reduce((v, p) => v + p.getAttribute("POSITION")!.getCount(), 0), 0);
    expect(lenses).toBe(lights.length * 4);
    const metal = doc.getRoot().listMeshes().filter((m) => m.getName().includes("/metal/"));
    expect(metal.length).toBeGreaterThan(0);
    const lens = doc.getRoot().listMeshes().find((m) => m.getName().includes("/light-fixture/"))!;
    const uv = lens.listPrimitives()[0]!.getAttribute("TEXCOORD_0")!.getArray()!;
    expect(Math.min(...uv)).toBe(0);
    expect(Math.max(...uv)).toBe(1);
    const normals = lightMeshes.flatMap((mesh) => mesh.listPrimitives().flatMap((primitive) =>
      Array.from(primitive.getAttribute("NORMAL")!.getArray()!).filter((_, i) => i % 3 === 1)));
    expect(normals.some((y) => y === 1)).toBe(true);
    expect(normals.some((y) => y === -1)).toBe(true);
  });

  it("records continuous stair steps for every floor below the top", () => {
    const fix = makeFixture({ seed: 8, floors: 6 });
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    const { stepsByFloor } = buildInterior(plan, fix.request, fix.shellDoc);
    const served = plan.floors.filter((f) => f.rooms.length > 0);
    for (let i = 0; i < served.length - 1; i++) {
      const record = stepsByFloor.get(served[i]!.floor);
      expect(record, `floor ${served[i]!.floor} has stairs`).toBeTruthy();
      for (const steps of Object.values(record!)) {
        const top = Math.max(...steps.map((s) => s.y));
        expect(top).toBeCloseTo(served[i + 1]!.elevation, 6);
      }
    }
    expect(stepsByFloor.has(served.at(-1)!.floor)).toBe(false);
  });
});
