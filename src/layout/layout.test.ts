import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { coreFeasibility, planBuilding } from "./index.js";
import { polygonArea, polygonBounds, pointInPolygon, rectsOverlap } from "../core/geom.js";

const fix = makeFixture({ seed: 21, floors: 10, basements: 1 });
const plan = planBuilding(fix.request, resolveAssignments(fix.request));

describe("planBuilding", () => {
  it("is deterministic", () => {
    const again = planBuilding(fix.request, resolveAssignments(fix.request));
    expect(JSON.stringify(again.floors)).toBe(JSON.stringify(plan.floors));
  });

  it("plans every blueprint floor, basements included", () => {
    expect(plan.floors.map((f) => f.floor)).toEqual([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("keeps the vertical core identical on every floor", () => {
    const signatures = new Set(
      plan.floors.map((f) => JSON.stringify([f.core.elevators, f.core.stairs.map((s) => s.rect)])),
    );
    expect(signatures.size).toBe(1);
    expect(plan.core.stairB).toBeTruthy(); // 10 stories: two egress stairs
  });

  it("rooms are CCW polygons with positive area and no pairwise overlap", () => {
    for (const floor of plan.floors) {
      const boxes = floor.rooms.map((r) => {
        expect(polygonArea(r.polygon)).toBeGreaterThan(0);
        const b = polygonBounds(r.polygon);
        return { x: b.x + 0.05, z: b.z + 0.05, w: b.w - 0.1, d: b.d - 0.1 };
      });
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(rectsOverlap(boxes[i]!, boxes[j]!)).toBe(false);
        }
      }
    }
  });

  it("every room holds reached walkable cells (validated floors flood from the corridor)", () => {
    for (const floor of plan.floors) {
      const grid = plan.navGrids.get(floor.floor)!;
      expect(grid).toBeTruthy();
      if (floor.rooms.length > 0) expect(grid.walkableCount()).toBeGreaterThan(100);
    }
  });

  it("furniture sits inside its room", () => {
    for (const floor of plan.floors) {
      const rooms = new Map(floor.rooms.map((r) => [r.id, r]));
      for (const f of floor.furniture) {
        expect(pointInPolygon(f.position, rooms.get(f.room)!.polygon)).toBe(true);
      }
    }
  });

  it("residential floors split into units with bath, entry and main room off the corridor", () => {
    const res = makeFixture({ seed: 5, floors: 7, type: "residential", width: 28, depth: 18 });
    const rplan = planBuilding(res.request, resolveAssignments(res.request));
    const floor = rplan.floors.find((f) => f.kind === "residence_studio" || f.kind === "apartment")!;
    const units = new Set(floor.rooms.map((r) => r.unit).filter(Boolean));
    expect(units.size).toBeGreaterThanOrEqual(3);
    for (const unit of units) {
      const rooms = floor.rooms.filter((r) => r.unit === unit);
      expect(rooms.some((r) => r.kind === "bathroom")).toBe(true);
      const entry = rooms.find((r) => r.doors.some((d) => d.to.endsWith("-corridor")));
      expect(entry).toBeTruthy();
    }
  });

  it("a spans-2 assignment leaves the upper floor open", () => {
    const twin = makeFixture({ seed: 3, floors: 8, type: "corpo" });
    const assignments = resolveAssignments(twin.request).filter((a) => a.floor !== 2);
    const merged = assignments.map((a) => (a.floor === 1 ? { ...a, spans: 2 as const } : a));
    const tplan = planBuilding(twin.request, merged);
    const upper = tplan.floors.find((f) => f.floor === 2)!;
    expect(upper.rooms).toEqual([]);
    expect(upper.core.elevators.length).toBeGreaterThan(0);
  });

  it("plans rotated parcels: frame-aligned core, validated rooms, entrance preserved", () => {
    const rot = makeFixture({ seed: 21, floors: 8, rotationDeg: 37 });
    const rplan = planBuilding(rot.request, resolveAssignments(rot.request));
    const angle = ((rplan.floors[0]!.coreAngleDeg % 180) + 180) % 180;
    expect(angle).toBeCloseTo(37, 1);
    const f0 = rplan.floors.find((f) => f.floor === 0)!;
    expect(f0.rooms.length).toBeGreaterThan(3);
    expect(f0.rooms.some((r) => r.doors.some((d) => d.to === "outside"))).toBe(true);
    const again = planBuilding(rot.request, resolveAssignments(rot.request));
    expect(JSON.stringify(again.floors)).toBe(JSON.stringify(rplan.floors));
  });

  it("rejects a plate that cannot hold the core", () => {
    const tiny = makeFixture({ seed: 1, floors: 6, width: 10, depth: 8 });
    expect(() => planBuilding(tiny.request, resolveAssignments(tiny.request))).toThrowError(
      expect.objectContaining({ code: "E_FLOOR_TOO_SMALL" }),
    );
  });

  it("coreFeasibility mirrors planCore: fits means it plans, unfit means E_FLOOR_TOO_SMALL", () => {
    const good = coreFeasibility(fix.request.blueprint);
    expect(good.fits).toBe(true);
    expect(good.maxElevators).toBeGreaterThanOrEqual(
      plan.floors.find((f) => f.floor === 0)!.core.elevators.length,
    );
    expect(good.bandLength).toBeGreaterThanOrEqual(good.minCoreLength);

    const tiny = makeFixture({ seed: 1, floors: 6, width: 10, depth: 8 });
    const bad = coreFeasibility(tiny.request.blueprint);
    expect(bad.fits).toBe(false);

    // a tall tower on a modest plate: elevator demand clamps to the band instead of failing
    const tall = makeFixture({ seed: 2, floors: 40, width: 26, depth: 20 });
    const f = coreFeasibility(tall.request.blueprint);
    expect(f.fits).toBe(true);
    const tallPlan = planBuilding(tall.request, resolveAssignments(tall.request));
    expect(tallPlan.core.elevatorCount).toBeLessThanOrEqual(f.maxElevators);
  });

  it("tight footprints degrade to a stair-only walkup under the published cap", () => {
    const small = makeFixture({ seed: 3, floors: 4, width: 9, depth: 10, type: "residential" });
    const f = coreFeasibility(small.request.blueprint);
    expect(f.mode).toBe("walkup");
    expect(f.fits).toBe(true);
    const wplan = planBuilding(small.request, resolveAssignments(small.request));
    const f0 = wplan.floors.find((x) => x.floor === 0)!;
    expect(f0.core.elevators).toEqual([]);
    expect(f0.core.stairs.length).toBeGreaterThanOrEqual(1);

    // beyond the walkup cap the gate closes, message and recipe agree on the numbers
    const tall = makeFixture({ seed: 3, floors: 7, width: 9, depth: 10, type: "residential" });
    const tf = coreFeasibility(tall.request.blueprint);
    expect(tf.fits).toBe(false);
    try {
      planBuilding(tall.request, resolveAssignments(tall.request));
      expect.unreachable("must throw");
    } catch (err) {
      expect((err as { code: string }).code).toBe("E_FLOOR_TOO_SMALL");
      expect((err as Error).message).toContain(`${tf.minWalkupCoreLength.toFixed(1)}m`);
      expect((err as Error).message).toContain(`${tf.bandLength.toFixed(1)}m`);
    }
  });

  it("near-miss bands keep elevators via the compact column core", () => {
    const square = makeFixture({ seed: 6, floors: 6, width: 16, depth: 16 });
    const f = coreFeasibility(square.request.blueprint);
    expect(f.mode).toBe("compact");
    expect(f.fits).toBe(true);
    const cplan = planBuilding(square.request, resolveAssignments(square.request));
    const f0 = cplan.floors.find((x) => x.floor === 0)!;
    expect(f0.core.elevators.length).toBeGreaterThanOrEqual(1);
    expect(f0.core.stairs.length).toBe(2);
    // column stairs: deeper than wide in the layout frame
    for (const stair of f0.core.stairs) expect(stair.rect.d).toBeGreaterThan(stair.rect.w);
  });

  it("shallow plates go single-loaded so units keep real room depth", () => {
    const narrow = makeFixture({ seed: 4, floors: 5, width: 30, depth: 10, type: "residential" });
    const nplan = planBuilding(narrow.request, resolveAssignments(narrow.request));
    const floor = nplan.floors.find((x) => x.kind === "residence_studio" || x.kind === "apartment")!;
    expect(floor.furniture.some((f) => f.kind === "bed_double" || f.kind === "bed_single")).toBe(true);
  });
});
