import { WalkGrid } from '../../core/grid.js';
import type { Point } from '../../core/geom.js';
import { segmentDistance } from '../../core/segment-sweep.js';
import type { PlanFurniture, PlanRoom } from '../plan-types.js';
import { roomContains, roomEdges } from '../room-shape.js';
import { furnitureUvRect } from '../navgrid.js';
import { doorUvPoint } from '../plan-floor.js';
import { uvRectCorners } from '../uv.js';
import type { DuplexSection } from './section.js';
import type { DuplexProgram } from './program.js';
import type { DuplexFurniture } from './furnish.js';

const RADIUS = .34;
const WALL = .12;
export interface DuplexRouteProof {
  lower: { grid: WalkGrid; origin: Point; reachedRooms: string[] };
  upper: { grid: WalkGrid; origin: Point; reachedRooms: string[] };
  failures: string[];
}

/** Actual body-width floor occupancy and fixture fronts, kept separate from the
 * cross-storey stair test. Door channels use their authored widths; upper holes
 * never become navigation islands or fictitious rooms. */
export function duplexRoutes(program: DuplexProgram, section: DuplexSection, furniture: DuplexFurniture): DuplexRouteProof {
  const result = { failures: [] as string[] } as DuplexRouteProof;
  const outline = uvRectCorners({ u: 0, v: 0, lu: section.width, lv: section.depth });
  for (const level of ['lower', 'upper'] as const) {
    const rooms = program[level], pieces = furniture[level];
    const walls = rooms.flatMap(room => roomEdges(room, outline).map(edge => ({ a: edge.a, b: edge.b })));
    const doors = rooms.flatMap(room => room.doors.map(door => ({ position: doorUvPoint(door, room), width: door.width, horizontal: door.edge.startsWith('v') })));
    const blocks = pieces.filter(piece => (piece.elevation ?? 0) < 1.7).map(piece => furnitureUvRect(piece));
    if (level === 'lower') blocks.push(section.stairOpening);
    const grid = WalkGrid.forPolygon(outline, .125, { x: 0, z: 0, w: section.width, d: section.depth });
    for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
      const p = grid.center(col, row);
      const entryChannel = level === 'lower' && p[1] < RADIUS + WALL / 2
        && Math.abs(p[0] - program.entrance.at[0]) <= program.entrance.width / 2 - RADIUS;
      let clear = rooms.some(room => roomContains(room, p))
        && p[0] > RADIUS + WALL / 2 && (p[1] > RADIUS + WALL / 2 || entryChannel)
        && p[0] < section.width - RADIUS - WALL / 2 && p[1] < section.depth - RADIUS - WALL / 2;
      if (clear) clear = !blocks.some(rect => p[0] > rect.u - RADIUS && p[0] < rect.u + rect.lu + RADIUS
        && p[1] > rect.v - RADIUS && p[1] < rect.v + rect.lv + RADIUS);
      if (clear) for (const wall of walls) {
        if (segmentDistance(p, p, wall.a, wall.b) >= RADIUS + WALL / 2) continue;
        const horizontal = Math.abs(wall.a[1] - wall.b[1]) < 1e-6;
        const crossesDoor = doors.some(door => door.horizontal === horizontal
          && Math.abs(door.position[horizontal ? 1 : 0] - wall.a[horizontal ? 1 : 0]) < 1e-6
          && Math.abs(p[horizontal ? 0 : 1] - door.position[horizontal ? 0 : 1]) <= door.width / 2 - RADIUS);
        if (!crossesDoor) { clear = false; break; }
      }
      grid.set(col, row, clear);
    }
    const origin: Point = level === 'lower' ? [program.entrance.at[0], .6] : section.stair.upperEntry;
    const visited = grid.flood(origin), reachedRooms: string[] = [];
    if (!grid.isWalkableAt(origin)) result.failures.push(`${level} private arrival is blocked`);
    for (const room of rooms) {
      let reached = false;
      for (let row = 0; row < grid.rows && !reached; row++) for (let col = 0; col < grid.cols && !reached; col++) {
        const p = grid.center(col, row);
        reached = roomContains(room, p) && grid.reaches(visited, p);
      }
      if (reached) reachedRooms.push(room.id); else result.failures.push(`${room.id} has no body-width route from its private arrival`);
    }
    const usable = new Set(['bed_double', 'wardrobe', 'fridge', 'kitchen_block', 'sink', 'toilet', 'shower']);
    for (const piece of pieces.filter(piece => usable.has(piece.kind))) {
      const theta = piece.rotationDeg * Math.PI / 180;
      const forward: Point = [Math.sin(theta), Math.cos(theta)];
      const side: Point = [forward[1], -forward[0]];
      const candidates: Point[] = [];
      for (const distance of [.42, .55, .7]) for (const offset of [0, -.25, .25]) candidates.push([
        piece.at[0] + forward[0] * (piece.size[1] / 2 + distance) + side[0] * offset,
        piece.at[1] + forward[1] * (piece.size[1] / 2 + distance) + side[1] * offset,
      ]);
      if (!candidates.some(point => grid.reaches(visited, point)))
        result.failures.push(`${piece.id} ${piece.kind} has no reachable usable front`);
    }
    result[level] = { grid, origin, reachedRooms };
  }
  return result;
}
