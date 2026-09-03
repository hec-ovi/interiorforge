import { describe, expect, it } from "vitest";
import { Ajv2020 } from "ajv/dist/2020.js";
import floorSchema from "../schemas/floor.schema.json" with { type: "json" };
import type { FloorInterior, RoomDoor } from "./core/types.js";
import { readGlbBytes } from "./glb/io.js";
import { findPath, generateFloorInteriors, generateInterior, makeFixture } from "./index.js";

const fix = makeFixture({ seed: 44, floors: 7, basements: 1 });

type Point3 = [number, number, number];

function transformPoint(position: ArrayLike<number>, index: number, matrix: readonly number[]): Point3 {
  const x = Number(position[index * 3]);
  const y = Number(position[index * 3 + 1]);
  const z = Number(position[index * 3 + 2]);
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]!,
  ];
}

function clipPlane(polygon: Point3[], axis: number, boundary: number, keepGreater: boolean): Point3[] {
  const clipped: Point3[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const aInside = keepGreater ? a[axis]! >= boundary : a[axis]! <= boundary;
    const bInside = keepGreater ? b[axis]! >= boundary : b[axis]! <= boundary;
    if (aInside) clipped.push(a);
    if (aInside === bInside) continue;
    const t = (boundary - a[axis]!) / (b[axis]! - a[axis]!);
    clipped.push([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]);
  }
  return clipped;
}

function polygonArea(polygon: Point3[]): number {
  if (polygon.length < 3) return 0;
  let twiceArea = 0;
  const origin = polygon[0]!;
  for (let i = 1; i + 1 < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[i + 1]!;
    const ax = a[0] - origin[0], ay = a[1] - origin[1], az = a[2] - origin[2];
    const bx = b[0] - origin[0], by = b[1] - origin[1], bz = b[2] - origin[2];
    twiceArea += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }
  return twiceArea / 2;
}

function triangleEntersReservation(
  triangle: Point3[], reservation: FloorInterior["openingReservations"][number], elevation: number,
): boolean {
  const halfWidth = (reservation.width - 0.14) / 2 - 0.03;
  let polygon = triangle.map(([x, y, z]) => {
    const dx = x - reservation.position[0];
    const dz = z - reservation.position[1];
    return [
      dx * -reservation.inward[1] + dz * reservation.inward[0],
      y - elevation,
      dx * reservation.inward[0] + dz * reservation.inward[1],
    ] as Point3;
  });
  const bounds: [number, number][] = [
    [-halfWidth, halfWidth],
    [reservation.sill + 0.05, reservation.sill + reservation.height - 0.05],
    [0.02, reservation.depth - 0.02],
  ];
  for (let axis = 0; axis < bounds.length; axis++) {
    polygon = clipPlane(polygon, axis, bounds[axis]![0], true);
    if (polygon.length < 3) return false;
    polygon = clipPlane(polygon, axis, bounds[axis]![1], false);
    if (polygon.length < 3) return false;
  }
  return polygonArea(polygon) > 1e-8;
}

async function expectOpeningVolumesClear(
  glb: Uint8Array, floor: FloorInterior, opening?: string,
): Promise<void> {
  const document = await readGlbBytes(glb);
  const reservations = opening
    ? floor.openingReservations.filter((item) => item.opening === opening)
    : floor.openingReservations;
  for (const reservation of reservations) {
    for (const node of document.getRoot().listNodes()) {
      const matrix = node.getWorldMatrix();
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const positions = primitive.getAttribute("POSITION")!.getArray()!;
        const indices = primitive.getIndices()?.getArray();
        const count = indices?.length ?? primitive.getAttribute("POSITION")!.getCount();
        for (let i = 0; i + 2 < count; i += 3) {
          const triangle = [0, 1, 2].map((offset) =>
            transformPoint(positions, Number(indices?.[i + offset] ?? i + offset), matrix));
          expect(
            triangleEntersReservation(triangle, reservation, floor.elevation),
            `${node.getName()} enters ${reservation.opening}`,
          ).toBe(false);
        }
      }
    }
  }
}

describe("generateInterior", () => {
  it("produces a GLB plus schema-valid floor JSONs, byte-identical across runs", async () => {
    const keys = { textures: { mode: "keys" as const } };
    const a = await generateInterior(fix.request, { shellDoc: fix.shellDoc, ...keys });
    const again = makeFixture({ seed: 44, floors: 7, basements: 1 });
    const b = await generateInterior(again.request, { shellDoc: again.shellDoc, ...keys });
    expect(Buffer.from(a.glb).equals(Buffer.from(b.glb))).toBe(true);
    expect(JSON.stringify(a.floors)).toBe(JSON.stringify(b.floors));
    expect(JSON.stringify(a.npc)).toBe(JSON.stringify(b.npc));

    const document = await readGlbBytes(a.glb);
    const fabric = document.getRoot().listMaterials()
      .filter((material) => material.getName() === "cyberpunk/fabric/mid");
    expect(fabric.length).toBeGreaterThan(0);
    expect(fabric.every((material) => material.getExtras().materialVariant === "flat")).toBe(true);

    const ajv = new Ajv2020({ allErrors: false, strict: false });
    const check = ajv.compile(floorSchema);
    for (const floor of a.floors) {
      const asJson = JSON.parse(JSON.stringify(floor));
      expect(check(asJson), `floor ${floor.floor}: ${JSON.stringify(check.errors)}`).toBe(true);
    }
    expect(a.floors.filter((f) => f.floor >= 0).every((f) => f.core.elevators.length > 0)).toBe(true);
  });

  it("floorGlbs splits the interior by floor band, one GLB per blueprint floor", async () => {
    const own = makeFixture({ seed: 44, floors: 7, basements: 1 });
    const result = await generateInterior(own.request, { shellDoc: own.shellDoc, textures: { mode: "keys" }, floorGlbs: true });
    const floors = own.request.blueprint.floors;
    expect([...result.floorGlbs!.keys()].sort((a, b) => a - b)).toEqual(floors.map((f) => f.index).sort((a, b) => a - b));
    const building = await readGlbBytes(result.glb);
    const buildingMaterials = new Set(building.getRoot().listMaterials().map((m) => m.getName()));
    let vertices = 0;
    for (const floor of floors) {
      const doc = await readGlbBytes(result.floorGlbs!.get(floor.index)!);
      // a floor band reaches the slab above it; a double-height space reaches the one above that
      const upper = result.floors.find((f) => f.floor === floor.index + 1 && f.rooms.length === 0);
      const top = floor.elevation + floor.height + (upper?.height ?? 0);
      let low = Infinity;
      let high = -Infinity;
      for (const node of doc.getRoot().listNodes()) {
        expect(node.getName()).toMatch(/^interior:/);
        expect(buildingMaterials.has(node.getMesh()!.listPrimitives()[0]!.getMaterial()!.getName())).toBe(true);
        for (const prim of node.getMesh()!.listPrimitives()) {
          const pos = prim.getAttribute("POSITION")!.getArray()!;
          vertices += pos.length / 3;
          for (let i = 1; i < pos.length; i += 3) {
            low = Math.min(low, pos[i]!);
            high = Math.max(high, pos[i]!);
          }
        }
      }
      expect(low, `floor ${floor.index} bottom`).toBeGreaterThanOrEqual(floor.elevation - 1.5);
      expect(high, `floor ${floor.index} top`).toBeLessThanOrEqual(top + 1e-4);
    }
    let interiorVertices = 0;
    for (const node of building.getRoot().listNodes()) {
      if (!node.getName().startsWith("interior:")) continue;
      for (const prim of node.getMesh()!.listPrimitives()) interiorVertices += prim.getAttribute("POSITION")!.getCount();
    }
    expect(vertices).toBe(interiorVertices);
  });

  it("generates the same floor GLBs without a combined building allocation", async () => {
    const streamedFixture = makeFixture({ seed: 1, floors: 16, basements: 1 });
    const shellNodes = streamedFixture.shellDoc.getRoot().listNodes().map((node) => node.getName());
    const streamed = await generateFloorInteriors(streamedFixture.request, {
      shellDoc: streamedFixture.shellDoc, textures: { mode: "keys" },
    });
    expect(streamed).not.toHaveProperty("glb");
    expect(streamed.floorGlbs.size).toBe(streamedFixture.request.blueprint.floors.length);
    expect(streamedFixture.shellDoc.getRoot().listNodes().map((node) => node.getName())).toEqual(shellNodes);

    const combinedFixture = makeFixture({ seed: 1, floors: 16, basements: 1 });
    const combined = await generateInterior(combinedFixture.request, {
      shellDoc: combinedFixture.shellDoc, textures: { mode: "keys" }, floorGlbs: true,
    });
    expect(streamed.floors).toEqual(combined.floors);
    expect(streamed.npc).toEqual(combined.npc);
    for (const [floor, bytes] of streamed.floorGlbs) {
      expect(Buffer.from(bytes).equals(Buffer.from(combined.floorGlbs!.get(floor)!))).toBe(true);
    }
  });

  it("builds a producer-shaped open shop front as a clear, reachable portal without leaves", async () => {
    // The open edge is 11 degrees off the layout frame. Its center is 1.22 m from the
    // hall's rectangular working edge, while the clipped hall still owns the threshold.
    const outline: [number, number][] = [
      [120.086, 172.54], [95.279, 185.344], [83.844, 150.793], [101.852, 140.533],
    ];
    const base = makeFixture({ seed: "open-front", floors: 2, type: "commerce", outline });
    const blueprint = structuredClone(base.request.blueprint);
    const ground = blueprint.floors.find((floor) => floor.index === 0)!;
    ground.kind = "commerce";
    const opening = {
      id: "open-front:main", kind: "openFront" as const, edge: 1, offset: 1, width: 12,
      height: 3.4, sill: 0,
      portal: {
        frameWidth: 0.15, frameDepth: 0.18, recessDepth: 0.35,
        clearWidth: 11.68, clearHeight: 3.25, clearDepth: 0.35,
      },
      accessRole: "main" as const,
      material: "cyberpunk/window-frame/mid",
    };
    ground.openings = [opening, ...ground.openings.filter((item) => item.edge !== opening.edge && item.kind !== "door")];
    const fix = makeFixture({ seed: "open-front", blueprint, type: "commerce" });

    const result = await generateInterior(fix.request, {
      shellDoc: fix.shellDoc, textures: { mode: "keys" },
    });
    const floor = result.floors.find((item) => item.floor === 0)!;
    expect(floor.kind).toBe("retail");
    const room = floor.rooms.find((item) => item.doors.some((door) => door.kind === "openFront"))!;
    expect(room.kind).toBe("sales_floor");
    const portal = room.doors.find((door) => door.kind === "openFront")!;
    expect(portal).toMatchObject({
      kind: "openFront", to: "outside", width: opening.portal.clearWidth,
      clearHeight: opening.portal.clearHeight, clearDepth: opening.portal.clearDepth,
    });
    expect(portal).not.toHaveProperty("leaves");
    const edgeA = ground.outline[opening.edge]!;
    const edgeB = ground.outline[(opening.edge + 1) % ground.outline.length]!;
    const edgeLength = Math.hypot(edgeB[0] - edgeA[0], edgeB[1] - edgeA[1]);
    const centerT = (opening.offset + opening.width / 2) / edgeLength;
    expect(portal.position[0]).toBeCloseTo(edgeA[0] + (edgeB[0] - edgeA[0]) * centerT, 2);
    expect(portal.position[1]).toBeCloseTo(edgeA[1] + (edgeB[1] - edgeA[1]) * centerT, 2);
    const edgeAngle = ((Math.atan2(edgeB[1] - edgeA[1], edgeB[0] - edgeA[0]) * 180) / Math.PI + 360) % 360;
    expect(portal.angleDeg).toBeCloseTo(edgeAngle, 2);

    const entrance = result.npc.anchors.find((anchor) => anchor.floor === 0 && anchor.kind === "entrance")!;
    expect(entrance).toBeTruthy();
    for (const anchor of result.npc.anchors) {
      expect(findPath(
        result.npc,
        { floor: entrance.floor, position: entrance.position },
        { floor: anchor.floor, position: anchor.position },
      ), `no route from open front to ${anchor.id}`).not.toBeNull();
    }

    const ajv = new Ajv2020({ allErrors: false, strict: false });
    const check = ajv.compile(floorSchema);
    expect(check(JSON.parse(JSON.stringify(floor))), JSON.stringify(check.errors)).toBe(true);
  });

  it("publishes and enforces Exterior opening and moving-door reservations", async () => {
    const source = makeFixture({ seed: "opening-reservation", floors: 1, type: "commerce", width: 28, depth: 20 });
    const blueprint = structuredClone(source.request.blueprint);
    blueprint.facade = {
      ...blueprint.facade,
      // This shallow lining makes the room-grid edge land beyond the old point-contact
      // tolerance. The full triangle-volume check must still reject a facade band there.
      wallDepth: 0.23,
      // Deliberately permit no endpoints: every proposed terminal partition must be
      // reallocated short of the facade reservations rather than accepted through one.
      grids: blueprint.floors.flatMap((item) => item.outline.map((_, edge) => ({
        floor: item.index, edge, partitionAnchors: [],
      }))),
    };
    const ground = blueprint.floors[0]!;
    const entrance = ground.openings.find((opening) => opening.kind === "door")!;
    entrance.door = { motion: { clearDepth: 2.2 } };
    const reserved = makeFixture({ seed: "opening-reservation", blueprint, type: "commerce" });

    const result = await generateInterior(reserved.request, {
      shellDoc: reserved.shellDoc, textures: { mode: "keys" }, floorGlbs: true,
    });
    const floor = result.floors[0]!;
    const volume = floor.openingReservations.find((item) => item.opening === entrance.id)!;
    expect(volume).toMatchObject({
      opening: entrance.id, kind: "door", sill: 0, height: entrance.height,
      depth: 2.27,
    });
    expect(volume.width).toBeCloseTo(entrance.width + 0.14, 3);
    expect(Math.hypot(...volume.inward)).toBeCloseTo(1, 3);

    const exteriorDoor = floor.rooms.flatMap((room) => room.doors)
      .find((door) => door.to === "outside" && door.width === entrance.width)!;
    expect(exteriorDoor).toMatchObject({ clearDepth: 2.2 });

    await expectOpeningVolumesClear(result.floorGlbs!.get(0)!, floor);

    const ajv = new Ajv2020({ allErrors: false, strict: false });
    const check = ajv.compile(floorSchema);
    expect(check(JSON.parse(JSON.stringify(floor))), JSON.stringify(check.errors)).toBe(true);
  });

  it("moves the complete secondary stair behind a deep facade door reservation", async () => {
    const source = makeFixture({
      seed: "core-opening-reservation", floors: 10, type: "residential", width: 40, depth: 24,
    });
    const blueprint = structuredClone(source.request.blueprint);
    const firstApartment = blueprint.floors.find((item) => item.index === 1)!;
    const opening = firstApartment.openings.find(
      (item) => item.edge === 1 && item.offset < 11 && item.offset + item.width > 10.5,
    )!;
    Object.assign(opening, {
      kind: "balconyDoor", sill: 0, height: 2.2,
      door: { motion: { clearDepth: 2 } },
    });
    const fixture = makeFixture({ seed: "core-opening-reservation", blueprint, type: "residential" });
    const result = await generateFloorInteriors(fixture.request, {
      shellDoc: fixture.shellDoc, textures: { mode: "keys" },
    });
    const floor = result.floors.find((item) => item.floor === 1)!;
    const reservation = floor.openingReservations.find((item) => item.opening === opening.id)!;
    const stair = floor.core.stairs.find((item) => item.id === "stair-b")!;

    expect(floor.coreAngleDeg).toBe(0);
    expect(stair.rect.x + stair.rect.w).toBeLessThanOrEqual(
      reservation.position[0] - reservation.depth + 1e-6,
    );
    await expectOpeningVolumesClear(result.floorGlbs.get(1)!, floor, opening.id);
  });

  it("emits doorway casings as closed face trims without occupying the wall reveal", async () => {
    const fixture = makeFixture({ seed: "casing-section", floors: 2, type: "offices" });
    const result = await generateFloorInteriors(fixture.request, {
      shellDoc: fixture.shellDoc, textures: { mode: "keys" },
    });
    const floor = result.floors.find((item) => item.floor === 0)!;
    const door = floor.rooms.flatMap((room) => room.doors)
      .find((item): item is RoomDoor => item.to !== "outside" && item.kind !== "openFront")!;
    const angle = door.angleDeg * Math.PI / 180;
    const along: [number, number] = [Math.cos(angle), Math.sin(angle)];
    const inward: [number, number] = [-along[1], along[0]];
    const head = floor.elevation + (door.leaves >= 3 ? 3 : 2.5);
    const document = await readGlbBytes(result.floorGlbs.get(0)!);
    const node = document.getRoot().listNodes()
      .find((item) => item.getName().includes("/door/"))!;
    const primitive = node.getMesh()!.listPrimitives()[0]!;
    const positions = primitive.getAttribute("POSITION")!.getArray()!;
    const indices = primitive.getIndices()!.getArray()!;
    const depths: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const vertices = [0, 1, 2].map((offset) => {
        const at = Number(indices[i + offset]) * 3;
        return [positions[at]!, positions[at + 1]!, positions[at + 2]!] as const;
      });
      const center = vertices.reduce<[number, number, number]>((sum, vertex) => [
        sum[0] + vertex[0] / 3, sum[1] + vertex[1] / 3, sum[2] + vertex[2] / 3,
      ], [0, 0, 0]);
      const dx = center[0] - door.position[0];
      const dz = center[2] - door.position[1];
      if (Math.abs(center[1] - head) > 0.09 || Math.abs(dx * along[0] + dz * along[1]) > door.width / 2) continue;
      const projection = vertices.map((vertex) =>
        (vertex[0] - door.position[0]) * inward[0] + (vertex[2] - door.position[1]) * inward[1]);
      depths.push(Math.max(...projection) - Math.min(...projection));
    }
    expect(depths.length).toBeGreaterThan(0);
    expect(Math.max(...depths)).toBeLessThanOrEqual(0.0201);
  });

  it("connects the last served floor to Exterior's roof threshold and nav surface", async () => {
    const source = makeFixture({ seed: "roof-access", floors: 5, type: "hotel", width: 30, depth: 22 });
    const blueprint = structuredClone(source.request.blueprint);
    const top = blueprint.floors.at(-1)!;
    const roofElevation = top.elevation + top.height;
    blueprint.roof = {
      elevation: roofElevation,
      outline: top.outline,
      parapetHeight: 1,
      bulkhead: {
        center: [15, 11], axis: [-1, 0], width: 8, depth: 8,
        housingHeight: 2.7, doorNormal: [0, -1], doorWidth: 1, doorHeight: 2.1,
      },
      artifacts: [{ kind: "hvac", center: [23, 15], size: [1.5, 1, 1], rotationDeg: 0 }],
    };
    const fixture = makeFixture({ seed: "roof-access", blueprint, type: "hotel" });
    const result = await generateFloorInteriors(fixture.request, {
      shellDoc: fixture.shellDoc, textures: { mode: "keys" },
    });

    const access = result.npc.nav.roofAccess!;
    expect(access).toMatchObject({
      floor: top.index + 1,
      elevation: roofElevation,
      stair: "stair-a",
      door: { thresholdElevation: roofElevation, width: 1, height: 2.1 },
    });
    expect(access.landing).toHaveLength(4);
    expect(result.npc.nav.floors.some((floor) => floor.floor === access.floor)).toBe(true);

    const topInterior = result.floors.find((floor) => floor.floor === top.index)!;
    const stair = topInterior.core.stairs.find((item) => item.id === "stair-a")!;
    expect(Math.max(...stair.steps!.map((step) => step.y))).toBeCloseTo(roofElevation, 6);
    const start = result.npc.anchors.find((anchor) =>
      anchor.floor === top.index && anchor.kind === "stair_entry")!;
    const path = findPath(
      result.npc,
      { floor: start.floor, position: start.position },
      { floor: access.floor, position: access.entry },
    )!;
    expect(path.some((leg) => leg.kind === "ride" && leg.connector === "stair-a")).toBe(true);
  });

  it("rejects a malformed request with E_BLUEPRINT_INVALID", async () => {
    await expect(generateInterior({ nonsense: true })).rejects.toMatchObject({ code: "E_BLUEPRINT_INVALID" });
  });

  it("rejects a shell that does not match the blueprint with E_SHELL_MISMATCH", async () => {
    const tiny = makeFixture({ seed: 44, floors: 7, width: 9, depth: 9 });
    await expect(
      generateInterior(fix.request, { shellDoc: tiny.shellDoc }),
    ).rejects.toMatchObject({ code: "E_SHELL_MISMATCH" });
  });

  it("reports an unreadable shell through the closed error set", async () => {
    const request = structuredClone(fix.request);
    request.shellGlb = "fixtures/missing-shell.glb";
    await expect(generateInterior(request, { textures: { mode: "keys" } }))
      .rejects.toMatchObject({ code: "E_SHELL_MISMATCH", message: /cannot read shell GLB/ });
  });
});
