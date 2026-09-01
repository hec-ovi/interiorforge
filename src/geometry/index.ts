import type { Document } from "@gltf-transform/core";
import { InteriorError } from "../core/errors.js";
import { clipPolygonToRect } from "../core/geom.js";
import { createRng } from "../core/rng.js";
import type { InteriorRequest, Rect3 } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { appendToDocument } from "../glb/io.js";
import { ceilingClear, STAIR, stairSlab } from "../layout/constants.js";
import type { CorePlan } from "../layout/core-plan.js";
import type { BuildingPlan } from "../layout/index.js";
import type { PlanRoom } from "../layout/plan-types.js";
import { toWorldPolygon } from "../layout/uv.js";
import { elevatorDoorHole, emitCoreDividers, emitElevatorDoors, emitOpenFloorShaftWalls } from "./core-geo.js";
import { emitFurniture } from "./furniture/index.js";
import { emitLightFixtures } from "./lights.js";
import { MaterialKeys } from "./materials.js";
import type { RunStep, UvStep } from "./stairs.js";
import {
  baseLanding, computeStairSteps, emitStairMeshes, entryAtLowEnd, minHeadroom, stairClearWidth,
  stairEntryHole, stepToFrameRect,
} from "./stairs.js";
import { buildFloorSurfaces, buildShaftFloors } from "./surfaces.js";
import { emitAccentWalls } from "./wall-detail.js";
import { buildFacadeLining, buildInteriorWalls } from "./walls.js";

export interface InteriorGeometry {
  doc: Document;
  /** floor index -> stair id -> frame-space tread and landing tops (see coreAngleDeg) */
  stepsByFloor: Map<number, Record<string, Rect3[]>>;
}

/** Completes the shell document with the full interior. Mutates and returns shellDoc. */
export function buildInterior(plan: BuildingPlan, request: InteriorRequest, shellDoc: Document): InteriorGeometry {
  const keys = new MaterialKeys(
    request.materialTheme, request.building.tier,
    Math.floor(createRng(request.seed, "materials").next() * 1000),
  );
  const core = plan.core;
  const mb = new MeshBuilder();
  const stepsByFloor = new Map<number, Record<string, Rect3[]>>();
  const sorted = [...plan.floors].sort((a, b) => a.floor - b.floor);
  const bpByIndex = new Map(request.blueprint.floors.map((f) => [f.index, f]));
  const stairIds: ("a" | "b")[] = core.stairB ? ["a", "b"] : ["a"];
  const lowest = sorted.find((f) => f.rooms.length > 0)!;
  /** every step of one stair over the whole building, for the fit check */
  const wholeRun = new Map<string, RunStep[]>();

  for (let i = 0; i < sorted.length; i++) {
    const floor = sorted[i]!;
    const uv = plan.uvFloors.get(floor.floor)!;
    // the ceiling of a spans-2 floor sits at the top of its open upper half
    const upper = sorted[i + 1]?.rooms.length === 0 ? sorted[i + 1] : undefined;
    const wallTop = floor.elevation + floor.height + (upper?.height ?? 0);

    // stairs climb to the next floor that has a slab
    const target = sorted.slice(i + 1).find((f) => f.rooms.length > 0);
    if (floor.rooms.length > 0) {
      const climb = target ? target.elevation - floor.elevation : 0;
      const slab = stairSlab(climb > 0 ? climb : floor.height);
      for (const which of stairIds) {
        const shaft = which === "a" ? core.stairA : core.stairB!;
        const entryLow = entryAtLowEnd(core, which);
        const steps: UvStep[] = [];
        // the lowest served floor stands on its own landing; every floor above stands on the
        // landing the climb below arrives on
        if (floor === lowest) steps.push(baseLanding(shaft, entryLow, floor.elevation, climb));
        if (target) steps.push(...computeStairSteps(shaft, entryLow, floor.elevation, climb));
        if (steps.length === 0) continue;
        const id = `stair-${which}`;
        const frameRects = steps.map((s) => stepToFrameRect(s, core.frame));
        const record = stepsByFloor.get(floor.floor) ?? {};
        record[id] = frameRects;
        stepsByFloor.set(floor.floor, record);
        wholeRun.set(id, [...(wholeRun.get(id) ?? []), ...steps.map((s) => ({ ...s, slab }))]);
        emitStairMeshes(mb, keys, core.frame, steps, slab);
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
    const spaceHeight = floor.height + (upper?.height ?? 0);
    const ceilingY = floor.elevation + ceilingClear(spaceHeight);
    buildFloorSurfaces(mb, keys, floor, spaceHeight, sealedPolys);
    // the floor's biggest room sets the wall pattern, so a venue floor and an office floor
    // never wear the same one
    const program = uv.rooms.reduce((best, r) => (r.rect.lu * r.rect.lv > best.rect.lu * best.rect.lv ? r : best)).kind;
    buildInteriorWalls(mb, keys, [...uv.rooms, ...sealedAsRooms], uv.outline, core.frame, floor.elevation, wallTop, floor.height, ceilingY, program, holes);
    buildFacadeLining(mb, keys, bpFloor, wallTop, ceilingY, program);
    emitAccentWalls(
      mb, keys, uv.rooms, uv.outline, core.frame, floor.elevation, ceilingY,
      createRng(request.seed, "accent", floor.floor),
    );
    emitCoreDividers(mb, keys, core, floor.elevation, wallTop);
    emitElevatorDoors(mb, keys, core, floor.elevation);
    emitFurniture(mb, keys, uv.furniture, core.frame, floor.elevation);
    emitLightFixtures(mb, keys, floor.lights);
  }

  buildShaftFloors(mb, keys, core, lowest.elevation);
  assertStairFit(core, wholeRun);

  removeShellSeparators(shellDoc);
  appendToDocument(shellDoc, mb);
  return { doc: shellDoc, stepsByFloor };
}

/** Stairs have to fit the player: a flight at least STAIR.clearWidth wide and STAIR.headroom
 *  clear over every tread and landing of the whole run. */
function assertStairFit(core: CorePlan, wholeRun: Map<string, RunStep[]>): void {
  const shafts: [string, typeof core.stairA][] = [["stair-a", core.stairA]];
  if (core.stairB) shafts.push(["stair-b", core.stairB]);
  for (const [id, shaft] of shafts) {
    const width = stairClearWidth(shaft);
    if (width < STAIR.clearWidth - 1e-6) {
      throw new InteriorError(
        "E_UNREACHABLE_SPACE",
        `${id} flight is ${width.toFixed(2)}m clear, below the ${STAIR.clearWidth}m the player needs`,
      );
    }
    const steps = wholeRun.get(id);
    if (!steps) continue;
    const clear = minHeadroom(steps);
    if (clear < STAIR.headroom - 1e-6) {
      throw new InteriorError(
        "E_UNREACHABLE_SPACE",
        `${id} has ${clear.toFixed(2)}m headroom along the walk line, below the ${STAIR.headroom}m minimum`,
      );
    }
  }
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
