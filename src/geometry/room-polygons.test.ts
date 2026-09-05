import { describe, expect, it } from "vitest";
import { makeFixture } from "../blueprint/fixture.js";
import { resolveAssignments } from "../blueprint/validate.js";
import type { Point } from "../core/geom.js";
import { clipPolygonToRect, insetPolygon, polygonArea, polygonBounds } from "../core/geom.js";
import { readGlbBytes, writeGlb } from "../glb/io.js";
import { planBuilding } from "../layout/index.js";
import type { PlanRoom } from "../layout/plan-types.js";
import { roomPolygon } from "../layout/room-shape.js";
import { shellWallDepth } from "../layout/shell.js";
import { buildInterior } from "./index.js";

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
