import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { pointInPolygon } from "../core/geom.js";
import { ceilingClear } from "./constants.js";
import { planBuilding } from "./index.js";

const fix = makeFixture({ seed: 31, floors: 8, basements: 1, type: "offices" });
const plan = planBuilding(fix.request, resolveAssignments(fix.request));
const outlines = new Map(fix.request.blueprint.floors.map((f) => [f.index, f.outline]));

describe("floor lighting", () => {
  it("lights every room, corridor and stairwell", () => {
    for (const floor of plan.floors) {
      if (floor.rooms.length === 0) continue;
      const lit = new Set(floor.lights.map((l) => l.room));
      for (const room of floor.rooms) {
        expect(lit.has(room.id), `${floor.floor} ${room.id} (${room.kind}) is dark`).toBe(true);
      }
      for (const stair of floor.core.stairs) expect(lit.has(stair.id)).toBe(true);
    }
  });

  it("fixtures hang under the ceiling and inside the building", () => {
    for (const floor of plan.floors) {
      const outline = outlines.get(floor.floor)!;
      const ceiling = floor.elevation + ceilingClear(floor.height);
      for (const light of floor.lights) {
        const [x, y, z] = light.position;
        expect(y).toBeGreaterThan(floor.elevation + 1.8);
        expect(y).toBeLessThanOrEqual(ceiling + 1e-6);
        expect(pointInPolygon([x, z], outline), `${light.id} outside the plate`).toBe(true);
      }
    }
  });

  it("carries the kind, intensity and colour an engine light needs", () => {
    const lights = plan.floors.flatMap((f) => f.lights);
    expect(lights.length).toBeGreaterThan(20);
    for (const light of lights) {
      expect(["strip", "spot", "cove"]).toContain(light.kind);
      expect(light.intensity).toBeGreaterThan(0);
      expect(light.colorTemperatureK).toBeGreaterThanOrEqual(2000);
      expect(light.range).toBeGreaterThan(0);
      expect(light.kind === "spot" ? light.length === 0 : light.length > 0).toBe(true);
    }
    expect(new Set(lights.map((l) => l.id)).size).toBe(lights.length);
  });

  it("venue rooms get cove lines, corridors get downlights", () => {
    const lobby = plan.floors.find((f) => f.rooms.some((r) => r.kind === "reception"))!;
    const hall = lobby.rooms.find((r) => r.kind === "reception")!;
    expect(lobby.lights.some((l) => l.room === hall.id && l.kind === "cove")).toBe(true);
    expect(lobby.lights.some((l) => l.room === hall.id && l.kind === "strip")).toBe(true);

    const corridor = plan.floors
      .flatMap((f) => f.lights.filter((l) => f.rooms.some((r) => r.id === l.room && r.kind === "corridor")));
    expect(corridor.some((l) => l.kind === "spot")).toBe(true);
  });
});
