import { boundaryDistance, polygonBounds } from "../core/geom.js";
import { InteriorError } from "../core/errors.js";
import { WalkGrid } from "../core/grid.js";
import type { FloorInterior, InteriorRequest, Nav, NavConnector } from "../core/types.js";
import { AGENT_RADIUS, CELL } from "../layout/constants.js";
import type { CorePlan } from "../layout/index.js";
import { elevatorWaitUv } from "../layout/index.js";
import { planRoofAccess } from "../layout/roof-access.js";
import { uvToWorld } from "../layout/uv.js";

/** Exports the layout grids and vertical connectors. Multi-floor stairs and elevators serve
 *  every occupied floor; double-height upper halves have no stop. */
export function buildNav(
  floors: FloorInterior[], grids: Map<number, WalkGrid>, core: CorePlan, request: InteriorRequest,
): Nav {
  const served = floors.filter((f) => f.rooms.length > 0).map((f) => f.floor).sort((a, b) => a - b);
  const roof = planRoofAccess(request, core);

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
  if (roof) {
    const grid = buildRoofGrid(request, roof.access.entry);
    navFloors.push({
      floor: roof.access.floor,
      origin: grid.origin,
      cols: grid.cols,
      rows: grid.rows,
      walkable: grid.toBase64(),
    });
  }

  const connectors: NavConnector[] = [];
  const sample = floors.find((f) => f.rooms.length > 0)!;
  if (served.length > 1) {
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
  }
  for (const stair of sample.core.stairs) {
    const connectorFloors = stair.id === "stair-a" && roof ? [...served, roof.access.floor] : served;
    if (connectorFloors.length < 2) continue;
    connectors.push({
      id: stair.id,
      kind: "stair",
      floors: connectorFloors,
      entryByFloor: {
        ...Object.fromEntries(served.map((f) => [f, stair.entry])),
        ...(stair.id === "stair-a" && roof ? { [roof.access.floor]: roof.access.entry } : {}),
      },
    });
  }
  return {
    cellSize: CELL, floors: navFloors, connectors,
    ...(roof ? { roofAccess: roof.access } : {}),
  };
}

/** Walkable roof surface from Exterior's roof polygon, minus parapet proximity, housing and
 *  fitted equipment. The enclosure door entry remains on the usable side of its wall. */
function buildRoofGrid(request: InteriorRequest, entry: [number, number]): WalkGrid {
  const roof = request.blueprint.roof!;
  const outline = roof.outline!;
  const grid = WalkGrid.forPolygon(outline, CELL, polygonBounds(outline));
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (grid.isWalkable(col, row) && boundaryDistance(grid.center(col, row), outline) < AGENT_RADIUS) {
        grid.set(col, row, false);
      }
    }
  }

  const bulkhead = roof.bulkhead!;
  const axisLength = Math.hypot(...bulkhead.axis) || 1;
  const axis: [number, number] = [bulkhead.axis[0] / axisLength, bulkhead.axis[1] / axisLength];
  const cross: [number, number] = [-axis[1], axis[0]];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const point = grid.center(col, row);
      const dx = point[0] - bulkhead.center[0];
      const dz = point[1] - bulkhead.center[1];
      const u = dx * axis[0] + dz * axis[1];
      const v = dx * cross[0] + dz * cross[1];
      if (Math.abs(u) <= bulkhead.width / 2 + AGENT_RADIUS && Math.abs(v) <= bulkhead.depth / 2 + AGENT_RADIUS) {
        grid.set(col, row, false);
      }
    }
  }

  for (const artifact of roof.artifacts ?? []) {
    const rotated = Math.abs(artifact.rotationDeg % 180) === 90;
    const width = rotated ? artifact.size[1] : artifact.size[0];
    const depth = rotated ? artifact.size[0] : artifact.size[1];
    grid.blockRect({
      x: artifact.center[0] - width / 2,
      z: artifact.center[1] - depth / 2,
      w: width,
      d: depth,
    }, AGENT_RADIUS);
  }

  if (!grid.isWalkableAt(entry)) {
    throw new InteriorError("E_UNREACHABLE_SPACE", "roof enclosure door has no walkable exterior entry");
  }
  return grid;
}
