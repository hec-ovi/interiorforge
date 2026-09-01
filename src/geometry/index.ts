import type { Document } from "@gltf-transform/core";
import type { InteriorRequest, Rect3 } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { appendToDocument } from "../glb/io.js";
import type { BuildingPlan } from "../layout/index.js";
import { elevatorDoorHole, emitCoreDividers, emitElevatorDoors, emitOpenFloorShaftWalls } from "./core-geo.js";
import { emitFurniture } from "./furniture-geo.js";
import { MaterialKeys } from "./materials.js";
import { computeStairSteps, emitStairMeshes, entryAtLowEnd, stairEntryHole } from "./stairs.js";
import { buildFloorSurfaces, buildShaftFloors } from "./surfaces.js";
import { buildFacadeLining, buildInteriorWalls } from "./walls.js";

export interface InteriorGeometry {
  doc: Document;
  /** floor index -> stair id -> world tread and landing tops */
  stepsByFloor: Map<number, Record<string, Rect3[]>>;
}

/** Completes the shell document with the full interior. Mutates and returns shellDoc. */
export function buildInterior(plan: BuildingPlan, request: InteriorRequest, shellDoc: Document): InteriorGeometry {
  const keys = new MaterialKeys(request.materialTheme, request.building.tier);
  const mb = new MeshBuilder();
  const stepsByFloor = new Map<number, Record<string, Rect3[]>>();
  const sorted = [...plan.floors].sort((a, b) => a.floor - b.floor);
  const bpByIndex = new Map(request.blueprint.floors.map((f) => [f.index, f]));

  for (let i = 0; i < sorted.length; i++) {
    const floor = sorted[i]!;
    // the ceiling of a spans-2 floor sits at the top of its open upper half
    const upper = sorted[i + 1]?.rooms.length === 0 ? sorted[i + 1] : undefined;
    const wallTop = floor.elevation + floor.height + (upper?.height ?? 0);

    // stairs climb to the next floor that has a slab
    const target = sorted.slice(i + 1).find((f) => f.rooms.length > 0);
    if (floor.rooms.length > 0 && target) {
      for (const stair of floor.core.stairs) {
        const steps = computeStairSteps(stair.rect, entryAtLowEnd(stair), floor.elevation, target.elevation - floor.elevation);
        const record = stepsByFloor.get(floor.floor) ?? {};
        record[stair.id] = steps;
        stepsByFloor.set(floor.floor, record);
        emitStairMeshes(mb, keys, steps);
      }
    }

    if (floor.rooms.length === 0) {
      emitOpenFloorShaftWalls(mb, keys, floor, floor.elevation + floor.height);
      continue;
    }

    const bpFloor = bpByIndex.get(floor.floor)!;
    const holes = [
      ...floor.core.elevators.map((e) => elevatorDoorHole(e, floor.elevation)),
      ...floor.core.stairs.map((s) => stairEntryHole(s, floor.elevation)),
    ];
    buildFloorSurfaces(mb, keys, floor, floor.height + (upper?.height ?? 0));
    buildInteriorWalls(mb, keys, floor, bpFloor.outline, holes, wallTop);
    buildFacadeLining(mb, keys, bpFloor, wallTop);
    emitCoreDividers(mb, keys, floor, wallTop);
    emitElevatorDoors(mb, keys, floor);
    emitFurniture(mb, keys, floor);
  }

  const lowest = sorted.find((f) => f.rooms.length > 0)!;
  buildShaftFloors(mb, keys, lowest);

  removeShellSeparators(shellDoc);
  appendToDocument(shellDoc, mb);
  return { doc: shellDoc, stepsByFloor };
}

/** The shell's separator planes (exterior naming: floor:<index>/slab) get replaced by
 *  our slabs with real shaft holes. */
const SLAB_NODE = /^floor:-?\d+\/slab$/;

function removeShellSeparators(doc: Document): void {
  for (const node of doc.getRoot().listNodes()) {
    if (SLAB_NODE.test(node.getName())) {
      node.getMesh()?.dispose();
      node.dispose();
    }
  }
  for (const mesh of doc.getRoot().listMeshes()) {
    if (SLAB_NODE.test(mesh.getName())) mesh.dispose();
  }
}
