import { expect, it } from "vitest";
import { resolveAssignments } from "../blueprint/validate.js";
import { polygonBounds, type Point } from "../core/geom.js";
import { roomFootprintArea, roomFootprintContains } from "../core/room-footprint.js";
import { broadFacadeFixture } from "./facade-plan.fixture.js";
import { planBuilding } from "./index.js";
import { partitionConflicts } from "./openings.js";
import { roomContains, roomCoversRect } from "./room-shape.js";
import { furnitureUvRect } from "./navgrid.js";
import { worldToUv } from "./uv.js";

it("assigns each broad glazing field to one room with inboard baths and connected public space", () => {
  for (const [seed, angle] of [[31, 0], [32, 37]] as const) {
    const fixture = broadFacadeFixture(seed, angle), assignments = resolveAssignments(fixture.request);
    const plan = planBuilding(fixture.request, assignments);
    for (const floor of plan.floors) {
      const bp = fixture.request.blueprint.floors.find(item => item.index === floor.floor)!;
      expect(partitionConflicts(floor, bp, fixture.request.blueprint.facade)).toEqual([]);
      for (const opening of bp.openings.filter(item => item.kind === "window")) {
        const a = bp.outline[opening.edge]!, b = bp.outline[(opening.edge + 1) % bp.outline.length]!;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const direction: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
        const owners = new Set<string>();
        for (const depth of [0.18, 0.28]) for (let i = 1; i < 16; i++) {
          const along = opening.offset + opening.width * i / 16;
          const point: Point = [a[0] + direction[0] * along - direction[1] * depth,
            a[1] + direction[1] * along + direction[0] * depth];
          const rooms = floor.rooms.filter(room => roomFootprintContains(room, point));
          expect(rooms, `${opening.id} ownership at ${along}, depth ${depth}`).toHaveLength(1);
          owners.add(rooms[0]!.id);
        }
        expect(owners.size, `${opening.id} is split between rooms`).toBe(1);
      }
      const uv = plan.uvFloors.get(floor.floor)!;
      for (const item of uv.furniture) {
        const room = uv.rooms.find(room => room.id === item.room)!;
        expect(roomCoversRect(room, furnitureUvRect(item)), item.id).toBe(true);
      }
      for (const light of floor.lights) {
        const room = uv.rooms.find(room => room.id === light.room);
        if (room) expect(roomContains(room, worldToUv([light.position[0], light.position[2]], plan.core.frame)), light.id).toBe(true);
      }
      expect(floor.rooms.some(room => room.holes?.length)).toBe(true);
      if (floor.floor === 0) {
        expect(floor.rooms.map(room => room.kind)).toEqual(expect.arrayContaining(["reception", "toilets", "storage"]));
      } else {
        const baths = floor.rooms.filter(room => room.kind === "bathroom");
        expect(baths.length).toBeGreaterThan(0);
        for (const bath of baths) {
          expect(roomFootprintArea(bath)).toBeCloseTo(9, 2);
          expect(polygonBounds(bath.polygon).w).toBeGreaterThan(2.9);
          expect(bath.doors).toHaveLength(1);
          const main = floor.rooms.find(room => room.id === bath.doors[0]!.to)!;
          expect(main.unit).toBe(bath.unit);
          expect(roomFootprintArea(main)).toBeGreaterThan(27);
        }
      }
    }
    expect(planBuilding(fixture.request, assignments).floors).toEqual(plan.floors);
  }
});

it("reports partitions reaching glazing behind the complete lining depth", () => {
  const fixture = broadFacadeFixture(), plan = planBuilding(fixture.request, resolveAssignments(fixture.request));
  const floor = plan.floors[1]!, bp = fixture.request.blueprint.floors[1]!;
  floor.rooms = [{ id: "crossing", kind: "bedroom", polygon: [[4, 0.15], [8, 0.15], [8, 5], [4, 5]], doors: [] }];
  expect(partitionConflicts(floor, bp, fixture.request.blueprint.facade))
    .toEqual([{ room: "crossing", opening: "w:1:0:1", at: [8, 0.15] }]);
});

it("rejects a required private program when the facade publishes no usable unit seats", () => {
  const fixture = broadFacadeFixture();
  for (const grid of fixture.request.blueprint.facade!.grids!) {
    grid.partitionAnchors = [grid.partitionAnchors[0]!, grid.partitionAnchors.at(-1)!];
  }
  expect(() => planBuilding(fixture.request, resolveAssignments(fixture.request)))
    .toThrow(/E_FLOOR_TOO_SMALL.*facade bays cannot fit a bedroom unit with inboard bathroom/);
});

it.each([
  { kind: "mall_floor" as const, functions: ["concourse", "sales_floor", "storage"] },
  { kind: "restaurant" as const, functions: ["dining_area", "kitchen", "toilets", "storage"] },
  { kind: "corpo_office" as const, functions: ["office_open", "meeting", "executive_office", "toilets"] },
])("retains the $kind program within the shared facade layout", ({ kind, functions }) => {
  const fixture = broadFacadeFixture();
  const assignments = resolveAssignments(fixture.request).map(assignment => assignment.floor === 1 ? { ...assignment, kind } : assignment);
  const floor = planBuilding(fixture.request, assignments).floors[1]!;
  expect(floor.rooms.map(room => room.kind)).toEqual(expect.arrayContaining(functions));
  if (kind === "mall_floor") for (const shop of floor.rooms.filter(room => room.kind === "sales_floor")) {
    const stock = floor.rooms.find(room => room.unit === shop.unit && room.kind === "storage")!;
    expect(stock.doors.some(door => door.to === shop.id)).toBe(true);
  }
});
