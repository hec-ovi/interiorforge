import type { WalkGrid } from "../core/grid.js";
import type { FloorInterior, Nav, NavConnector } from "../core/types.js";
import { CELL } from "../layout/constants.js";
import type { CorePlan } from "../layout/index.js";
import { elevatorWaitUv } from "../layout/index.js";
import { uvToWorld } from "../layout/uv.js";

/** Exports the layout grids and vertical connectors. Every stair and elevator serves every
 *  planned floor (digital controls default); spans-2 upper halves have no stop. */
export function buildNav(floors: FloorInterior[], grids: Map<number, WalkGrid>, core: CorePlan): Nav {
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
  core.elevators.forEach((elevator, i) => {
    const [x, z] = uvToWorld(elevatorWaitUv(core, i), core.frame);
    const entry: [number, number] = [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
    connectors.push({
      id: elevator.id,
      kind: "elevator",
      floors: served,
      entryByFloor: Object.fromEntries(served.map((f) => [f, entry])),
    });
  });
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
