import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { planBuilding } from "../layout/index.js";
import { writeGlb } from "../glb/io.js";
import { buildInterior } from "./index.js";
import { computeStairSteps } from "./stairs.js";
import { STAIR } from "../layout/constants.js";

describe("computeStairSteps", () => {
  const shaft = { u: 4, v: 11.5, lu: 6, lv: 2.5 };

  it("lands exactly on the next floor with legal risers, treads inside the shaft", () => {
    for (const climb of [2.6, 3.4, 4.0, 7.4, 11.8]) {
      const steps = computeStairSteps(shaft, false, 10, climb);
      const top = Math.max(...steps.map((s) => s.y));
      expect(top).toBeCloseTo(10 + climb, 6);
      const rises = steps.map((s) => s.y).toSorted((a, b) => a - b);
      const riser = (rises.at(-1)! - 10) / rises.length;
      expect(riser).toBeLessThanOrEqual(STAIR.riser + 1e-9);
      expect(riser).toBeGreaterThan(0.1);
      for (const s of steps) {
        expect(s.u).toBeGreaterThanOrEqual(shaft.u - 1e-6);
        expect(s.u + s.lu).toBeLessThanOrEqual(shaft.u + shaft.lu + 1e-6);
        expect(s.v).toBeGreaterThanOrEqual(shaft.v - 1e-6);
        expect(s.v + s.lv).toBeLessThanOrEqual(shaft.v + shaft.lv + 1e-6);
      }
    }
  });

  it("consecutive treads rise by at most one riser", () => {
    const steps = computeStairSteps(shaft, true, 0, 3.0).filter((s) => s.lu * s.lv < 2); // treads only
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.y - steps[i - 1]!.y).toBeLessThanOrEqual(STAIR.riser + 1e-9);
    }
  });
});

describe("buildInterior", () => {
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
