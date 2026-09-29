import { expect, it } from 'vitest';
import { livingConnected } from '../src/layout/living-connectivity.js';
import { roomClearance, type RoomShape } from '../src/layout/room-shape.js';
import { polygonBounds, type Point } from '../src/core/geom.js';

// Frozen reference predicate: this optimization must retain its exact sampled
// clearance semantics, including body-sized pockets missed by the wider mask.
function reference(room: RoomShape): boolean {
  return [.39, .85].every(clearance => {
    const cells = new Set<string>(), r = room.rect;
    for (let v = r.v + .125, row = 0; v < r.v + r.lv; v += .25, row++)
      for (let u = r.u + .125, column = 0; u < r.u + r.lu; u += .25, column++)
        if (roomClearance(room, [u, v]) >= clearance - 1e-6) cells.add(`${column}:${row}`);
    if (!cells.size) return false;
    const pending = [[...cells][0]!]; cells.delete(pending[0]!);
    while (pending.length) {
      const [column, row] = pending.pop()!.split(':').map(Number);
      for (const [du, dv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = `${column! + du!}:${row! + dv!}`;
        if (cells.delete(key)) pending.push(key);
      }
    }
    return !cells.size;
  });
}

it('retains both body and generous-route connectivity across narrow necks, holes and fractional phases', () => {
  for (const phase of [0, .054109436226, -.219476050409]) for (const width of [.5, .8, 1.5, 1.7, 2, 3]) {
    const low = 3 - width / 2, high = 3 + width / 2;
    const polygon: Point[] = [[0, 0], [6, 0], [6, low], [8, low], [8, 0], [14, 0],
      [14, 6], [8, 6], [8, high], [6, high], [6, 6], [0, 6]];
    for (const withHole of [false, true]) {
      const translate = ([u, v]: Point): Point => [u + phase, v - phase];
      const room: RoomShape = { rect: { u: phase, v: -phase, lu: 14, lv: 6 }, polygon: polygon.map(translate),
        ...(withHole ? { holes: [[[1, 1], [1, 2], [2, 2], [2, 1]].map(point => translate(point as Point))] } : {}) };
      const expected = reference(room);
      expect(livingConnected(room)).toBe(expected);
      expect(livingConnected(structuredClone(room))).toBe(expected);
    }
  }
});

it('does not reuse a cached answer after geometry on the same room object changes', () => {
  const room: RoomShape = { rect: { u: 0, v: 0, lu: 8, lv: 6 }, polygon: [[0, 0], [8, 0], [8, 6], [0, 6]] };
  expect(livingConnected(room)).toBe(true);
  room.holes = [[[3.5, 0], [3.5, 6], [4.5, 6], [4.5, 0]]];
  expect(livingConnected(room)).toBe(false);
});

it('matches signed-boundary clearance on oblique polygons rather than assuming axis-aligned walls', () => {
  for (const angle of [0, 17, 37]) {
    const radians = angle * Math.PI / 180;
    const rotate = ([u, v]: Point): Point => [u * Math.cos(radians) - v * Math.sin(radians) - 13.054,
      u * Math.sin(radians) + v * Math.cos(radians) + .219];
    const polygon: Point[] = [[0, 0], [8, .25], [9.3, 6], [3, 7], [-.4, 5]];
    const ring = polygon.map(rotate), bounds = polygonBounds(ring);
    const room: RoomShape = { rect: { u: bounds.x, v: bounds.z, lu: bounds.w, lv: bounds.d }, polygon: ring,
      holes: [[[2, 2], [2, 4], [4, 4], [4, 2]].map(point => rotate(point as Point))] };
    expect(livingConnected(room)).toBe(reference(room));
  }
});
