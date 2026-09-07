import { expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import { clipPolygonToRect, polygonArea, type Point } from "../core/geom.js";
import { planBuilding } from "./index.js";
import { coreRectsOf } from "./pier-align.js";
import { roomContains, roomPolygon } from "./room-shape.js";
import type { UvRect } from "./uv.js";

it("gives rail-reserved shafts exclusive floor ownership while retaining the ledge behind narrower elevators", () => {
  const fixture = makeFixture({ seed: 8, floors: 3, width: 36, depth: 28 });
  const plan = planBuilding(fixture.request, resolveAssignments(fixture.request));
  const solids = coreRectsOf(plan.core);
  expect(plan.core.stairB).toBeDefined();
  const elevator = plan.core.elevators[0]!.rect;
  const ledge: Point = [elevator.u + elevator.lu / 2, elevator.v + elevator.lv + 0.25];
  for (const [, floor] of plan.uvFloors) {
    for (const room of floor.rooms) for (const solid of solids) {
      const overlap = intersection(roomPolygon(room, floor.outline), solid)
        - (room.holes ?? []).reduce((area, hole) => area + intersection(hole, solid), 0);
      expect(overlap, `${room.id} overlaps an actual core solid`).toBeLessThan(1e-8);
    }
    for (const sealed of floor.sealed) for (const solid of solids) {
      expect(intersection(roomPolygon({ rect: sealed }), solid)).toBeLessThan(1e-8);
    }
    expect(floor.rooms.some(room => roomContains(room, ledge))).toBe(true);
  }
});

function intersection(polygon: Point[], rect: UvRect): number {
  return Math.abs(polygonArea(clipPolygonToRect(polygon, { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv })));
}
