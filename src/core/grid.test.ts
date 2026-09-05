import { describe, expect, it } from "vitest";
import { pointInPolygon, polygonBounds, type Point, type Rect } from "./geom.js";
import { WalkGrid } from "./grid.js";
import { ROOM_FOOTPRINT_EPS, roomFootprintContains, type RoomFootprint } from "./room-footprint.js";

function expectMembership(actual: WalkGrid, contains: (point: Point) => boolean): void {
  const expected = new WalkGrid(actual.origin, actual.cellSize, actual.cols, actual.rows);
  for (let r = 0; r < actual.rows; r++) {
    for (let c = 0; c < actual.cols; c++) {
      expected.set(c, r, contains(expected.center(c, r)));
    }
  }
  expect(actual.toBase64()).toBe(expected.toBase64());
}

function expectCenterMembership(outline: Point[], cellSize: number, bounds: Rect): void {
  expectMembership(WalkGrid.forPolygon(outline, cellSize, bounds), point => pointInPolygon(point, outline));
}

function expectRoomMembership(room: RoomFootprint, cellSize: number, bounds: Rect): void {
  expectMembership(WalkGrid.forRoomFootprint(room, cellSize, bounds), point => roomFootprintContains(room, point));
}

describe("WalkGrid.forPolygon", () => {
  it("preserves center membership on edges, horizontal tangencies and rounded coordinates", () => {
    const square: Point[] = [[0.5, 0.5], [3.5, 0.5], [3.5, 3.5], [0.5, 3.5]];
    const grid = WalkGrid.forPolygon(square, 1, { x: 0, z: 0, w: 4, d: 4 });
    expect(Array.from({ length: 4 }, (_, r) =>
      Array.from({ length: 4 }, (_, c) => Number(grid.isWalkable(c, r))),
    )).toEqual([[1, 1, 1, 0], [1, 1, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0]]);

    const notch: Point[] = [
      [0.5, 0.5], [6.5, 0.5], [6.5, 6.5], [4.5, 6.5],
      [4.5, 2.5], [3.5, 3.5], [2.5, 2.5], [2.5, 6.5], [0.5, 6.5],
    ];
    for (const offset of [0, -Number.EPSILON * 8, Number.EPSILON * 8, 1e9]) {
      const outline = notch.map(([x, z]): Point => [x + offset, z + offset]);
      for (const cellSize of [1, 0.3]) {
        const bounds = { x: offset, z: offset, w: 7, d: 7 };
        expectCenterMembership(outline, cellSize, bounds);
        expectCenterMembership([...outline].reverse(), cellSize, bounds);
      }
    }
  });

  it("matches ray membership for bounded concave, rotated, cropped and oversize grids", () => {
    for (let seed = 0; seed < 16; seed++) {
      const count = 6 + seed % 9;
      const angle = seed * Math.PI / 19;
      const outline = Array.from({ length: count }, (_, i): Point => {
        const radius = i % 2 === 0 ? 8 : 3 + seed % 4;
        const theta = angle + i * 2 * Math.PI / count;
        return [Math.cos(theta) * radius - 17.125, Math.sin(theta) * radius + 12.4];
      });
      const bounds = polygonBounds(outline);
      for (const padding of [-1.15, 0, 1.35]) {
        const region = {
          x: bounds.x - padding, z: bounds.z - padding,
          w: bounds.w + padding * 2, d: bounds.d + padding * 2,
        };
        for (const cellSize of [0.25, 0.3, 1]) {
          expectCenterMembership(outline, cellSize, region);
          expectCenterMembership([...outline].reverse(), cellSize, region);
        }
      }
    }
  });
});

describe("WalkGrid.forRoomFootprint", () => {
  it("includes outer boundaries and excludes hole boundaries at cell centers", () => {
    const room: RoomFootprint = {
      polygon: [[0.5, 0.5], [4.5, 0.5], [4.5, 4.5], [0.5, 4.5]],
      holes: [[[1.5, 1.5], [1.5, 3.5], [3.5, 3.5], [3.5, 1.5]]],
    };
    const grid = WalkGrid.forRoomFootprint(room, 1, { x: 0, z: 0, w: 5, d: 5 });
    expect(Array.from({ length: 5 }, (_, r) =>
      Array.from({ length: 5 }, (_, c) => Number(grid.isWalkable(c, r))),
    )).toEqual([
      [1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1],
    ]);
  });

  it("preserves the scalar tolerance on both sides of edges and on sub-tolerance features", () => {
    expect(ROOM_FOOTPRINT_EPS).toBe(1e-8);
    const room: RoomFootprint = {
      polygon: [[0.5, 0.5], [6.5, 0.5], [6.5, 6.5], [0.5, 6.5]],
      holes: [[[2.5, 1.5], [1.5, 2.5], [2.5, 3.5], [3.5, 2.5]]],
    };
    for (const shift of [-1.01, -1, -0.99, 0, 0.99, 1, 1.01]) {
      const offset = shift * ROOM_FOOTPRINT_EPS;
      expectRoomMembership(room, 1, { x: offset, z: offset, w: 7, d: 7 });
    }
    expectRoomMembership({
      polygon: [[0, 0], [1e-7, 0], [1e-7, 1e-7], [0, 1e-7]],
      holes: [[[5e-9, 5e-9], [5e-9, 9.5e-8], [9.5e-8, 9.5e-8], [9.5e-8, 5e-9]]],
    }, 5e-9, { x: -1.5e-8, z: -1.5e-8, w: 1.3e-7, d: 1.3e-7 });
  });

  it("matches scalar membership for rotated and translated notches with optional interior rings", () => {
    const outer: Point[] = [[0, 0], [12, 0], [12, 10], [8, 10], [8, 7], [5, 7], [5, 10], [0, 10]];
    const holes: Point[][] = [
      [[1, 2], [1, 5], [4, 5], [4, 2]],
      [[8.5, 1], [8.5, 4], [11, 4], [11, 1]],
    ];
    for (const angle of [0, 37, 89.999, 174.80557109226515]) {
      const radians = angle * Math.PI / 180;
      for (const [x, z] of [[0, 0], [-17.125, 12.4], [1e8, -1e8]] as Point[]) {
        const transform = ([u, v]: Point): Point => [
          x + u * Math.cos(radians) - v * Math.sin(radians),
          z + u * Math.sin(radians) + v * Math.cos(radians),
        ];
        const polygon = outer.map(transform), bounds = polygonBounds(polygon);
        for (const room of [{ polygon }, { polygon, holes: holes.map(hole => hole.map(transform)) }]) {
          for (const padding of [-0.7, 1.3]) for (const cellSize of [0.25, 0.3]) {
            expectRoomMembership(room, cellSize, {
              x: bounds.x - padding, z: bounds.z - padding,
              w: bounds.w + 2 * padding, d: bounds.d + 2 * padding,
            });
          }
        }
      }
    }
  });
});
