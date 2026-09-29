import { beforeAll, expect, it } from 'vitest';
import type { BlueprintFloor } from '../src/index.js';
import type { Point } from '../src/core/geom.js';
import { damagedDwellingProgram } from '../src/styles/damaged/dwelling-program.js';
import { damagedStandardProgram } from '../src/styles/damaged/layout.js';
import { createRng } from '../src/core/rng.js';
import { roomArea } from '../src/layout/room-shape.js';
import { doorBetween, idGen } from '../src/layout/rooms.js';
import { doorUvPoint } from '../src/layout/plan-floor.js';
import { furnish } from '../src/layout/furnish.js';
import { openingKeepouts, partitionConflicts } from '../src/layout/openings.js';
import { floorBounds } from '../src/layout/shell.js';
import { makeFrame, uvRectCorners, type UvRect } from '../src/layout/uv.js';
import type { PlanRoom } from '../src/layout/plan-types.js';

/** Actual 40m megablock crown facade: its 0.4m setback changes the legal bay
 * widths to 6.825/7.285m. Keep the authored primary-facade opening measurements;
 * tests must not depend on ignored proof outputs or regenerate an entire GLB. */
const floor: BlueprintFloor = {
  index: 5, kind: 'apartment', elevation: 0, height: 4.5,
  outline: [[.9, .9], [39.1, .9], [39.1, 39.1], [.9, 39.1]],
  roomEnvelope: {
    corners: [[1.5, 1.5], [38.5, 1.5], [38.5, 38.5], [1.5, 38.5]],
    origin: [1.5, 1.5], axisU: [1, 0], axisV: [0, 1], width: 37, depth: 37,
    vertical: { min: 0, max: 4.2 }, grid: { origin: [.9, .9], angle: 0, spacing: .5 },
  },
  openings: [0, 2].flatMap(edge => [.79, 2.885, 5.34, 7.435, 10.35, 12.445, 14.9, 16.995,
    19.45, 21.545, 24.46, 26.555, 29.01, 31.105, 33.56, 35.655].map((offset, i) => ({
    id: `crown-window:${edge}:${i}`, kind: 'window', edge, offset, width: 1.755, height: 3, sill: .78,
    glazing: { offset, width: 1.755, height: 3, sill: .78, glassDepth: .26, housingBackDepth: .26 },
  }))),
};
const facade = { wallDepth: .48 }, frame = makeFrame(0), bounds = floorBounds(floor, frame, facade);
const openingZones = openingKeepouts(floor, frame, bounds.facadeDepth).map(zone => zone.rect);
const cases = [
  { side: 'v1' as const, u: 13.175, v: 1.5, width: 6.825 },
  { side: 'v1' as const, u: 5.89, v: 1.5, width: 7.285 },
  { side: 'v0' as const, u: 5.89, v: 28.5, width: 6.825 },
  { side: 'v0' as const, u: 12.715, v: 28.5, width: 7.285 },
];
let Physics: any;
beforeAll(async () => {
  ({ Physics } = await import(new URL('../../engine/src/game/physics/Physics.js', import.meta.url).href));
});

it('keeps both appliances usable in the shallow setback kitchen with a wide opening', () => {
  const rect = { u: 49.183, v: 1.5, lu: 9.217, lv: 8 }, ids = idGen(5);
  const home = damagedStandardProgram(rect, [rect.u, rect.u + 4, rect.u + rect.lu], makeFrame(0), makeFrame(0), ids)!;
  const kitchen = home.find(room => room.kind === 'kitchen')!;
  expect(kitchen.doors[0]!.width).toBe(1.6);
  const largeFloor = { ...floor, roomEnvelope: undefined,
    outline: [[.9, .9], [59.1, .9], [59.1, 59.1], [.9, 59.1]] as Point[], openings: [] };
  const furniture = furnish([kitchen], 'apartment', createRng('shallow-kitchen'), ids,
    floorBounds(largeFloor, makeFrame(0), facade), [], 'poor', [], 'damaged');
  expect(furniture.map(item => item.kind)).toEqual(expect.arrayContaining(['kitchen_block', 'fridge']));
});

it.each(cases)('fits complete separate functions and clear living circulation in a$width m $side bay', async ({ side, u, v, width }) => {
  const rect: UvRect = { u, v, lu: width, lv: 10 }, ids = idGen(5);
  const rooms = damagedDwellingProgram(rect, side, uvRectCorners(rect), [u, u + width], 'home', ids);
  expect(rooms).not.toBeNull();
  const home = rooms!, living = home.find(room => room.kind === 'living')!;
  expect(home.map(room => room.kind).sort()).toEqual(['bathroom', 'bedroom', 'kitchen', 'living']);
  expect(home.reduce((sum, room) => sum + roomArea(room), 0)).toBeCloseTo(width * 10, 6);
  expect(roomArea(living)).toBeGreaterThanOrEqual(22);
  for (const room of home.filter(room => room !== living)) {
    expect(room.doors).toHaveLength(1);
    expect(room.doors[0]!.to).toBe(living.id);
    expect(room.doors[0]!.width).toBeCloseTo(room.kind === 'kitchen' ? 1.6 : .9, 6);
  }
  const publicRect = { ...rect, v: side === 'v1' ? v + 10 : v - 3, lv: 3 };
  const publicRoom: PlanRoom = { id: 'public', kind: 'corridor', rect: publicRect, polygon: uvRectCorners(publicRect), doors: [] };
  const entry = doorBetween(living, publicRoom.id, publicRoom, ids, 1, 1.2)!;
  expect(entry.width).toBe(1.2);
  expect(partitionConflicts({ rooms: home.map(room => ({ ...room, polygon: room.polygon!, doors: [] })) },
    floor, facade, bounds.inner)).toEqual([]);

  // Real furnished recipes, including facade opening keepouts and the unit entrance,
  // must retain all essentials. A geometrically plausible empty bathroom is a failure.
  const furniture = furnish([publicRoom, ...home], 'apartment', createRng('damaged-dwelling-proof'),
    ids, bounds, openingZones, 'poor', [], 'damaged');
  const kinds = (kind: string) => furniture.filter(item => item.room === home.find(room => room.kind === kind)!.id).map(item => item.kind);
  expect(kinds('bedroom')).toEqual(expect.arrayContaining(['bed_double', 'wardrobe']));
  expect(kinds('bathroom')).toEqual(expect.arrayContaining(['shower', 'toilet', 'sink']));
  expect(kinds('kitchen')).toEqual(expect.arrayContaining(['kitchen_block', 'fridge']));
  expect(kinds('living')).toContain('sofa');

  // Independent continuous collision casts verify a 1.1m diameter moving body can
  // pass the service-room corners while staying in living space. The helper's own
  // grid connectivity implementation is neither imported nor repeated here.
  const physics = await Physics.create();
  try {
    const privateRooms = home.filter(room => room !== living);
    const wall = .1;
    const solids = [...privateRooms.map(room => room.rect),
      { u: u - wall, v: v - wall, lu: wall, lv: 10 + 2 * wall },
      { u: u + width, v: v - wall, lu: wall, lv: 10 + 2 * wall },
      { u, v: v - wall, lu: width, lv: wall }, { u, v: v + 10, lu: width, lv: wall }];
    physics.addBoxes(solids.map(r => ({ center: [r.u + r.lu / 2, 1.5, r.v + r.lv / 2],
      halfExtents: [r.lu / 2, 1.5, r.lv / 2], rotationY: 0 })));
    physics.step(1 / 60);
    const bath = home.find(room => room.kind === 'bathroom')!.rect;
    const kitchen = home.find(room => room.kind === 'kitchen')!.rect;
    const low = bath.u < kitchen.u ? bath.u + bath.lu : kitchen.u + kitchen.lu;
    const high = bath.u < kitchen.u ? kitchen.u : bath.u;
    const bathEdge = side === 'v0' ? bath.v + bath.lv : bath.v;
    const kitchenEdge = side === 'v0' ? kitchen.v : kitchen.v + kitchen.lv;
    const turn: Point = [(low + high) / 2, (bathEdge + kitchenEdge) / 2];
    const entryAt = doorUvPoint(entry, living);
    const start: Point = [entryAt[0], entryAt[1] + (side === 'v0' ? 1 : -1)];
    const approach = (room: PlanRoom): Point => {
      const door = room.doors[0]!, p = doorUvPoint(door, room), inward = door.edge.endsWith('0') ? 1 : -1;
      return door.edge.startsWith('v') ? [p[0], p[1] - inward * .65] : [p[0] - inward * .65, p[1]];
    };
    const clear = (a: Point, b: Point) => physics.world.castShape({ x: a[0], y: 1.5, z: a[1] },
      { x: 0, y: 0, z: 0, w: 1 }, { x: b[0] - a[0], y: 0, z: b[1] - a[1] },
      new physics.rapier.Ball(.55), 0, 1, true);
    expect(clear(start, turn), 'private entry to living turn').toBeNull();
    const destinations = privateRooms.map(room => ({ kind: room.kind, point: approach(room) }));
    const points = [start, turn, ...destinations.map(destination => destination.point)];
    // End-positioned bedroom doors may need one further bend around a service
    // corner. Add physical visibility vertices, not a copy of the planner's grid.
    for (const room of privateRooms) for (const corner of uvRectCorners(room.rect)) {
      for (const [dx,dz] of [[.57,0],[-.57,0],[0,.57],[0,-.57]]) {
        const point: Point = [corner[0] + dx!, corner[1] + dz!];
        let blocked = false;
        physics.world.intersectionsWithShape({ x:point[0], y:1.5, z:point[1] }, { x:0,y:0,z:0,w:1 },
          new physics.rapier.Ball(.55), () => { blocked = true; return false; });
        if (!blocked) points.push(point);
      }
    }
    const reached = new Set([0]), pending = [0];
    while (pending.length) {
      const from = pending.pop()!;
      for (let to = 0; to < points.length; to++) if (!reached.has(to) && clear(points[from]!, points[to]!) === null) {
        reached.add(to); pending.push(to);
      }
    }
    destinations.forEach((destination, index) => expect(reached.has(index + 2),
      `1.1m clear living route to ${destination.kind}`).toBe(true));
  } finally { physics.world.free(); }
});


it.each([
  { width:9.217, depth:8, side:'v0' as const }, { width:9.217, depth:8, side:'v1' as const },
  { width:8, depth:9.5, side:'v0' as const }, { width:8, depth:9.5, side:'v1' as const },
])('uses a legal partial-width bedroom and a complete living bay in $width × $depth $side homes', ({width,depth,side}) => {
  const rect = { u:12.5, v:12.5, lu:width, lv:depth }, ids = idGen(2), pier = rect.u + 4;
  const home = damagedDwellingProgram(rect,side,uvRectCorners(rect),[rect.u,pier,rect.u+width],'private-home',ids)!;
  expect(home).not.toBeNull();
  const living = home[0]!, bedroom = home.find(room=>room.kind==='bedroom')!;
  expect(bedroom.rect.lu).toBeGreaterThanOrEqual(3.5);
  expect(bedroom.rect.lu).toBeLessThanOrEqual(5.5);
  expect([bedroom.rect.u,bedroom.rect.u+bedroom.rect.lu].some(edge=>Math.abs(edge-pier)<1e-7)).toBe(true);
  expect(roomArea(bedroom)).toBeLessThan(22);
  expect(roomArea(living)).toBeGreaterThan(36);
  const kitchen=home.find(room=>room.kind==='kitchen')!,bath=home.find(room=>room.kind==='bathroom')!;
  const gap=(a:UvRect,b:UvRect)=>Math.hypot(Math.max(0,a.u-b.u-b.lu,b.u-a.u-a.lu),
    Math.max(0,a.v-b.v-b.lv,b.v-a.v-a.lv));
  expect(gap(bedroom.rect,kitchen.rect)).toBeGreaterThanOrEqual(1.1);
  expect(gap(bath.rect,kitchen.rect)).toBeGreaterThanOrEqual(1.1);
  for(const room of home.slice(1)) expect(room.doors[0]!.to).toBe(living.id);
  const publicRect={...rect,v:side==='v1'?rect.v+depth:rect.v-3,lv:3};
  const publicRoom:PlanRoom={id:'public',kind:'corridor',rect:publicRect,polygon:uvRectCorners(publicRect),doors:[]};
  expect(doorBetween(living,'public',publicRoom,ids,1,1.2)?.width).toBe(1.2);
  const furniture=furnish([publicRoom,...home],'apartment',createRng('partial-bedroom-full-living'),ids,
    {outline:[[0,0],[50,0],[50,50],[0,50]],inner:[[.5,.5],[49.5,.5],[49.5,49.5],[.5,49.5]],facadeDepth:.5},[], 'poor',[],'damaged');
  const inRoom=(kind:string)=>furniture.filter(item=>item.room===home.find(room=>room.kind===kind)!.id);
  expect(inRoom('bedroom').map(item=>item.kind)).toEqual(expect.arrayContaining(['bed_double','wardrobe']));
  expect(inRoom('kitchen').map(item=>item.kind)).toEqual(expect.arrayContaining(['kitchen_block','fridge']));
  expect(inRoom('bathroom').map(item=>item.kind)).toEqual(expect.arrayContaining(['shower','toilet','sink']));
  const occupied=inRoom('living');
  expect(occupied.map(item=>item.kind)).toEqual(expect.arrayContaining(['sofa','low_table','display_screen']));
  expect(occupied.find(item=>item.kind==='sofa')!.size).toEqual([1.8,.85,.8]);
  expect(occupied.find(item=>item.kind==='low_table')!.size).toEqual([.9,.5,.4]);
  expect(occupied.find(item=>item.kind==='display_screen')!.size).toEqual([1.2,.08,.7]);
});
