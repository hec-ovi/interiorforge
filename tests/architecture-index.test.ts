import { expect, it } from 'vitest';
import { ArchitectureIndex } from '../src/layout/architecture-index.js';

it('retains ordered candidates across fine rotated queries and invalidates a bucket when furniture is added', () => {
  const index = new ArchitectureIndex<{ id: string }>({ x: -4, z: -4, w: 8, d: 8 });
  const wall = { id: 'wall' }, chair = { id: 'chair' }, neighbour = { id: 'neighbour' };
  index.add(wall, { x: -.9, z: -.9, w: .2, d: .2 });
  index.add(neighbour, { x: .1, z: -.9, w: .2, d: .2 });
  for (const angle of [0, 37, 90]) {
    const radians = angle * Math.PI / 180;
    expect(index.query([-.6, -.6], [-.6 + Math.cos(radians) * .0625, -.6 + Math.sin(radians) * .0625])).toEqual([wall]);
  }
  // Crossing a bucket uses the same row-major union; repeated entries remain unique.
  expect(index.query([-.6, -.6], [.6, -.6])).toEqual([wall, neighbour]);
  expect(index.query([-.6, -.6], [-.55, -.55])).toEqual([wall]);
  index.add(chair, { x: -.8, z: -.8, w: .1, d: .1 });
  expect(index.query([-.6, -.6], [-.55, -.55])).toEqual([wall, chair]);
  expect(index.query([-.6, -.6], [.6, -.6])).toEqual([wall, chair, neighbour]);
});

it('updates previously empty queried buckets without changing out-of-bounds behaviour', () => {
  const index = new ArchitectureIndex<string>({ x: 0, z: 0, w: 4, d: 4 });
  expect(index.query([2.2, 2.2], [2.3, 2.3])).toEqual([]);
  index.add('new solid', { x: 2.1, z: 2.1, w: .1, d: .1 });
  expect(index.query([2.2, 2.2], [2.3, 2.3])).toEqual(['new solid']);
  expect(index.query([20, 20], [21, 21])).toEqual([]);
});
