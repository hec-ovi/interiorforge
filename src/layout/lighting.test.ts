import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { pointInPolygon } from "../core/geom.js";
import { ceilingClear, stairSlab } from "./constants.js";
import { planBuilding } from "./index.js";
import { worldToUv } from "./uv.js";

const fix = makeFixture({ seed: 31, floors: 8, basements: 1, type: "offices" });
const plan = planBuilding(fix.request, resolveAssignments(fix.request));
const outlines = new Map(fix.request.blueprint.floors.map((f) => [f.index, f.outline]));

describe("floor lighting", () => {
  it("spreads budgeted spot grids across elongated and wide rooms reproducibly", () => {
    const fixture = makeFixture({ seed: 31, floors: 2, basements: 0, width: 50, depth: 30, type: "offices" });
    const assignments = resolveAssignments(fixture.request).map(assignment => ({ ...assignment, kind: "mechanical" as const }));
    const planned = planBuilding(fixture.request, assignments);
    const floor = planned.floors[0]!;
    const rooms = planned.uvFloors.get(floor.floor)!.rooms
      .filter(room => room.kind === "mechanical_room" && Math.min(room.rect.lu, room.rect.lv) > 10);
    expect(rooms).toHaveLength(2);
    expect(rooms.some(room => room.rect.lu / room.rect.lv > 3)).toBe(true);
    expect(rooms.some(room => room.rect.lu / room.rect.lv < 2)).toBe(true);
    for (const room of rooms) {
      const lights = floor.lights.filter(light => light.room === room.id && light.kind === "spot");
      const positions = lights.map(light => worldToUv([light.position[0], light.position[2]], planned.core.frame));
      const u = [...new Set(positions.map(point => point[0]))].sort((a, b) => a - b);
      const v = [...new Set(positions.map(point => point[1]))].sort((a, b) => a - b);
      expect(lights.length).toBeLessThanOrEqual(10);
      expect(lights.length).toBe(u.length * v.length);
      for (const [axis, from, span] of [[u, room.rect.u, room.rect.lu], [v, room.rect.v, room.rect.lv]] as const) {
        expect(axis.length).toBeGreaterThan(1);
        expect(axis[0]).toBeCloseTo(from + span / (2 * axis.length), 3);
        expect(axis.at(-1)).toBeCloseTo(from + span - span / (2 * axis.length), 3);
        expect(axis.at(-1)! - axis[0]!).toBeGreaterThanOrEqual(span * 0.49);
      }
    }
    expect(planBuilding(fixture.request, assignments).floors.map(item => item.lights))
      .toEqual(planned.floors.map(item => item.lights));
  });

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

  it("embeds a stairwell downlight in the arrival landing over the entry", () => {
    for (const floor of plan.floors) {
      if (floor.rooms.length === 0) continue;
      const landingY = floor.elevation + floor.height - stairSlab(floor.height);
      for (const stair of floor.core.stairs) {
        const lights = floor.lights.filter((l) => l.room === stair.id);
        expect(lights.length).toBe(1);
        expect(lights[0]!.position[1]).toBeCloseTo(landingY, 3);
        const r = stair.rect;
        const alongX = r.w >= r.d;
        const run = alongX ? lights[0]!.position[0] - r.x : lights[0]!.position[2] - r.z;
        const entry = alongX ? stair.entry[0] - r.x : stair.entry[1] - r.z;
        const len = alongX ? r.w : r.d;
        expect((run > len / 2) === (entry > len / 2)).toBe(true);
      }
    }
  });

  it("fixtures hang under the ceiling and inside the building", () => {
    for (const floor of plan.floors) {
      const outline = outlines.get(floor.floor)!;
      const ceiling = floor.elevation + ceilingClear(floor.height);
      const stairs = new Set(floor.core.stairs.map((s) => s.id));
      for (const light of floor.lights) {
        const [x, y, z] = light.position;
        expect(y).toBeGreaterThan(floor.elevation + 1.8);
        const high = stairs.has(light.room)
          ? floor.elevation + floor.height - stairSlab(floor.height)
          : ceiling;
        expect(y).toBeLessThanOrEqual(high + 1e-6);
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
