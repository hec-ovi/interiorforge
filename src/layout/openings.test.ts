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
