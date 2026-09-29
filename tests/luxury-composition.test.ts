import { expect, it } from 'vitest';
import { createRng } from '../src/core/rng.js';
import { furnish } from '../src/layout/furnish.js';
import type { PlanFurniture, PlanRoom } from '../src/layout/plan-types.js';
import { roomCoversRect } from '../src/layout/room-shape.js';
import type { FloorBounds } from '../src/layout/shell.js';

function populate(kind: PlanRoom['kind'], width: number, depth: number): { room: PlanRoom; items: PlanFurniture[] } {
  const room: PlanRoom = { id: 'room', kind, unit: kind === 'living' || kind === 'bedroom' ? '101' : undefined,
    rect: { u: 2, v: 2, lu: width, lv: depth }, doors: [{ id: 'entry', edge: 'v0', at: 2 + width / 2, width: 1.6, leaves: 2, to: 'corridor' }] };
  const outline: [number, number][] = [[0, 0], [width + 4, 0], [width + 4, depth + 4], [0, depth + 4]];
  const bounds = { inner: outline, outline, facadeDepth: .25 } as FloorBounds;
  let next = 0;
  const items = furnish([room], 'apartment', createRng(51), { furniture: () => `piece-${next++}` } as never, bounds, [], 'high_rich', [], 'luxury');
  return { room, items };
}

function footprint(item: PlanFurniture) {
  const [lu, lv] = item.rotationDeg % 180 ? [item.size[1], item.size[0]] : item.size;
  return { u: item.at[0] - lu! / 2, v: item.at[1] - lv! / 2, lu: lu!, lv: lv! };
}

function noSolidOverlap(room: PlanRoom, items: PlanFurniture[]): void {
  for (const [index, item] of items.entries()) {
    const a = footprint(item);
    expect(roomCoversRect(room, a), item.kind).toBe(true);
    for (const other of items.slice(index + 1)) {
      if ((item.elevation ?? 0) >= (other.elevation ?? 0) + other.size[2]
        || (other.elevation ?? 0) >= (item.elevation ?? 0) + item.size[2]) continue;
      const b = footprint(other);
      expect(a.u < b.u + b.lu - 1e-6 && a.u + a.lu > b.u + 1e-6 && a.v < b.v + b.lv - 1e-6 && a.v + a.lv > b.v + 1e-6,
        `${item.kind}/${other.kind}`).toBe(false);
    }
  }
}

it.each([[6, 4.5], [4.5, 6], [6, 6], [8, 7]])('keeps the full bed and both real bedside cabinets in a %s by %s bedroom', (width, depth) => {
  const { room, items } = populate('bedroom', width!, depth!);
  expect(items.filter(item => item.kind === 'bed_double')).toHaveLength(1);
  expect(items.find(item => item.kind === 'bed_double')!.size).toEqual([2, 2.3, .6]);
  expect(items.filter(item => item.kind === 'low_table')).toHaveLength(2);
  expect(items.some(item => item.kind === 'wardrobe')).toBe(true);
  noSolidOverlap(room, items);
});

it.each([[4.1, 4.5], [6, 6], [10, 8], [8, 10]])('gives a %s by %s living room a supported media wall facing its sofa', (width, depth) => {
  const { room, items } = populate('living', width!, depth!);
  const sofa = items.find(item => item.kind === 'sofa')!, screen = items.find(item => item.kind === 'display_screen')!;
  expect(sofa).toBeDefined(); expect(screen).toBeDefined();
  expect((sofa.rotationDeg + 180) % 360).toBe(screen.rotationDeg);
  expect(items.some(item => item.kind === 'counter' && item.size[0] === 3)).toBe(true);
  const wallDistance = Math.min(screen.at[0] - 2, width! + 2 - screen.at[0], screen.at[1] - 2, depth! + 2 - screen.at[1]);
  expect(wallDistance).toBeLessThan(.33);
  noSolidOverlap(room, items);
});

it('keeps a media wall off facade glazing when a living room occupies a building corner', () => {
  const room: PlanRoom = { id: 'corner', kind: 'living', unit: '101', rect: { u: 0, v: 0, lu: 8, lv: 8 },
    doors: [{ id: 'entry', edge: 'v1', at: 6.5, width: 1.6, leaves: 2, to: 'corridor' }] };
  const outline: [number, number][] = [[0, 0], [16, 0], [16, 16], [0, 16]];
  let index = 0;
  const items = furnish([room], 'apartment', createRng(7), { furniture: () => `corner-${index++}` } as never,
    { inner: outline, outline, facadeDepth: .25 } as FloorBounds, [], 'high_rich', [], 'luxury');
  const screen = items.find(item => item.kind === 'display_screen')!;
  expect(screen).toBeDefined();
  expect(screen.rotationDeg === 180 || screen.rotationDeg === 270).toBe(true);
  expect(screen.at[0] > 7.6 || screen.at[1] > 7.6).toBe(true);
});

it('composes a public lounge around a tall planted backdrop and keeps a separate reading function', () => {
  const { room, items } = populate('lounge', 11, 13);
  expect(items.filter(item => item.kind === 'sofa')).toHaveLength(2);
  expect(items.some(item => item.kind === 'ornament_wall' && item.size[2] === 2.7)).toBe(true);
  expect(items.some(item => item.kind === 'shelf')).toBe(true);
  expect(items.filter(item => item.kind === 'plant')).toHaveLength(0);
  noSolidOverlap(room, items);
});

it('gives a wide reception one large counter with a staff chair behind its working side', () => {
  const { room, items } = populate('reception', 35, 16);
  const desk = items.find(item => item.kind === 'reception_desk')!, chair = items.find(item => item.kind === 'office_chair')!;
  expect(desk.size).toEqual([3.8, 1, 1.1]);
  expect(chair).toBeDefined();
  const angle = desk.rotationDeg * Math.PI / 180, forward = [Math.sin(angle), Math.cos(angle)];
  expect((chair.at[0] - desk.at[0]) * forward[0]! + (chair.at[1] - desk.at[1]) * forward[1]!).toBeLessThan(-1);
  noSolidOverlap(room, items);
});
