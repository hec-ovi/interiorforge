import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { STAIR, stairSlab } from "../layout/constants.js";
import { planBuilding } from "../layout/index.js";
import type { RunStep, UvStep } from "./stairs.js";
import {
  baseLanding, computeStairSteps, entryAtLowEnd, minHeadroom, stairClearWidth,
} from "./stairs.js";

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

  it("compact column shafts run their flights along v and land exactly", () => {
    const column = { u: 4, v: 11.5, lu: 2.5, lv: 6 };
    const steps = computeStairSteps(column, true, 0, 3.4);
    expect(Math.max(...steps.map((s) => s.y))).toBeCloseTo(3.4, 6);
    for (const s of steps) {
      expect(s.u).toBeGreaterThanOrEqual(column.u - 1e-6);
      expect(s.u + s.lu).toBeLessThanOrEqual(column.u + column.lu + 1e-6);
      expect(s.v).toBeGreaterThanOrEqual(column.v - 1e-6);
      expect(s.v + s.lv).toBeLessThanOrEqual(column.v + column.lv + 1e-6);
    }
    // treads are wider (across u) than deep (along v): the run follows the long dimension
    const treads = steps.filter((s) => s.lu * s.lv < 0.5);
    for (const t of treads) expect(t.lu).toBeGreaterThan(t.lv);
  });
});

/** The whole run of one stair, floor by floor, exactly as buildInterior lays it out. */
function wholeRun(fixture: ReturnType<typeof makeFixture>, which: "a" | "b"): RunStep[] {
  const plan = planBuilding(fixture.request, resolveAssignments(fixture.request));
  const core = plan.core;
  const shaft = which === "a" ? core.stairA : core.stairB!;
  const entryLow = entryAtLowEnd(core, which);
  const sorted = [...plan.floors].sort((a, b) => a.floor - b.floor);
  const lowest = sorted.find((f) => f.rooms.length > 0)!;
  const steps: RunStep[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const floor = sorted[i]!;
    if (floor.rooms.length === 0) continue;
    const target = sorted.slice(i + 1).find((f) => f.rooms.length > 0);
    const climb = target ? target.elevation - floor.elevation : 0;
    const slab = stairSlab(climb > 0 ? climb : floor.height);
    const uv: UvStep[] = [];
    if (floor === lowest) uv.push(baseLanding(shaft, entryLow, floor.elevation, climb));
    if (target) uv.push(...computeStairSteps(shaft, entryLow, floor.elevation, climb));
    steps.push(...uv.map((s) => ({ ...s, slab })));
  }
  return steps;
}

/** Rects that share an edge (or overlap) after a small tolerance: no gap to step over. */
function touches(a: RunStep, b: RunStep, eps = 0.03): boolean {
  return a.u - eps < b.u + b.lu && b.u - eps < a.u + a.lu && a.v - eps < b.v + b.lv && b.v - eps < a.v + a.lv;
}

describe("a stair the player fits through", () => {
  // varied storey heights (tall lobby, basement, tapering floors) exercise the whole run
  const fixture = makeFixture({ seed: 8, floors: 8, basements: 1 });

  for (const which of ["a", "b"] as const) {
    it(`stair-${which}: flights are at least ${STAIR.clearWidth}m clear and the run is continuous`, () => {
      const plan = planBuilding(fixture.request, resolveAssignments(fixture.request));
      const shaft = which === "a" ? plan.core.stairA : plan.core.stairB!;
      expect(shaft).toBeTruthy();
      expect(stairClearWidth(shaft)).toBeGreaterThanOrEqual(STAIR.clearWidth);

      const steps = wholeRun(fixture, which);
      const climbing = [...steps].sort((a, b) => a.y - b.y || a.u - b.u || a.v - b.v);
      expect(climbing.length).toBeGreaterThan(100);
      expect(climbing[0]!.y).toBeCloseTo(plan.floors.find((f) => f.rooms.length > 0)!.elevation, 6);
      for (let i = 1; i < climbing.length; i++) {
        const step = climbing[i]!;
        expect(step.y - climbing[i - 1]!.y, `step ${i} rise`).toBeLessThanOrEqual(STAIR.riser + 1e-6);
        // every step is stepped onto from one at most a riser below, sharing an edge
        const support = climbing.some((s) => s !== step
          && step.y - s.y >= -1e-6 && step.y - s.y <= STAIR.riser + 1e-6
          && touches(s, step));
        expect(support, `step ${i} at y ${step.y} is cut off`).toBe(true);
      }
    });

    it(`stair-${which}: keeps ${STAIR.headroom}m over every tread and landing`, () => {
      expect(minHeadroom(wholeRun(fixture, which))).toBeGreaterThanOrEqual(STAIR.headroom);
    });
  }

  it("a double-height floor keeps the same minimums", () => {
    const twin = makeFixture({ seed: 3, floors: 8, type: "corpo" });
    const assignments = resolveAssignments(twin.request).filter((a) => a.floor !== 2);
    const merged = assignments.map((a) => (a.floor === 1 ? { ...a, spans: 2 as const } : a));
    const plan = planBuilding(twin.request, merged);
    const core = plan.core;
    const sorted = [...plan.floors].sort((a, b) => a.floor - b.floor);
    const spanned = sorted.find((f) => f.floor === 1)!;
    const above = sorted.find((f) => f.floor === 3)!;
    const climb = above.elevation - spanned.elevation;
    const steps = computeStairSteps(core.stairA, entryAtLowEnd(core, "a"), spanned.elevation, climb)
      .map((s) => ({ ...s, slab: stairSlab(climb) }));
    expect(Math.max(...steps.map((s) => s.y))).toBeCloseTo(above.elevation, 6);
    expect(minHeadroom(steps)).toBeGreaterThanOrEqual(STAIR.headroom);
  });
});
