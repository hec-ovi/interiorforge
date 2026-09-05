import { expect, it } from "vitest";
import { distance, polygonBounds, type Point, type Rect } from "./geom.js";
import { WalkGrid } from "./grid.js";
import { RigidFrame2D } from "./rigid-frame.js";
import { roomFootprintContains, type RoomFootprint } from "./room-footprint.js";

function expectSourceSampling(room: RoomFootprint, frame: RigidFrame2D, cell: number, bounds: Rect): void {
  const actual = WalkGrid.forRoomFootprint(room, cell, bounds, frame);
  const expected = new WalkGrid([bounds.x, bounds.z], cell, actual.cols, actual.rows);
  for (let r = 0; r < actual.rows; r++) for (let c = 0; c < actual.cols; c++) {
    expected.set(c, r, roomFootprintContains(room, frame.toLocal(expected.center(c, r))));
  }
  expect(actual.toBase64()).toBe(expected.toBase64());
}

it("uses the exact zero-origin rotation arithmetic and a metre-preserving translated frame", () => {
  const angle = 98.51553995127409, radians = angle * Math.PI / 180;
  const cos = Math.cos(radians), sin = Math.sin(radians), point: Point = [264.49675, 650.67275];
  const frame = new RigidFrame2D(angle);
  expect(frame.toLocal(point)).toEqual([point[0] * cos + point[1] * sin, -point[0] * sin + point[1] * cos]);
  expect(frame.toWorld(point)).toEqual([point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos]);
  const translated = new RigidFrame2D(37, [202, 711]);
  expect(translated.toLocal([202, 711])).toEqual([0, 0]);
  expect(translated.toWorld([0, 0])).toEqual([202, 711]);
  expect(distance(translated.toWorld([2, 3]), translated.toWorld([5, 7]))).toBeCloseTo(5, 12);
});

it("matches source membership for rotated, notched and holed footprints at large coordinate magnitudes", () => {
  const outer: Point[] = [[0.5, 0.5], [12.5, 0.5], [12.5, 10.5], [8.5, 10.5], [8.5, 7.5], [5.5, 7.5], [5.5, 10.5], [0.5, 10.5]];
  const hole: Point[] = [[2.5, 2.5], [2.5, 4.5], [4.5, 4.5], [4.5, 2.5]];
  const placements: { source: Point; world: Point }[] = [
    { source: [0, 0], world: [0, 0] },
    { source: [-756, 109.20784942907103], world: [202, 711] },
    { source: [0, 0], world: [1e8, -1e8] },
    { source: [1e12, -1e12], world: [-1e12, 1e12] },
  ];
  for (const angle of [0, 37, -97.3967628361159, 98.51553995127409]) for (const { source, world } of placements) {
    const shift = ([x, z]: Point): Point => [x + source[0], z + source[1]];
    const frame = new RigidFrame2D(angle, world), polygon = outer.map(shift);
    const worldBounds = polygonBounds(polygon.map(point => frame.toWorld(point)));
    const bounds = { x: worldBounds.x - 0.75, z: worldBounds.z - 0.75, w: worldBounds.w + 1.5, d: worldBounds.d + 1.5 };
    for (const room of [{ polygon }, { polygon, holes: [hole.map(shift)] }]) for (const cell of [0.25, 0.3]) {
      expectSourceSampling(room, frame, cell, bounds);
      if (angle === 0 && world[0] === 0 && world[1] === 0) {
        expect(WalkGrid.forRoomFootprint(room, cell, bounds, frame).toBase64())
          .toBe(WalkGrid.forRoomFootprint(room, cell, bounds).toBase64());
      }
    }
  }
});

it("uses source scalar boundaries on both sides of the shared epsilon without moving samples", () => {
  const room: RoomFootprint = {
    polygon: [[0, 0], [6, 0], [6, 6], [0, 6]],
    holes: [[[2, 2], [2, 4], [4, 4], [4, 2]]],
  };
  for (const angle of [0, 37, 174.80557109226515]) {
    const frame = new RigidFrame2D(angle, [202, 711]);
    for (const depth of [-1.01e-8, -0.99e-8, 0, 0.99e-8, 1.01e-8]) {
      for (const sourcePoint of [[3, depth], [3, 2 + depth], [6 + depth, 3]] as Point[]) {
        const [x, z] = frame.toWorld(sourcePoint), cell = 0.0625;
        expectSourceSampling(room, frame, cell, { x: x - cell / 2, z: z - cell / 2, w: cell * 3, d: cell * 3 });
      }
    }
  }
});
