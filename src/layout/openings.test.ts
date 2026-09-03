import { describe, expect, it } from "vitest";
import { Facade } from "./openings.js";
import type { BlueprintFloor } from "../core/types.js";

/** One square floor; its first edge carries two bays side by side, as a curtain wall does. */
const floor = {
  index: 0, kind: "offices", elevation: 0, height: 3.5,
  outline: [[0, 0], [10, 0], [10, 10], [0, 10]],
  openings: [
    { id: "w0", kind: "window", edge: 0, offset: 1, width: 2, height: 2.5, sill: 0.5 },
    { id: "w1", kind: "window", edge: 0, offset: 3, width: 2, height: 2.5, sill: 0.5 },
  ],
} as unknown as BlueprintFloor;

/**
 * Partitions land on the facade grid: a wall meeting the frame member between two
 * bays, or a jamb, is on the grid; a wall arriving mid-pane crosses a window.
 */
describe("Facade.crossedBy", () => {
  it("treats a wall on an opening boundary as standing on the member", () => {
    const facade = new Facade(floor);
    expect(facade.crossedBy([3, 0])).toBe(null); // the mullion between w0 and w1
    expect(facade.crossedBy([1, 0])).toBe(null); // w0's outer jamb
    expect(facade.crossedBy([2, 0])).toBe("w0"); // mid-pane
    expect(facade.crossedBy([4.05, 0])).toBe("w1"); // mid-pane, off the member by more than its half width
  });
});

describe("Facade.crossedBy on a glazed sheet", () => {
  it("uses only explicit full-thickness anchors, never an arbitrary pane mullion", async () => {
    const { Facade } = await import("./openings.js");
    const floor = {
      index: 0, kind: "office", elevation: 0, height: 4,
      outline: [[0, 0], [12, 0], [12, 8], [0, 8]],
      openings: [{ id: "w0", kind: "window", edge: 0, offset: 1, width: 4, height: 3, sill: 0, panes: { cols: 4, rows: 2 } }],
    } as never;
    const facade = new Facade(floor, {
      grids: [{ floor: 0, edge: 0, partitionAnchors: [{ offset: 0.8, width: 0.2 }] }],
    });
    expect(facade.crossedBy([3, 0])).toBe("w0"); // pane mullion has no structural permission
    expect(facade.crossedBy([3.5, 0])).toBe("w0"); // mid-pane
    expect(facade.crossedBy([1, 0])).toBe("w0"); // an opening boundary is not an anchor
    expect(facade.crossedBy([0.8, 0])).toBeNull(); // full partition plus safety fits the anchor
    expect(facade.crossedBy([0.8, 0], 0.11)).toBe("facade:0:0:unreserved"); // a thicker wall does not fit it
  });
});
