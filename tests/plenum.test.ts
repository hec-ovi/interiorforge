import { describe, expect, it } from 'vitest';
import type { BlueprintFloor, FloorInterior, InteriorRequest, LevelZone } from '../src/core/types.js';
import type { BuildingPlan } from '../src/layout/index.js';
import type { PlanFurniture, PlanRoom } from '../src/layout/plan-types.js';
import { makeFrame, uvRectCorners, type UvRect } from '../src/layout/uv.js';
import { seatPits } from '../src/placements/plenum.js';
import { SUNKEN_MAX, TRAY_HANG } from '../src/styles/systems/levels.js';

/** Two sampled layouts on a 20 m square: a ground floor and the middle floor standing over
 *  it and over itself. The middle floor's lounge (behind the facade) holds the pit. */
const HEIGHT = 4.5, CEILING = 4.15;
const outline: [number, number][] = [[0, 0], [20, 0], [20, 20], [0, 20]];
const floor = (index: number, head = 2.6): BlueprintFloor => ({ index, elevation: index * HEIGHT, height: HEIGHT, outline,
  openings: [{ id: `w${index}`, kind: 'window', edge: 0, offset: 2, width: 3, sill: .3, height: head - .3 }] } as unknown as BlueprintFloor);
const room = (id: string, rect: UvRect, extra: Partial<PlanRoom> = {}): PlanRoom =>
  ({ id, kind: 'living', rect, polygon: uvRectCorners(rect), doors: [], ...extra });
const pit = (delta: number): LevelZone => ({ polygon: uvRectCorners({ u: 8, v: 8, lu: 4, lv: 4 }), delta, edge: 'step' });

function building(delta: number, below: Partial<PlanRoom>, head = 2.6) {
  const lounge = room('m-lounge', { u: 5, v: 5, lu: 10, lv: 10 }, { levels: [pit(delta)], ceilingDrop: .5 });
  const sofa: PlanFurniture = { id: 'sofa', kind: 'sofa', room: 'm-lounge', at: [10, 10], rotationDeg: 0, size: [2, .9, .8], elevation: delta };
  const hall = room('g-hall', { u: .12, v: .12, lu: 19.76, lv: 19.76 }, below);
  const interior = (index: number, rooms: PlanRoom[], furniture: PlanFurniture[]): FloorInterior => ({
    floor: index, kind: 'apartment', elevation: index * HEIGHT, height: HEIGHT, ceilingElevation: index * HEIGHT + CEILING,
    coreAngleDeg: 0, rooms: rooms.map(r => ({ id: r.id, kind: r.kind, polygon: r.polygon!, doors: [],
      ...(r.ceilingDrop ? { ceilingDrop: r.ceilingDrop } : {}), ...(r.levels ? { levels: r.levels.map(z => ({ ...z })) } : {}) })),
    furniture: furniture.map(f => ({ id: f.id, kind: f.kind, room: f.room, position: f.at, rotationDeg: 0, size: f.size, elevation: f.elevation })),
    lights: [{ id: 'lamp', kind: 'spot', room: 'm-lounge', furniture: 'sofa', position: [10, index * HEIGHT + delta + 1, 10] }],
  } as unknown as FloorInterior);
  const plan = {
    core: { frame: makeFrame(0) },
    floors: [interior(0, [hall], []), interior(1, [lounge], [sofa])],
    uvFloors: new Map([[0, { rooms: [hall], furniture: [] }], [1, { rooms: [lounge], furniture: [sofa] }]]),
  } as unknown as BuildingPlan;
  const floors = [floor(0, head), floor(1, head), floor(2, head), floor(3, head)];
  const request = { blueprint: { floors } } as unknown as InteriorRequest;
  // ground is its own layout; floors 1-3 share the middle one, floor 3 the crown here too
  const changed = seatPits(plan, request, floors, index => index === 0 ? 0 : 1);
  return { plan, changed, hall, lounge, sofa };
}

describe('pits and the plenum below them', () => {
  it('leaves a pit the slab zone holds as it is', () => {
    const { changed, hall, lounge } = building(-SUNKEN_MAX, {});
    expect(changed).toEqual([]);
    expect(hall.ceilingDrop).toBeUndefined();
    expect(lounge.levels![0]!.delta).toBe(-SUNKEN_MAX);
  });

  it('lowers the ceiling of the room under a deeper pit until its tray fits', () => {
    const { plan, changed, hall, lounge } = building(-.54, {});
    expect(changed).toEqual([]);
    expect(lounge.levels![0]!.delta).toBe(-.54);
    // the ground hall now hangs its ceiling below the tray
    expect(hall.ceilingDrop! + (HEIGHT - CEILING)).toBeGreaterThanOrEqual(.54 * TRAY_HANG);
    expect(plan.floors[0]!.rooms[0]!.ceilingDrop).toBe(hall.ceilingDrop);
    // over itself the lounge's own 0.5 m drop already holds the pit
    expect(lounge.ceilingDrop).toBe(.5);
  });

  it('makes the pit shallower, with the pieces in it, where the room below keeps its window heads', () => {
    // a facade room whose ceiling cannot drop below the 4.1 m window heads
    const { plan, changed, hall, lounge, sofa } = building(-.54, {}, 4.1);
    expect(hall.ceilingDrop ?? 0).toBeLessThanOrEqual(CEILING - 4.1 + 1e-9);
    const to = lounge.levels![0]!.delta;
    expect(to).toBeGreaterThan(-.54);
    expect(-to * TRAY_HANG).toBeLessThanOrEqual(HEIGHT - 4.1);
    expect(changed).toEqual([{ floor: 1, room: 'm-lounge', from: -.54, to }]);
    expect(sofa.elevation).toBe(to);
    expect(plan.floors[1]!.furniture[0]!.elevation).toBe(to);
    expect(plan.floors[1]!.rooms[0]!.levels![0]!.delta).toBe(to);
    expect(plan.floors[1]!.lights[0]!.position[1]).toBeCloseTo(HEIGHT + to + 1);
  });
});
