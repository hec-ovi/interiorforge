import type { Document } from "@gltf-transform/core";
import { clipPolygonToRect } from "../core/geom.js";
import type { InteriorRequest, Rect3 } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { appendToDocument } from "../glb/io.js";
import type { BuildingPlan } from "../layout/index.js";
import type { PlanRoom } from "../layout/plan-types.js";
import { toWorldPolygon } from "../layout/uv.js";
import { elevatorDoorHole, emitCoreDividers, emitElevatorDoors, emitOpenFloorShaftWalls } from "./core-geo.js";
import { emitFurniture } from "./furniture-geo.js";
import { emitLightFixtures } from "./lights.js";
import { MaterialKeys } from "./materials.js";
import { computeStairSteps, emitStairMeshes, entryAtLowEnd, stairEntryHole, stepToFrameRect } from "./stairs.js";
import { buildFloorSurfaces, buildShaftFloors } from "./surfaces.js";
import { buildFacadeLining, buildInteriorWalls } from "./walls.js";

export interface InteriorGeometry {
  doc: Document;
  /** floor index -> stair id -> frame-space tread and landing tops (see coreAngleDeg) */
  stepsByFloor: Map<number, Record<string, Rect3[]>>;
}

/** Completes the shell document with the full interior. Mutates and returns shellDoc. */
export function buildInterior(plan: BuildingPlan, request: InteriorRequest, shellDoc: Document): InteriorGeometry {
  const keys = new MaterialKeys(request.materialTheme, request.building.tier);
  const core = plan.core;
  const mb = new MeshBuilder();
  const stepsByFloor = new Map<number, Record<string, Rect3[]>>();
  const sorted = [...plan.floors].sort((a, b) => a.floor - b.floor);
  const bpByIndex = new Map(request.blueprint.floors.map((f) => [f.index, f]));

  for (let i = 0; i < sorted.length; i++) {
    const floor = sorted[i]!;
    const uv = plan.uvFloors.get(floor.floor)!;
    // the ceiling of a spans-2 floor sits at the top of its open upper half
    const upper = sorted[i + 1]?.rooms.length === 0 ? sorted[i + 1] : undefined;
    const wallTop = floor.elevation + floor.height + (upper?.height ?? 0);

    // stairs climb to the next floor that has a slab
    const target = sorted.slice(i + 1).find((f) => f.rooms.length > 0);
    if (floor.rooms.length > 0 && target) {
      const stairIds: ("a" | "b")[] = core.stairB ? ["a", "b"] : ["a"];
      for (const which of stairIds) {
        const shaft = which === "a" ? core.stairA : core.stairB!;
        const steps = computeStairSteps(shaft, entryAtLowEnd(core, which), floor.elevation, target.elevation - floor.elevation);
        const record = stepsByFloor.get(floor.floor) ?? {};
        record[`stair-${which}`] = steps.map((s) => stepToFrameRect(s, core.frame));
        stepsByFloor.set(floor.floor, record);
        emitStairMeshes(mb, keys, core.frame, steps);
      }
    }

    if (floor.rooms.length === 0) {
      emitOpenFloorShaftWalls(mb, keys, core, uv.sealed, floor.elevation, floor.elevation + floor.height);
      continue;
    }

    const bpFloor = bpByIndex.get(floor.floor)!;
    const holes = [
      ...core.elevators.map((_, idx) => elevatorDoorHole(core, idx, floor.elevation)),
      stairEntryHole(core, "a", floor.elevation),
      ...(core.stairB ? [stairEntryHole(core, "b", floor.elevation)] : []),
    ];
    // sealed voids are walled and slabbed like rooms, minus doors and reachability
    const sealedAsRooms: PlanRoom[] = uv.sealed.map((rect, s) => ({
      id: `sealed-${s}`, kind: "mechanical_room", rect, doors: [],
    }));
    const sealedPolys = uv.sealed
      .map((rect) => clipPolygonToRect(uv.outline, { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv }))
      .filter((poly) => poly.length >= 3)
      .map((poly) => toWorldPolygon(poly, core.frame));
    buildFloorSurfaces(mb, keys, floor, floor.height + (upper?.height ?? 0), sealedPolys);
    buildInteriorWalls(mb, keys, [...uv.rooms, ...sealedAsRooms], uv.outline, core.frame, floor.elevation, wallTop, floor.height, holes);
    buildFacadeLining(mb, keys, bpFloor, wallTop);
    emitCoreDividers(mb, keys, core, floor.elevation, wallTop);
    emitElevatorDoors(mb, keys, core, floor.elevation);
    emitFurniture(mb, keys, uv.furniture, core.frame, floor.elevation);
    emitLightFixtures(mb, keys, floor.lights);
  }

  const lowest = sorted.find((f) => f.rooms.length > 0)!;
  buildShaftFloors(mb, keys, core, lowest.elevation);

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
