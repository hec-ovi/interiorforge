import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import type { Point } from "../core/geom.js";
import { clipPolygonToRect, insetPolygon, polygonArea, polygonBounds } from "../core/geom.js";
import { createDocument, readGlbBytes, writeGlb } from "../glb/io.js";
import { planBuilding } from "../layout/index.js";
import type { PlanRoom } from "../layout/plan-types.js";
import { roomPolygon } from "../layout/room-shape.js";
import { shellWallDepth } from "../layout/shell.js";
import { buildInterior, buildInteriorBands } from "./index.js";

type Vertex = [number, number, number];
type Triangle = { material: string; points: [Vertex, Vertex, Vertex] };

async function trianglesOf(glb: Uint8Array): Promise<Triangle[]> {
  const doc = await readGlbBytes(glb);
  const triangles: Triangle[] = [];
  for (const node of doc.getRoot().listNodes()) {
    if (!node.getName().startsWith("interior:")) continue;
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const position = primitive.getAttribute("POSITION")!.getArray()!;
      const index = primitive.getIndices()!.getArray()!;
      for (let i = 0; i < index.length; i += 3) {
        triangles.push({ material: primitive.getMaterial()!.getName(), points: [0, 1, 2].map((offset) => {
          const k = index[i + offset]! * 3;
          return [position[k]!, position[k + 1]!, position[k + 2]!];
        }) as Triangle["points"] });
      }
    }
  }
  return triangles;
}

/** Intersections along Z at a chosen X/Y, independent of face winding. */
function crossings(triangles: Triangle[], x: number, y: number, z0: number, z1: number): Triangle[] {
  return triangles.filter(({ points: [a, b, c] }) => {
    const divisor = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(divisor) < 1e-10) return false;
    const p = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / divisor;
    const q = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / divisor;
    const z = a[2] * p + b[2] * q + c[2] * (1 - p - q);
    return p >= -1e-7 && q >= -1e-7 && p + q <= 1 + 1e-7 && z > z0 && z < z1;
  });
}

describe("room polygon geometry", () => {
  it("keeps actual core and service ownership inside a surrounding room in merged and streamed bands", async () => {
    const fixture = makeFixture({ seed: 8, floors: 2, width: 30, depth: 20, type: "offices", rotationDeg: 0 });
    const plan = planBuilding(fixture.request, resolveAssignments(fixture.request));
    const { core } = plan;
    const rectRing = (u: number, v: number, lu: number, lv: number): Point[] =>
      [[u, v], [u + lu, v], [u + lu, v + lv], [u, v + lv]];
    const coreEnd = core.riser.u + core.riser.lu;
    const coreHole = rectRing(core.stairA.u, core.vFace, coreEnd - core.stairA.u, core.depth).reverse();
    const stair = core.stairB!;
    const stairHole = rectRing(stair.u, stair.v, stair.lu, stair.lv).reverse();
    const service = rectRing(4, 3, 4, 3);
    const lower = plan.floors[0]!, upper = plan.floors[1]!;
    lower.ceilingElevation = upper.elevation - 0.15;
    let expectedArea = 0;
    for (const floor of plan.floors) {
      const uv = plan.uvFloors.get(floor.floor)!;
      const polygon = insetPolygon(uv.outline, shellWallDepth(fixture.request.blueprint.facade));
      const bounds = polygonBounds(polygon);
      const main: PlanRoom = {
        id: `f${floor.floor}-main`, kind: "living", polygon,
        holes: [coreHole, stairHole, [...service].reverse()],
        rect: { u: bounds.x, v: bounds.z, lu: bounds.w, lv: bounds.d },
        doors: uv.rooms.flatMap((room) => room.doors.filter((door) => door.to === "outside")),
      };
      const utility: PlanRoom = {
        id: `f${floor.floor}-service`, kind: "mechanical_room", polygon: service,
        rect: { u: 4, v: 3, lu: 4, lv: 3 }, doors: [],
      };
      const door = {
        id: `f${floor.floor}-service-door`, leaves: 1 as const, width: 1,
        at: 6, position: [6, 3] as Point,
      };
      main.doors.push({ ...door, to: utility.id, edge: "v1" });
      utility.doors.push({ ...door, to: main.id, edge: "v0" });
      uv.rooms = [main, utility];
      uv.sealed = [];
      uv.furniture = [];
      floor.lights = [];
      floor.rooms = uv.rooms.map((room) => ({
        ...floor.rooms[0]!, id: room.id, kind: room.kind, polygon: room.polygon!, holes: room.holes,
        connections: [],
      }));
      expectedArea = polygonArea(polygon) - [coreHole, stairHole, service]
        .reduce((area, ring) => area + Math.abs(polygonArea(ring)), 0);
    }

    const streamed = buildInteriorBands(plan, fixture.request);
    const bands = await Promise.all([...streamed.floorMeshes.values()].map(async (mesh) =>
      trianglesOf(await writeGlb(createDocument(mesh)))));
    const merged = buildInterior(plan, fixture.request, fixture.shellDoc);
    const combined = await trianglesOf(await writeGlb(merged.doc));
    const signature = (triangles: Triangle[]): string => createHash("sha256")
      .update(triangles.map((triangle) => JSON.stringify(triangle)).sort().join("\n")).digest("hex");
    expect(signature(combined)).toBe(signature(bands.flat()));

    const surfaces = (triangles: Triangle[], kind: string, y: number, down = false): Triangle[] =>
      triangles.filter((triangle) => triangle.material.includes(`/${kind}/`)
        && triangle.points.every((point) => point[1] === Math.fround(y))
        && polygonArea(triangle.points.map((p): Point => [p[0], p[2]])) * (down ? 1 : -1) > 1e-8);
    const area = (triangles: Triangle[], mask?: Point[]): number => triangles.reduce((sum, triangle) => {
      const polygon = triangle.points.map((p): Point => [p[0], p[2]]);
      return sum + Math.abs(polygonArea(mask ? clipPolygonToRect(polygon, polygonBounds(mask)) : polygon));
    }, 0);
    for (const output of [bands.flat(), combined]) {
      for (const floor of plan.floors) {
        const wood = surfaces(output, "wood", floor.elevation);
        expect(area(wood)).toBeCloseTo(expectedArea, 3);
        for (const hole of [coreHole, stairHole, service]) expect(area(wood, hole)).toBeLessThan(0.0001);
        const ceiling = surfaces(output, "ceiling", floor.ceilingElevation, true);
        expect(area(ceiling)).toBeCloseTo(expectedArea, 3);
        for (const hole of [coreHole, stairHole, service]) expect(area(ceiling, hole)).toBeLessThan(0.0001);
        expect(area(surfaces(output, "concrete", floor.elevation), rectRing(4.2, 3.2, 3.6, 2.6)))
          .toBeCloseTo(3.6 * 2.6, 4);
        // The shared service boundary has two wall faces, not two overlapping walls.
        expect(crossings(output, 4.5, floor.elevation + 1.5, 2.8, 3.2)).toHaveLength(2);
        expect(crossings(output, 6, floor.elevation + 1.5, 2.8, 3.2)).toEqual([]);
        expect(crossings(output, 5.46, floor.elevation + 1.5, 2.8, 3.2)
          .some((triangle) => triangle.material.includes("/door/"))).toBe(true);
      }
      const concrete = surfaces(output, "concrete", lower.ceilingElevation, true);
      expect(area(concrete, rectRing(4.2, 3.2, 3.6, 2.6))).toBeCloseTo(3.6 * 2.6, 4);
      // The unused core stub is floor space, not part of the actual shaft exclusion.
      expect(area(surfaces(output, "wood", upper.elevation),
        rectRing(coreEnd + 0.2, core.vFace + 0.2, 0.6, 1))).toBeCloseTo(0.6, 4);
      expect(area(surfaces(output, "concrete", lower.elevation),
        rectRing(core.riser.u + 0.2, core.riser.v + 0.2, 0.6, 1))).toBeCloseTo(0.6, 4);
    }
  });

  it("preserves concave floor coverage and notch doors without a bounding-box wall through the bathroom", async () => {
    const fixture = makeFixture({ seed: 8, floors: 1, width: 30, depth: 20, type: "offices", rotationDeg: 0 });
    const plan = planBuilding(fixture.request, resolveAssignments(fixture.request));
    const floor = plan.floors[0]!, uv = plan.uvFloors.get(floor.floor)!;
    const original = uv.rooms.find((room) => room.kind === "reception")!;
    const plate = insetPolygon(uv.outline, shellWallDepth(fixture.request.blueprint.facade));
    const bounds = polygonBounds(roomPolygon(original, plate));
    const [u0, u1, v0, v1] = [bounds.x, bounds.x + bounds.w, bounds.z, bounds.z + bounds.d];
    const [b0, b1, notch, top] = [u0 + bounds.w * 0.6, u0 + bounds.w * 0.75,
      v0 + bounds.d * 0.42, v0 + bounds.d * 0.72];
    const makeRoom = (id: string, kind: PlanRoom["kind"], polygon: Point[]): PlanRoom => {
      const r = polygonBounds(polygon);
      return { id, kind, polygon, rect: { u: r.x, v: r.z, lu: r.w, lv: r.d }, doors: [] };
    };
    const main = makeRoom(original.id, "living", [
      [u0, v0], [u1, v0], [u1, top], [b1, top], [b1, notch], [b0, notch], [b0, top], [u0, top],
    ]);
    const bath = makeRoom("bath", "bathroom", [[b0, notch], [b1, notch], [b1, v1], [b0, v1]]);
    const left = makeRoom("left", "corridor", [[u0, top], [b0, top], [b0, v1], [u0, v1]]);
    const right = makeRoom("right", "corridor", [[b1, top], [u1, top], [u1, v1], [b1, v1]]);
    main.doors.push(...original.doors.filter((door) => door.to === "outside"));
    left.doors.push(...original.doors.filter((door) => door.to !== "outside"));
    for (const [room, point] of [[bath, [(b0 + b1) / 2, notch]],
      [left, [(u0 + b0) / 2, top]], [right, [(b1 + u1) / 2, top]]] as [PlanRoom, Point][]) {
      const door = { id: `to-${room.id}`, leaves: 1 as const, width: 1, at: point[0], position: point };
      main.doors.push({ ...door, to: room.id, edge: "v1" });
      room.doors.push({ ...door, to: main.id, edge: "v0" });
    }
    uv.rooms = uv.rooms.flatMap((room) => room === original ? [main, bath, left, right] : [room]);
    uv.furniture = uv.furniture.filter((item) => item.room !== original.id);
    floor.lights = floor.lights.filter((light) => light.room !== original.id);
    const { doc } = buildInterior(plan, fixture.request, fixture.shellDoc);
    const triangles = await trianglesOf(await writeGlb(doc));
    const floorArea = triangles.filter((triangle) => triangle.material.includes("/wood/")
      && triangle.points.every((point) => Math.abs(point[1] - floor.elevation) < 1e-5))
      .reduce((sum, triangle) => sum + Math.abs(polygonArea(triangle.points.map((p): Point => [p[0], p[2]]))), 0);
    expect(floorArea).toBeCloseTo(polygonArea(main.polygon!), 3);
    const ceilingArea = triangles.filter((triangle) => triangle.material.includes("/ceiling/")
      && triangle.points.every((point) => Math.abs(point[1] - floor.ceilingElevation) < 1e-5))
      .reduce((sum, triangle) => sum + Math.abs(polygonArea(clipPolygonToRect(
        triangle.points.map((p): Point => [p[0], p[2]]), bounds))), 0);
    expect(ceilingArea).toBeCloseTo(bounds.w * bounds.d, 3);
    const at = (b0 + b1) / 2;
    expect(crossings(triangles, at, 1.5, top - 0.2, top + 0.2)).toEqual([]);
    expect(crossings(triangles, at, 1.5, notch - 0.2, notch + 0.2)).toEqual([]);
    expect(crossings(triangles, b0 + 0.4, 1.5, notch - 0.2, notch + 0.2).length).toBeGreaterThan(0);
    expect(crossings(triangles, at - 0.54, 1.5, notch - 0.2, notch + 0.2)
      .some((triangle) => triangle.material.includes("/door/"))).toBe(true);
  });
});
