import { describe, expect, it } from "vitest";
import type { Point } from "../core/geom.js";
import type { Opening, Rect3 } from "../core/types.js";
import { findPath, generateFloorInteriors, makeFixture } from "../index.js";
import { supportsPoint, toFrame, toWorld, upwardSurfaceTriangles } from "./surface-support.test-helper.js";

function frameRightEdge(rect: Rect3, angleDeg: number): number {
  const [u] = toFrame([rect.x + rect.w / 2, rect.z + rect.d / 2], angleDeg);
  return u + rect.w / 2;
}

function p2BalconyFixture(): ReturnType<typeof makeFixture> {
  const outline: Point[] = [
    [285.455, 601.708], [274.709, 664.206], [272.874, 674.867],
    [246.153, 670.865], [257.257, 596.704],
  ];
  const source = makeFixture({
    seed: "urbe:p2", floors: 9, type: "hotel", tier: "poor", outline,
    facadeStyle: "megablock", wallDepth: 0.355,
  });
  const blueprint = structuredClone(source.request.blueprint);
  blueprint.buildingId = "p2-balcony-landing";
  blueprint.facade = { style: "megablock", wallDepth: 0.355 };
  const groundDoor: Opening = {
    id: "entrance", kind: "door", edge: 0, offset: 1, width: 3, height: 4, sill: 0,
    leaves: 3, door: { motion: { clearDepth: 1 } },
  };
  const balconyDoor: Opening = {
    id: "bd:1:2:5", kind: "balconyDoor", edge: 2, offset: 10, width: 2, height: 2, sill: 0,
    leaves: 2, door: { motion: { clearDepth: 1 } },
    balcony: { depth: 0, width: 2.4, bandId: "bb:1:2:0" },
  };
  blueprint.floors.forEach((floor) => {
    floor.kind = floor.index === 0 ? "lobby" : "hotel";
    floor.elevation = floor.index === 0 ? 0 : 6 + (floor.index - 1) * 3.5;
    floor.height = floor.index === 0 ? 6 : 3.5;
    floor.openings = floor.index === 0 ? [groundDoor] : floor.index === 1 ? [balconyDoor] : [];
  });
  blueprint.balconyBands = [{
    id: "bb:1:2:0", floor: 1, edge: 2, offset: 9.8, width: 2.4, depth: 0,
    slabThickness: 0, railHeight: 1.07, style: "juliet", doors: [balconyDoor.id],
  }];
  blueprint.roof = {
    elevation: 34, outline, parapetHeight: 0.9,
    bulkhead: {
      center: [265.45, 635.7], axis: [0.148077649851115, -0.9889757376268493],
      width: 7.5, depth: 7.5, housingHeight: 2.75,
      doorNormal: [0.9889757376268493, 0.148077649851115], doorWidth: 1, doorHeight: 2.1,
    },
    artifacts: [],
  };
  return makeFixture({ seed: "urbe:p2", blueprint, type: "hotel", tier: "poor" });
}

describe("exterior access geometry", () => {
  it("supports a capsule-width turn from p2 balcony door bd:1:2:5 into the reachable floor", async () => {
    const fixture = p2BalconyFixture();
    const result = await generateFloorInteriors(fixture.request, {
      shellDoc: fixture.shellDoc, textures: { mode: "keys" },
    });
    const floor = result.floors.find((candidate) => candidate.floor === 1)!;
    const reservation = floor.openingReservations.find((candidate) => candidate.opening === "bd:1:2:5")!;
    expect(floor.coreAngleDeg).toBeCloseTo(98.52, 2);
    expect(reservation.position).toEqual([261.995, 673.238]);

    const landing = floor.rooms.find((room) => room.doors.some((door) =>
      door.to === "outside" && Math.hypot(
        door.position[0] - reservation.position[0], door.position[1] - reservation.position[1],
      ) < 0.5));
    expect(landing?.kind).toBe("corridor");
    const connection = landing!.doors.find((door) => door.to !== "outside")!;
    expect(connection.width).toBeGreaterThanOrEqual(0.7);

    const start: Point = [
      reservation.position[0] + reservation.inward[0] * 0.5,
      reservation.position[1] + reservation.inward[1] * 0.5,
    ];
    const threshold: Point = [
      reservation.position[0] + reservation.inward[0] * 0.021,
      reservation.position[1] + reservation.inward[1] * 0.021,
    ];
    const stair = floor.core.stairs.find((candidate) => candidate.id === "stair-b")!;
    const stairRight = frameRightEdge({ ...stair.rect, y: floor.elevation }, floor.coreAngleDeg);
    const [facadeU] = toFrame(reservation.position, floor.coreAngleDeg);
    expect(stairRight).toBeLessThanOrEqual(facadeU - reservation.depth + 1e-3);
    const [startU, startV] = toFrame(threshold, floor.coreAngleDeg);
    const [doorU, doorV] = toFrame(connection.position, floor.coreAngleDeg);
    const landingSide = Math.sign(startV - doorV) || 1;
    const routeUv: Point[] = [
      [startU, startV],
      [doorU, startV],
      [doorU, doorV + landingSide * 0.4],
      [doorU, doorV - landingSide * 0.4],
    ];
    expect(routeUv.every(([u]) => u - 0.35 >= stairRight - 1e-3)).toBe(true);

    const target = floor.core.stairs.find((candidate) => candidate.id === "stair-a")!.entry;
    expect(findPath(result.npc, { floor: 1, position: start }, { floor: 1, position: target })).not.toBeNull();

    const triangles = await upwardSurfaceTriangles(result.floorGlbs.get(1)!, floor.elevation);
    for (let leg = 0; leg + 1 < routeUv.length; leg++) {
      const a = routeUv[leg]!, b = routeUv[leg + 1]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.ceil(length / 0.2));
      const perpendicular: Point = length === 0 ? [0, 0] : [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const center: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        for (const offset of [-0.35, 0, 0.35]) {
          const point = toWorld([
            center[0] + perpendicular[0] * offset, center[1] + perpendicular[1] * offset,
          ], floor.coreAngleDeg);
          expect(
            triangles.some((triangle) => supportsPoint(triangle, point)),
            `unsupported landing route ${leg}:${step}:${offset}`,
          ).toBe(true);
        }
      }
    }
  });
});
