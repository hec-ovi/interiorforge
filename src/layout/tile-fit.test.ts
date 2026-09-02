import { describe, expect, it } from "vitest";
import type { Point } from "../core/geom.js";
import type { BlueprintFloor } from "../core/types.js";
import type { CorePlan } from "./core-plan.js";
import type { PlanRoom } from "./plan-types.js";
import { fitPartitionsToGrid, gridOrigin, refitDoors, TILE } from "./tile-fit.js";

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

describe("refitDoors", () => {
  const plate: Point[] = [[0, 0], [6, 0], [6, 4], [0, 4]];

  it("puts a door back inside the stretch its rooms still share after a wall moved", () => {
    const a: PlanRoom = { id: "a", kind: "office_open", rect: { u: 0, v: 0, lu: 4, lv: 4 }, doors: [] };
    const b: PlanRoom = { id: "b", kind: "corridor", rect: { u: 4, v: 0, lu: 2, lv: 4 }, doors: [] };
    a.doors.push({ id: "d1", to: "b", leaves: 1, width: 0.9, edge: "u1", at: 3.5 });
    // the corridor's low edge slid up past the door
    b.rect.v = 3.2; b.rect.lv = 0.8;
    expect(refitDoors([a, b], plate)).toBe(1);
    expect(a.doors[0]).toMatchObject({ edge: "u1", width: 0.6 });
    expect(a.doors[0]!.at).toBeCloseTo(3.6, 6);
    // a door already inside its stretch is left alone
    expect(refitDoors([a, b], plate)).toBe(0);
  });

  it("drops a door on a stretch the plate does not carry", () => {
    // the outline cuts the shared edge away: no partition stands where the door sits
    const cut: Point[] = [[0, 0], [3.5, 0], [3.5, 4], [0, 4]];
    const a: PlanRoom = { id: "a", kind: "office_open", rect: { u: 0, v: 0, lu: 4, lv: 4 }, doors: [] };
    const b: PlanRoom = { id: "b", kind: "corridor", rect: { u: 4, v: 0, lu: 2, lv: 4 }, doors: [] };
    a.doors.push({ id: "d1", to: "b", leaves: 1, width: 0.9, edge: "u1", at: 3.5 });
    expect(refitDoors([a, b], cut)).toBe(1);
    expect(a.doors).toHaveLength(0);
  });
});
