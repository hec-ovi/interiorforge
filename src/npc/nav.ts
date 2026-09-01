import type { WalkGrid } from "../core/grid.js";
import type { FloorInterior, Nav, NavConnector } from "../core/types.js";
import { CELL } from "../layout/constants.js";
import { elevatorFront } from "./anchors.js";

/** Exports the layout grids and vertical connectors. Every stair and elevator serves every
 *  planned floor (digital controls default); spans-2 upper halves have no stop. */
export function buildNav(floors: FloorInterior[], grids: Map<number, WalkGrid>): Nav {
  const served = floors.filter((f) => f.rooms.length > 0).map((f) => f.floor).sort((a, b) => a - b);

  const navFloors = served.map((index) => {
    const grid = grids.get(index)!;
    return {
      floor: index,
      origin: grid.origin,
      cols: grid.cols,
      rows: grid.rows,
      walkable: grid.toBase64(),
    };
  });

  const connectors: NavConnector[] = [];
  const sample = floors.find((f) => f.rooms.length > 0)!;
  for (const elevator of sample.core.elevators) {
    const entry = elevatorFront(elevator.rect, elevator.doorEdge);
    connectors.push({
      id: elevator.id,
      kind: "elevator",
      floors: served,
      entryByFloor: Object.fromEntries(served.map((f) => [f, entry])),
    });
  }
  for (const stair of sample.core.stairs) {
    connectors.push({
      id: stair.id,
      kind: "stair",
      floors: served,
      entryByFloor: Object.fromEntries(served.map((f) => [f, stair.entry])),
    });
  }
  return { cellSize: CELL, floors: navFloors, connectors };
}
