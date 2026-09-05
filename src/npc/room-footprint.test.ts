import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { polygonBounds, type Point } from "../core/geom.js";
import { WalkGrid } from "../core/grid.js";
import { roomFootprintContains } from "../core/room-footprint.js";
import type { FloorInterior, Room } from "../core/types.js";
import { planBuilding, type BuildingPlan } from "../layout/index.js";
import { buildNpcSupport, findPath } from "./index.js";

const fixture = makeFixture({ seed: 8, floors: 1 });
const base = planBuilding(fixture.request, resolveAssignments(fixture.request));
const outline: Point[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
const hole: Point[] = [[3, 3], [3, 7], [7, 7], [7, 3]];
const spine: Room = { id: "ring", kind: "concourse", polygon: outline, holes: [hole], doors: [] };

function makePlan(rooms: Room[], grid: WalkGrid, furniture: FloorInterior["furniture"] = []): BuildingPlan {
  return {
    ...base,
    core: { ...base.core, elevators: [] },
    floors: [{
      ...base.floors[0]!, rooms, furniture, lights: [],
      core: { elevators: [], stairs: [], shafts: [] },
    }],
    navGrids: new Map([[0, grid]]),
    uvFloors: new Map([[0, {
      ...base.uvFloors.get(0)!,
      rooms: rooms.map((room) => {
        const bounds = polygonBounds(room.polygon);
        return {
          ...room, rect: { u: bounds.x, v: bounds.z, lu: bounds.w, lv: bounds.d }, doors: [],
        };
      }),
    }]]),
  };
}

describe("NPC room footprints", () => {
  it("seeds and routes an annular spine outside its central core", () => {
    const grid = WalkGrid.forPolygon(outline, 0.25, { x: 0, z: 0, w: 10, d: 10 });
    grid.blockRect({ x: 3, z: 3, w: 4, d: 4 });
    const support = buildNpcSupport(makePlan([spine], grid), fixture.request);
    expect(support.anchors.map((anchor) => anchor.kind)).toEqual(["patrol_point", "cleaning_spot"]);
    for (const anchor of support.anchors) expect(roomFootprintContains(spine, anchor.position)).toBe(true);
    const route = findPath(support, { floor: 0, position: [2, 5] }, { floor: 0, position: [8, 5] });
    expect(route).not.toBeNull();
    const walk = route![0]!;
    expect(walk.kind).toBe("walk");
    if (walk.kind !== "walk") return;
    for (let i = 1; i < walk.points.length; i++) {
      const a = walk.points[i - 1]!;
      const b = walk.points[i]!;
      const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1);
      for (let s = 0; s <= steps; s++) {
        expect(roomFootprintContains(spine, [
          a[0] + (b[0] - a[0]) * s / steps, a[1] + (b[1] - a[1]) * s / steps,
        ])).toBe(true);
      }
    }
    expect(findPath(support, { floor: 0, position: [2, 5] }, { floor: 0, position: [3.1, 5] })).toBeNull();
  });

  it("keeps a displaced furniture target in its owning room across an interior exclusion", () => {
    const grid = WalkGrid.forPolygon(outline, 0.25, { x: 0, z: 0, w: 10, d: 10 });
    const position: Point = [2.9, 5];
    grid.set(...grid.cellAt(position), false);
    const inner: Room = { id: "inner", kind: "office_open", polygon: [...hole].reverse(), doors: [] };
    const support = buildNpcSupport(makePlan([spine, inner], grid, [{
      id: "ring-chair", kind: "chair", room: spine.id, position, rotationDeg: 0, size: [0.2, 0.2, 0.5],
    }]), fixture.request);
    const seat = support.anchors.find((anchor) => anchor.furniture === "ring-chair")!;
    expect(seat).toBeDefined();
    expect(seat.position).not.toEqual(position);
    expect(roomFootprintContains(spine, seat.position)).toBe(true);
    expect(roomFootprintContains(inner, seat.position)).toBe(false);
    for (const anchor of support.anchors) {
      const room = [spine, inner].find((room) => room.id === anchor.room)!;
      expect(roomFootprintContains(room, anchor.position), anchor.id).toBe(true);
    }
  });

  it("rejects a spine with no walkable room-owned flood seed", () => {
    const grid = new WalkGrid([0, 0], 0.25, 40, 40);
    grid.openRect({ x: 3, z: 3, w: 4, d: 4 });
    expect(() => buildNpcSupport(makePlan([spine], grid), fixture.request)).toThrowError(
      expect.objectContaining({ code: "E_UNREACHABLE_SPACE", floor: 0 }),
    );
  });
});
