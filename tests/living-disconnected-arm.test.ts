import { expect, it } from 'vitest';
import { livingConnected } from '../src/layout/living-connectivity.js';
import { roomClearance, type RoomShape } from '../src/layout/room-shape.js';

it('rejects the standable living arm that otherwise needs a bathroom through-route', () => {
  // Exact pre-validation f1-r24 footprint, enclosed-stairs mirror-frame at 37°.
  // Its 1m west arm contains real body-clear floor, but the quarter-metre
  // sample phase misses its .39m-clear center strip. The .5m and .4m necks
  // around the bathroom cannot connect that arm to the main living space.
  const room: RoomShape = {
    rect: { u: 20, v: 21.499999999999993, lu: 17, lv: 15.500000000000007 },
    polygon: [
      [20, 29], [20, 24.999999999999993], [21, 25], [21, 28.5],
      [24.5, 28.5], [24.5, 25], [24.9, 24.999999999999993],
      [24.9, 29.499999999999993], [29.4, 29.499999999999993],
      [29.4, 21.499999999999993], [37, 21.499999999999993],
      [37, 37], [25, 37], [25, 31.5], [22.5, 31.5], [22.5, 29],
    ],
    holes: [[[33, 24], [29.5, 24], [29.5, 31.5], [33.5, 31.5], [33.5, 27.5], [33, 27.5]]],
  };
  expect(roomClearance(room, [20.5, 27])).toBeCloseTo(.5, 8);
  expect(roomClearance(room, [22, 28.75])).toBeCloseTo(.25, 8);
  expect(livingConnected(room)).toBe(false);
});
