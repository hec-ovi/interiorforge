import { describe, expect, it } from "vitest";
import type { Point } from "../core/geom.js";
import type { Rect3 } from "../core/types.js";
import { readGlbBytes } from "../glb/io.js";
import { generateFloorInteriors, makeFixture } from "../index.js";

type Point3 = [number, number, number];
type Triangle = [Point3, Point3, Point3];

interface Bounds {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

interface EdgeJoin {
  axis: "u" | "v";
  gap: number;
  overlap0: number;
  overlap1: number;
  aEdge: number;
  bEdge: number;
  aInside: number;
  bInside: number;
}

function toFrame([x, z]: Point, angleDeg: number): Point {
  const angle = angleDeg * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [x * cos + z * sin, -x * sin + z * cos];
}

function toWorld([u, v]: Point, angleDeg: number): Point {
  const angle = angleDeg * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return [u * cos - v * sin, u * sin + v * cos];
}

function stepBounds(step: Rect3, angleDeg: number): Bounds {
  const [u, v] = toFrame([step.x + step.w / 2, step.z + step.d / 2], angleDeg);
  return { u0: u - step.w / 2, u1: u + step.w / 2, v0: v - step.d / 2, v1: v + step.d / 2 };
}

function polygonBounds(points: readonly Point[], angleDeg: number): Bounds {
  const framed = points.map((point) => toFrame(point, angleDeg));
  return {
    u0: Math.min(...framed.map((point) => point[0])),
    u1: Math.max(...framed.map((point) => point[0])),
    v0: Math.min(...framed.map((point) => point[1])),
    v1: Math.max(...framed.map((point) => point[1])),
  };
}

function closestJoin(a: Bounds, b: Bounds): EdgeJoin {
  const candidates: EdgeJoin[] = [
    { axis: "u", gap: Math.abs(a.u1 - b.u0), overlap0: Math.max(a.v0, b.v0), overlap1: Math.min(a.v1, b.v1), aEdge: a.u1, bEdge: b.u0, aInside: -1, bInside: 1 },
    { axis: "u", gap: Math.abs(a.u0 - b.u1), overlap0: Math.max(a.v0, b.v0), overlap1: Math.min(a.v1, b.v1), aEdge: a.u0, bEdge: b.u1, aInside: 1, bInside: -1 },
    { axis: "v", gap: Math.abs(a.v1 - b.v0), overlap0: Math.max(a.u0, b.u0), overlap1: Math.min(a.u1, b.u1), aEdge: a.v1, bEdge: b.v0, aInside: -1, bInside: 1 },
    { axis: "v", gap: Math.abs(a.v0 - b.v1), overlap0: Math.max(a.u0, b.u0), overlap1: Math.min(a.u1, b.u1), aEdge: a.v0, bEdge: b.v1, aInside: 1, bInside: -1 },
  ];
  return candidates
    .filter((candidate) => candidate.overlap1 - candidate.overlap0 >= 0.7)
    .sort((left, right) => left.gap - right.gap)[0]!;
}

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

async function roofTriangles(glb: Uint8Array, elevation: number): Promise<Triangle[]> {
  const document = await readGlbBytes(glb);
  const triangles: Triangle[] = [];
  for (const node of document.getRoot().listNodes()) {
    const matrix = node.getWorldMatrix();
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const positions = primitive.getAttribute("POSITION")!.getArray()!;
      const indices = primitive.getIndices()?.getArray();
      const count = indices?.length ?? primitive.getAttribute("POSITION")!.getCount();
      for (let i = 0; i + 2 < count; i += 3) {
        const triangle = [0, 1, 2].map((offset) =>
          transformPoint(positions, Number(indices?.[i + offset] ?? i + offset), matrix)) as Triangle;
        const [a, b, c] = triangle;
        const normalY = (b![2] - a![2]) * (c![0] - a![0]) - (b![0] - a![0]) * (c![2] - a![2]);
        if (normalY > 0 && triangle.every((point) => Math.abs(point[1] - elevation) < 0.002)) {
          triangles.push(triangle);
        }
      }
    }
  }
  return triangles;
}

function containsXZ([a, b, c]: Triangle, [x, z]: Point): boolean {
  const divisor = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(divisor) < 1e-12) return false;
  const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / divisor;
  const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / divisor;
  const l3 = 1 - l1 - l2;
  return l1 >= -1e-5 && l2 >= -1e-5 && l3 >= -1e-5;
}

function expectSupported(triangles: Triangle[], point: Point, label: string): void {
  expect(triangles.some((triangle) => containsXZ(triangle, point)), label).toBe(true);
}

function exactRotatedRoofFixture(): ReturnType<typeof makeFixture> {
  const outline: Point[] = [
    [185.9438558052104, 539.3809466212549],
    [182.10858050509475, 565.0965190117797],
    [130.67743572404507, 557.4259684115484],
    [134.51271102416072, 531.7103960210236],
  ];
  const source = makeFixture({
    seed: "roof-transition", floors: 1, type: "commerce", tier: "high_rich",
    facadeStyle: "glass", wallDepth: 0.23, outline,
  });
  const blueprint = structuredClone(source.request.blueprint);
  blueprint.floors[0]!.height = 4.5;
  blueprint.floors[0]!.kind = "commerce";
  blueprint.floors[0]!.openings = [{
    id: "entrance", kind: "door", edge: 3, offset: 1, width: 4, height: 3.5, sill: 0,
    door: { motion: { clearDepth: 1 } },
  }];
  blueprint.roof = {
    elevation: 4.5,
    outline,
    parapetHeight: 0.95,
    bulkhead: {
      center: [158.3, 548.4],
      axis: [-0.9890604765586473, -0.14751058846598666],
      width: 7.2,
      depth: 7.2,
      housingHeight: 2.65,
      doorNormal: [0.14751058846598666, -0.9890604765586473],
      doorWidth: 1,
      doorHeight: 2.1,
    },
    artifacts: [],
  };
  return makeFixture({ seed: "roof-transition", blueprint, type: "commerce", tier: "high_rich" });
}

describe("roof access geometry", () => {
  it("keeps capsule-width support from the final tread through the platform to the roof door", async () => {
    const fixture = exactRotatedRoofFixture();
    const result = await generateFloorInteriors(fixture.request, {
      shellDoc: fixture.shellDoc, textures: { mode: "keys" },
    });
    const floor = result.floors[0]!;
    const access = result.npc.nav.roofAccess!;
    const stair = floor.core.stairs.find((candidate) => candidate.id === access.stair)!;
    const roofSteps = stair.steps!.filter((step) => Math.abs(step.y - access.elevation) < 0.002);
    const finalTread = roofSteps.reduce((smallest, step) => step.w * step.d < smallest.w * smallest.d ? step : smallest);
    const arrival = roofSteps.reduce((largest, step) => step.w * step.d > largest.w * largest.d ? step : largest);
    const treadBounds = stepBounds(finalTread, floor.coreAngleDeg);
    const arrivalBounds = stepBounds(arrival, floor.coreAngleDeg);
    const platformBounds = polygonBounds(access.landing, floor.coreAngleDeg);
    const treadJoin = closestJoin(treadBounds, arrivalBounds);
    const platformJoin = closestJoin(arrivalBounds, platformBounds);

    expect(treadJoin.gap).toBeLessThanOrEqual(0.002);
    expect(platformJoin.gap).toBeLessThanOrEqual(0.002);
    expect(treadJoin.overlap1 - treadJoin.overlap0).toBeGreaterThanOrEqual(0.7);
    expect(platformJoin.overlap1 - platformJoin.overlap0).toBeGreaterThanOrEqual(0.7);

    const triangles = await roofTriangles(result.floorGlbs.get(0)!, access.elevation);
    for (const [name, join] of [["final tread", treadJoin], ["roof platform", platformJoin]] as const) {
      const center = (join.overlap0 + join.overlap1) / 2;
      for (const across of [-0.35, 0, 0.35]) {
        const along = center + across;
        const a = join.aEdge + join.aInside * 0.01;
        const b = join.bEdge + join.bInside * 0.01;
        expectSupported(triangles, toWorld(join.axis === "u" ? [a, along] : [along, a], floor.coreAngleDeg), `${name} arrival side ${across}`);
        expectSupported(triangles, toWorld(join.axis === "u" ? [b, along] : [along, b], floor.coreAngleDeg), `${name} departure side ${across}`);
      }
    }

    expect(platformJoin.axis).toBe("v");
    const transitionU = (platformJoin.overlap0 + platformJoin.overlap1) / 2;
    const [doorU, doorV] = toFrame(access.door.position, floor.coreAngleDeg);
    const towardDoor = Math.sign(doorV - platformJoin.bEdge);
    const turnV = platformJoin.bEdge + towardDoor * 0.4;
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      const u = transitionU + (doorU - transitionU) * t;
      for (const across of [-0.35, 0, 0.35]) {
        expectSupported(triangles, toWorld([u, turnV + across], floor.coreAngleDeg), `platform turn ${step}:${across}`);
      }
    }
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      const v = turnV + (doorV - towardDoor * 0.002 - turnV) * t;
      for (const across of [-0.35, 0, 0.35]) {
        expectSupported(triangles, toWorld([doorU + across, v], floor.coreAngleDeg), `door approach ${step}:${across}`);
      }
    }
  });
});
