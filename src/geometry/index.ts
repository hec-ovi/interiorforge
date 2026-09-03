import type { Document } from "@gltf-transform/core";
import { InteriorError } from "../core/errors.js";
import type { Point } from "../core/geom.js";
import { clipPolygonToRect, insetPolygon } from "../core/geom.js";
import { createRng } from "../core/rng.js";
import type { InteriorRequest, Rect3 } from "../core/types.js";
import { MeshBuilder } from "../glb/mesh-builder.js";
import { gridOrigin } from "../layout/tile-fit.js";
import { appendToDocument } from "../glb/io.js";
import { STAIR, stairSlab } from "../layout/constants.js";
import type { CorePlan } from "../layout/core-plan.js";
import type { BuildingPlan } from "../layout/index.js";
import { planRoofAccess } from "../layout/roof-access.js";
import type { PlanRoom } from "../layout/plan-types.js";
import { facadeDepth, SHELL_WALL, shellWallDepth } from "../layout/shell.js";
import type { UvRect } from "../layout/uv.js";
import { toWorldPolygon } from "../layout/uv.js";
import { elevatorDoorHole, emitCoreDividers, emitElevatorDoors, emitOpenFloorShaftWalls } from "./core-geo.js";
import { assertDoorwaysClear, floorDoorways, openFrontClearances } from "./door-clear.js";
import { emitFurniture } from "./furniture/index.js";
import { emitLightFixtures } from "./lights.js";
import { MaterialKeys } from "./materials.js";
import { emitRoofLanding } from "./roof-access.js";
import { stairClearance } from "./stair-clearance.js";
import type { RunStep, UvStep } from "./stairs.js";
import {
  baseLanding, computeStairSteps, emitStairMeshes, entryAtLowEnd, minHeadroom, stairClearWidth,
  stairEntryHole, stepToFrameRect,
} from "./stairs.js";
import { assertInsideShell } from "./shell-fit.js";
import { buildFloorSurfaces, buildShaftFloors } from "./surfaces.js";
import { buildFacadeLining } from "./lining.js";
import { buildInteriorWalls } from "./walls.js";

export interface InteriorBands {
  /** floor index -> stair id -> frame-space tread and landing tops (see coreAngleDeg) */
  stepsByFloor: Map<number, Record<string, Rect3[]>>;
  /** the same geometry split by floor band: what stands between a floor's slab and the
   *  next (its stair climb included), the shaft floors under the lowest served floor */
  floorMeshes: Map<number, MeshBuilder>;
}

export interface InteriorGeometry extends InteriorBands {
  doc: Document;
}

/** Completes the shell document with the full interior. Mutates and returns shellDoc. */
export function buildInterior(plan: BuildingPlan, request: InteriorRequest, shellDoc: Document): InteriorGeometry {
  const bands = buildInteriorBands(plan, request);
  const whole = new MeshBuilder();
  for (const floor of [...plan.floors].sort((a, b) => a.floor - b.floor)) {
    whole.merge(bands.floorMeshes.get(floor.floor)!);
  }
  removeShellSeparators(shellDoc);
  appendToDocument(shellDoc, whole);
  return { doc: shellDoc, ...bands };
}

/** Builds and validates each floor band without allocating the combined document. */
export function buildInteriorBands(plan: BuildingPlan, request: InteriorRequest): InteriorBands {
  const keys = new MaterialKeys(request.materialTheme, request.building.tier);
  const core = plan.core;
  const floorMeshes = new Map<number, MeshBuilder>();
  const stepsByFloor = new Map<number, Record<string, Rect3[]>>();
  const sorted = [...plan.floors].sort((a, b) => a.floor - b.floor);
  const bpByIndex = new Map(request.blueprint.floors.map((f) => [f.index, f]));
  const stairIds: ("a" | "b")[] = core.stairB ? ["a", "b"] : ["a"];
  const lowest = sorted.find((f) => f.rooms.length > 0)!;
  /** Every step of one stair, floor by floor, for geometry-level clearance checks. */
  const runs = new Map<string, Map<number, RunStep[]>>();
  const facade = request.blueprint.facade;
  const wallDepth = shellWallDepth(facade);
  const roofAccess = planRoofAccess(request, core);
  const highestServed = [...sorted].reverse().find((floor) => floor.rooms.length > 0)!;

  for (let i = 0; i < sorted.length; i++) {
    const floor = sorted[i]!;
    const uv = plan.uvFloors.get(floor.floor)!;
    const mb = new MeshBuilder(core.frame, gridOrigin(uv.outline));
    floorMeshes.set(floor.floor, mb);
    // the ceiling of a spans-2 floor sits at the top of its open upper half
    const upper = sorted[i + 1]?.rooms.length === 0 ? sorted[i + 1] : undefined;
    const wallTop = floor.elevation + floor.height + (upper?.height ?? 0);

    // stairs climb to the next floor that has a slab
    const target = sorted.slice(i + 1).find((f) => f.rooms.length > 0);
    if (floor.rooms.length > 0) {
      for (const which of stairIds) {
        const roofClimb = which === "a" && floor === highestServed && roofAccess
          ? roofAccess.access.elevation - floor.elevation
          : 0;
        const climb = target ? target.elevation - floor.elevation : roofClimb;
        const slab = stairSlab(climb > 0 ? climb : floor.height);
        const shaft = which === "a" ? core.stairA : core.stairB!;
        const entryLow = entryAtLowEnd(core, which);
        const steps: UvStep[] = [];
        // the lowest served floor stands on its own landing; every floor above stands on the
        // landing the climb below arrives on
        if (floor === lowest) steps.push(baseLanding(shaft, entryLow, floor.elevation));
        if (climb > 0) steps.push(...computeStairSteps(shaft, entryLow, floor.elevation, climb));
        if (steps.length === 0) continue;
        const id = `stair-${which}`;
        const frameRects = steps.map((s) => stepToFrameRect(s, core.frame));
        const record = stepsByFloor.get(floor.floor) ?? {};
        record[id] = frameRects;
        stepsByFloor.set(floor.floor, record);
        const run = runs.get(id) ?? new Map<number, RunStep[]>();
        run.set(floor.floor, steps.map((s) => ({ ...s, slab })));
        runs.set(id, run);
        emitStairMeshes(mb, keys, core.frame, steps, slab);
        if (roofClimb > 0) emitRoofLanding(mb, keys, core, roofAccess!);
      }
    }

    if (floor.rooms.length === 0) {
      emitOpenFloorShaftWalls(mb, keys, core, uv.sealed, floor.elevation, floor.elevation + floor.height);
      mb.seal();
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
    // slabs reach the lining's outer face; walls end inside the lining; nothing crosses it
    const slabPlate = insetPolygon(uv.outline, wallDepth);
    const wallPlate = insetPolygon(uv.outline, wallDepth + SHELL_WALL.lining / 2);
    const cut = (rect: UvRect, plate: Point[]): Point[] =>
      toWorldPolygon(clipPolygonToRect(plate, { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv }), core.frame);
    const roomPlans = uv.rooms.map((r) => ({ kind: r.kind, polygon: cut(r.rect, slabPlate) }));
    const sealedPolys = uv.sealed.map((rect) => cut(rect, slabPlate));
    const ceilingY = floor.ceilingElevation;
    buildFloorSurfaces(mb, keys, roomPlans.filter((r) => r.polygon.length >= 3), floor.elevation, ceilingY, sealedPolys.filter((p) => p.length >= 3));
    // the floor's biggest room sets the wall pattern, so a venue floor and an office floor
    // never wear the same one
    const program = uv.rooms.reduce((best, r) => (r.rect.lu * r.rect.lv > best.rect.lu * best.rect.lv ? r : best)).kind;
    buildInteriorWalls(
      mb, keys, [...uv.rooms, ...sealedAsRooms], bpFloor, facade, uv.outline, wallPlate,
      facadeDepth(facade), core.frame, floor.elevation,
      wallTop, ceilingY, program, holes, createRng(request.seed, "accent", floor.floor),
    );
    buildFacadeLining(mb, keys, bpFloor, wallDepth, wallTop, ceilingY, program);
    emitCoreDividers(mb, keys, core, floor.elevation, wallTop);
    emitElevatorDoors(mb, keys, core, floor.elevation);
    emitFurniture(mb, keys, uv.furniture, core.frame, floor.elevation);
    emitLightFixtures(mb, keys, floor.lights);
    assertDoorwaysClear(mb, [
      ...floorDoorways(uv.rooms, core.frame, floor.elevation, ceilingY),
      ...openFrontClearances(bpFloor, wallDepth),
    ], floor.floor);
    if (floor !== lowest) mb.seal();
  }

  const lowestMesh = floorMeshes.get(lowest.floor)!;
  buildShaftFloors(lowestMesh, keys, core, lowest.elevation);
  lowestMesh.seal();
  assertStairFit(core, runs, sorted.map((floor) => ({ ...floor, mesh: floorMeshes.get(floor.floor)! })));
  for (const mesh of floorMeshes.values()) assertInsideShell(mesh, request.blueprint.floors, wallDepth);
  return { stepsByFloor, floorMeshes };
}

/** Validate both stair arithmetic and the geometry actually emitted around each run. */
function assertStairFit(
  core: CorePlan, runs: Map<string, Map<number, RunStep[]>>,
  bands: { elevation: number; height: number; mesh: MeshBuilder }[],
): void {
  const shafts: [string, typeof core.stairA][] = [["stair-a", core.stairA]];
  if (core.stairB) shafts.push(["stair-b", core.stairB]);
  for (const [id, shaft] of shafts) {
    const width = stairClearWidth(shaft);
    if (width < STAIR.flightWidth - 1e-6) {
      throw new InteriorError(
        "E_UNREACHABLE_SPACE",
        `${id} flight is ${width.toFixed(2)}m clear, below the ${STAIR.flightWidth}m minimum`,
      );
    }
    const byFloor = runs.get(id);
    if (!byFloor) continue;
    const clear = minHeadroom([...byFloor.values()].flat());
    if (clear < STAIR.headroom - 1e-6) {
      throw new InteriorError(
        "E_UNREACHABLE_SPACE",
        `${id} has ${clear.toFixed(2)}m headroom along the walk line, below the ${STAIR.headroom}m minimum`,
      );
    }
    for (const [floor, steps] of byFloor) {
      const low = Math.min(...steps.map((step) => step.y));
      const high = Math.max(...steps.map((step) => step.y)) + STAIR.headroom + STAIR.slab;
      const nearby = bands
        .filter((band) => band.elevation <= high && band.elevation + band.height >= low)
        .map((band) => band.mesh);
      const probe = stairClearance(shaft, core.frame, steps, nearby);
      if (probe.clear < STAIR.headroom - 1e-6) {
        throw new InteriorError(
          "E_UNREACHABLE_SPACE",
          `${id} runs into ${probe.material} ${probe.clear.toFixed(2)}m over a step at y ${probe.step.y.toFixed(2)}, below the ${STAIR.headroom}m minimum`,
          floor,
        );
      }
    }
  }
}

/** Removes the shell's separator planes (exterior naming: floor:<index>/slab) before
 *  adding interior slabs with shaft holes. */
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
