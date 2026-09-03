import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { clearanceConflicts, doorZone } from "./clearance.js";
import { DOOR } from "./constants.js";
import { planBuilding } from "./index.js";
import type { PlanRoom } from "./plan-types.js";

describe("door clearance", () => {
  it("keeps the leaf swing plus the approach on both sides of a door", () => {
    const room: PlanRoom = {
      id: "r", kind: "office_open", rect: { u: 0, v: 0, lu: 10, lv: 8 },
      doors: [{ id: "d", to: "corridor", leaves: 4, width: DOOR.quad, edge: "v0", at: 5 }],
    };
    const zone = doorZone(room.doors[0]!, room);
    const leaf = DOOR.quad / 4;
    expect(zone.lu).toBeCloseTo(DOOR.quad + 2 * DOOR.jamb, 6);
    expect(zone.lv).toBeCloseTo(2 * Math.max(leaf, DOOR.clearance), 6);
    expect(zone.v).toBeCloseTo(-Math.max(leaf, DOOR.clearance), 6);
  });

  it("keeps a wide open front clear without assigning it a leaf swing", () => {
    const room: PlanRoom = {
      id: "shop", kind: "sales_floor", rect: { u: 0, v: 0, lu: 16, lv: 10 },
      doors: [{
        id: "open", to: "outside", width: 11.68, edge: "v0", at: 8,
        openFront: {
          clearHeight: 3.34, clearDepth: 0.35, position: [8, 0], angleDeg: 0, inward: [0, 1],
        },
      }],
    };
    const zone = doorZone(room.doors[0]!, room);
    expect(zone.lu).toBeCloseTo(11.68 + 2 * DOOR.jamb, 6);
    expect(zone.lv).toBeCloseTo(2 * DOOR.clearance, 6);
  });

  it("no floor ships with anything standing in a doorway", () => {
    for (const options of [
      { seed: 21, floors: 10, basements: 1 },
      { seed: 5, floors: 7, type: "residential" as const, width: 28, depth: 18 },
      { seed: 12, floors: 5, type: "mall" as const, width: 34, depth: 22 },
      { seed: 9, floors: 4, type: "hotel" as const, width: 30, depth: 20 },
    ]) {
      const fix = makeFixture(options);
      const plan = planBuilding(fix.request, resolveAssignments(fix.request));
      for (const [index, uv] of plan.uvFloors) {
        const blocked = clearanceConflicts(uv.rooms, uv.furniture);
        expect(blocked, `floor ${index}: ${JSON.stringify(blocked[0])}`).toEqual([]);
      }
    }
  });

  it("the street entrance keeps its approach clear too", () => {
    const fix = makeFixture({ seed: 21, floors: 6, basements: 1 });
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    const ground = plan.uvFloors.get(0)!;
    const entrances = ground.rooms.flatMap((r) => r.doors.filter((d) => d.to === "outside").map((d) => ({ r, d })));
    expect(entrances.length).toBeGreaterThan(0);
    for (const { r, d } of entrances) {
      const zone = doorZone(d, r);
      for (const item of ground.furniture) {
        const swap = item.rotationDeg === 90 || item.rotationDeg === 270;
        const lu = swap ? item.size[1] : item.size[0];
        const lv = swap ? item.size[0] : item.size[1];
        const rect = { u: item.at[0] - lu / 2, v: item.at[1] - lv / 2, lu, lv };
        const hit = rect.u < zone.u + zone.lu && zone.u < rect.u + rect.lu
          && rect.v < zone.v + zone.lv && zone.v < rect.v + rect.lv;
        expect(hit, `${item.kind} ${item.id} blocks entrance ${d.id}`).toBe(false);
      }
    }
  });
});
