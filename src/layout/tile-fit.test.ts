import { describe, expect, it } from "vitest";
import type { BlueprintFloor } from "../core/types.js";
import type { CorePlan } from "./core-plan.js";
import type { PlanRoom } from "./plan-types.js";
import { fitPartitionsToGrid, gridOrigin, TILE } from "./tile-fit.js";

/** A 12 x 8 plate with two rooms split at an off-grid wall, and a core shaft the split never touches. */
function fixture() {
  const outline = [[0.3, 0.2], [12.3, 0.2], [12.3, 8.2], [0.3, 8.2]] as [number, number][];
  const rooms: PlanRoom[] = [
    { id: "a", kind: "office_open", rect: { u: 0.3, v: 0.2, lu: 5.37, lv: 8 }, doors: [] },
    { id: "b", kind: "office_open", rect: { u: 5.67, v: 0.2, lu: 6.63, lv: 8 }, doors: [] },
  ];
  const frame = { angleDeg: 0, cos: 1, sin: 0 };
  const core = {
    frame, stairA: { u: 20, v: 20, lu: 3, lv: 5 }, riser: { u: 24, v: 20, lu: 1, lv: 1 }, elevators: [],
  } as unknown as CorePlan;
  const floor = { index: 0, kind: "office", elevation: 0, height: 4, outline, openings: [] } as unknown as BlueprintFloor;
  return { outline, rooms, core, floor };
}

describe("fitPartitionsToGrid", () => {
  it("slides an interior wall onto the tile grid counted from the outline corner and keeps the rooms abutting", () => {
    const { outline, rooms, core, floor } = fixture();
    expect(gridOrigin(outline)).toEqual([0.3, 0.2]);

    const { moved } = fitPartitionsToGrid(rooms, [], floor, core, outline);

    expect(moved).toBe(1);
    const wall = rooms[0]!.rect.u + rooms[0]!.rect.lu;
    expect(wall).toBeCloseTo(5.8, 6); // 0.3 + 11 tiles
    expect(rooms[1]!.rect.u).toBeCloseTo(wall, 6);
    expect(rooms[0]!.rect.lu + rooms[1]!.rect.lu).toBeCloseTo(12, 6);
    expect(((wall - 0.3) / TILE) % 1).toBeCloseTo(0, 6);
  });

  it("leaves the shell lines alone", () => {
    const { outline, rooms, core, floor } = fixture();
    fitPartitionsToGrid(rooms, [], floor, core, outline);
    expect(rooms[0]!.rect.u).toBe(0.3);
    expect(rooms[1]!.rect.u + rooms[1]!.rect.lu).toBeCloseTo(12.3, 6);
  });
});
