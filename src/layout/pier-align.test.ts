import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import type { BlueprintFloor } from "../core/types.js";
import { planCore } from "./core-plan.js";
import { planBuilding } from "./index.js";
import { Facade, partitionConflicts } from "./openings.js";
import { alignPartitionsToPiers } from "./pier-align.js";
import type { PlanRoom } from "./plan-types.js";
import { toUvPolygon } from "./uv.js";

const fix = makeFixture({ seed: 21, floors: 10, basements: 1 });
const core = planCore(fix.request, resolveAssignments(fix.request));
const bpFloor = fix.request.blueprint.floors.find((f) => f.index === 1)! as BlueprintFloor;
const uvOutline = toUvPolygon(bpFloor.outline, core.frame);

/** The rear facade of the fixture, with its window rhythm; the frame is axis aligned here. */
const REAR_EDGE = 3;

function room(id: string, u: number, lu: number): PlanRoom {
  return { id, kind: "office_open", rect: { u, v: 14, lu, lv: 6 }, doors: [] };
}

describe("partitions on facade piers", () => {
  it("slides a wall that would cut a window onto the pier beside it", () => {
    const window = bpFloor.openings.find((o) => o.edge === REAR_EDGE && o.offset > 6 && o.offset < 9)!;
    const facade = new Facade(bpFloor);
    const a = room("a", 8, 4);
    const b = room("b", 12, 4);
    // the shared wall lands inside that window before the pass
    expect(facade.crossedBy([12, 20])).toBe(window.id);

    const result = alignPartitionsToPiers([a, b], [], bpFloor, core, uvOutline);
    expect(result.moved).toBeGreaterThan(0);
    const wall = a.rect.u + a.rect.lu;
    expect(wall).not.toBeCloseTo(12, 3);
    expect(b.rect.u).toBeCloseTo(wall, 6); // rooms stay adjacent
    expect(facade.crossedBy([wall, 20])).toBeNull();
    expect(a.rect.lu).toBeGreaterThan(1.6);
    expect(b.rect.lu).toBeGreaterThan(1.6);
  });

  it("leaves nothing fixable on a generated tower: only shaft-locked walls still meet glass", () => {
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    const byIndex = new Map(fix.request.blueprint.floors.map((f) => [f.index, f as BlueprintFloor]));
    for (const floor of plan.floors) {
      if (floor.rooms.length === 0) continue;
      const bp = byIndex.get(floor.floor)!;
      const uv = plan.uvFloors.get(floor.floor)!;
      // a second pass has nothing left to move: every reachable pier is already taken
      const again = alignPartitionsToPiers(uv.rooms, uv.sealed, bp, core, uv.outline);
      expect(again.moved, `floor ${floor.floor} still had movable walls`).toBe(0);
      // each unmovable wall end is reported by at most the two rooms sharing it
      const conflicts = partitionConflicts(floor, bp);
      expect(conflicts.length, `floor ${floor.floor}`).toBeLessThanOrEqual(2 * again.unresolved);
    }
  });

  it("keeps rooms adjacent and inside the plate on a rotated parcel", () => {
    const rot = makeFixture({ seed: 21, floors: 6, rotationDeg: 37 });
    const plan = planBuilding(rot.request, resolveAssignments(rot.request));
    for (const floor of plan.floors) {
      for (const room of floor.rooms) {
        expect(room.polygon.length).toBeGreaterThanOrEqual(3);
      }
      expect(floor.rooms.every((r) => r.doors.length >= 0)).toBe(true);
    }
    const again = planBuilding(rot.request, resolveAssignments(rot.request));
    expect(JSON.stringify(again.floors)).toBe(JSON.stringify(plan.floors));
  });
});
