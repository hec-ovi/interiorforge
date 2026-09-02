import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "../layout/index.js";
import { writeGlb } from "../glb/io.js";
import { buildInterior } from "./index.js";

/** Variants the interior may ask for: joint-free surface patterns and the lamp shapes. A
 *  texture whose module repeats (panel, slab, hex, bond) would cut mid-tile against rooms on
 *  the half-metre grid, so every grid the interior shows is geometry it placed itself. */
const ALLOWED_VARIANTS = new Set(["plain", "lamp", "strip"]);

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

  it("carries an emissive housing for every published light fixture", () => {
    const fix = makeFixture({ seed: 8, floors: 4 });
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    const { doc } = buildInterior(plan, fix.request, fix.shellDoc);
    const lights = plan.floors.reduce((n, f) => n + f.lights.length, 0);
    expect(lights).toBeGreaterThan(0);
    const housings = doc.getRoot().listMeshes()
      .filter((m) => m.getName().includes("/light-fixture/"))
      .reduce((n, m) => n + m.listPrimitives().reduce((v, p) => v + p.getAttribute("POSITION")!.getCount(), 0), 0);
    // one box per fixture: 6 quads of 4 vertices
    expect(housings).toBe(lights * 24);
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
