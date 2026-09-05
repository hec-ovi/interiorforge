import { expect, it } from "vitest";
import { resolveAssignments } from "../blueprint/validate.js";
import { broadFacadeFixture } from "./facade-plan.fixture.js";
import { clearanceConflicts } from "./clearance.js";
import { planBuilding } from "./index.js";
import { furnitureUvRect } from "./navgrid.js";
import type { PlanFurniture } from "./plan-types.js";
import { roomCoversRect } from "./room-shape.js";
import type { UvRect } from "./uv.js";

it("fits complete full-size bathroom recipes with usable fronts around reserved door and walking space", () => {
  for (const [seed, angle] of [[31, 0], [32, 37]] as const) {
    const { request } = broadFacadeFixture(seed, angle);
    const assignments = resolveAssignments(request);
    const plan = planBuilding(request, assignments);
    let bathCount = 0;
    for (const data of plan.uvFloors.values()) {
      expect(clearanceConflicts(data.rooms, data.furniture)).toEqual([]);
      for (const bath of data.rooms.filter(room => room.kind === "bathroom")) {
        bathCount++;
        const fixtures = data.furniture.filter(item => item.room === bath.id);
        expect(fixtures.map(item => item.kind).sort(), bath.id).toEqual(["shower", "sink", "toilet"]);
        for (const item of fixtures) {
          const sizes = { shower: [0.9, 0.9, 2], toilet: [0.4, 0.65, 0.75], sink: [0.5, 0.45, 0.85] };
          expect(item.size).toEqual(sizes[item.kind as keyof typeof sizes]);
          const operation = operationOf(item);
          expect(roomCoversRect(bath, operation, 0.09), `${bath.id}/${item.kind} operation reaches a wall`).toBe(true);
          for (const other of fixtures.filter(other => other !== item)) {
            expect(overlaps(operation, furnitureUvRect(other)), `${item.kind} access blocked by ${other.kind}`).toBe(false);
          }
        }
      }
    }
    expect(bathCount).toBeGreaterThan(0);
    expect(planBuilding(request, assignments).floors.map(floor => floor.furniture))
      .toEqual(plan.floors.map(floor => floor.furniture));
  }
});

function operationOf(item: PlanFurniture): UvRect {
  const fp = furnitureUvRect(item);
  const width = item.kind === "toilet" ? 0.8 : item.kind === "sink" ? 0.6 : 0.9;
  const front = item.kind === "shower" ? 0.7 : 0.6;
  const side = (width - item.size[0]) / 2;
  switch (item.rotationDeg) {
    case 0: return { u: fp.u - side, v: fp.v, lu: fp.lu + side * 2, lv: fp.lv + front };
    case 180: return { u: fp.u - side, v: fp.v - front, lu: fp.lu + side * 2, lv: fp.lv + front };
    case 90: return { u: fp.u, v: fp.v - side, lu: fp.lu + front, lv: fp.lv + side * 2 };
    case 270: return { u: fp.u - front, v: fp.v - side, lu: fp.lu + front, lv: fp.lv + side * 2 };
  }
}

function overlaps(a: UvRect, b: UvRect): boolean {
  return a.u < b.u + b.lu - 1e-8 && a.u + a.lu > b.u + 1e-8
    && a.v < b.v + b.lv - 1e-8 && a.v + a.lv > b.v + 1e-8;
}
