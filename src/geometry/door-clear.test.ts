import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { planBuilding } from "../layout/index.js";
import type { PlanRoom } from "../layout/plan-types.js";
import { makeFrame } from "../layout/uv.js";
import { assertDoorwaysClear, floorDoorways } from "./door-clear.js";
import { buildInterior } from "./index.js";

const frame = makeFrame(0);
const rooms: PlanRoom[] = [
  { id: "a", kind: "office_open", rect: { u: 0, v: 0, lu: 6, lv: 4 }, doors: [] },
  { id: "b", kind: "corridor", rect: { u: 0, v: 4, lu: 6, lv: 2 }, doors: [] },
];
rooms[0]!.doors.push({ id: "d1", to: "b", leaves: 1, width: 0.9, edge: "v1", at: 3 });

describe("doorways are open in the geometry", () => {
  it("catches a wall run that missed its hole", () => {
    const mb = new MeshBuilder();
    // the whole line at v = 4, no hole for the door at u = 3
    mb.addBox("wall", { x: 0, z: 3.95, w: 6, d: 0.1 }, 0, 3);
    expect(() => assertDoorwaysClear(mb, floorDoorways(rooms, frame, 0, 3), 0))
      .toThrowError(/doorway a\/d1 is walled shut by wall/);
  });

  it("passes the same wall with the doorway cut out", () => {
    const mb = new MeshBuilder();
    mb.addBox("wall", { x: 0, z: 3.95, w: 2.55, d: 0.1 }, 0, 3);
    mb.addBox("wall", { x: 3.45, z: 3.95, w: 2.55, d: 0.1 }, 0, 3);
    mb.addBox("wall", { x: 2.55, z: 3.95, w: 0.9, d: 0.1 }, 2.5, 3); // the lintel over the head
    expect(() => assertDoorwaysClear(mb, floorDoorways(rooms, frame, 0, 3), 0)).not.toThrow();
  });

  it("every door of a built building opens", () => {
    const fix = makeFixture({ seed: 6, floors: 5, basements: 1 });
    const plan = planBuilding(fix.request, resolveAssignments(fix.request));
    // buildInterior asserts every floor's doorways; reaching the result is the proof
    expect(() => buildInterior(plan, fix.request, fix.shellDoc)).not.toThrow();
    const doors = plan.floors.flatMap((f) => f.rooms.flatMap((r) => r.doors));
    expect(doors.length).toBeGreaterThan(10);
  });
});
