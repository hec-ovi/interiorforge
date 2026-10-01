import type { PlanRoom } from '../plan-types.js';
import type { Composer, PlanRect } from './composer.js';
import { conversation, type Composed, type CoreBox, type HomeLook } from './kind-a.js';
import { art, bathroom, kitchen, plant } from './kits.js';

/** Kinds B and C on the composed core. B is the warm, dark glass building (its plans are
 *  drawn with the stair on the left and stand mirrored, the stair against the right wall);
 *  C is the poor block. Their home floors reuse the loft plans in their own look, C's cut into
 *  compact homes off a common gallery. */

export const LOOK_B: HomeLook = { look: 'b', home: 'b3', bath: 'b3', common: 'b1' };
export const LOOK_C: HomeLook = { look: 'c', home: 'c7', bath: 'c7', common: 'c2' };

/** Kind B's ground: a low lounge of built-in benches and lanterns round a table, a salon
 *  behind glass with its library, the raised bar in the back corner, the concierge facing the
 *  entrance, closed services along the back. */
export function groundB(c: Composer, core: CoreBox, plate: readonly [number, number][], entrance: number): Composed {
  const { W, D } = c;
  const [l0, , l1, lv1] = core.lifts;
  const sw = core.stair[2];
  const toilets = c.room('toilets', 'toilets', [[0, 0, 7, core.stair[1]]], { style: 'b1', authored: false });
  const mech = c.room('mechanical', 'mechanical_room', [[7, 0, 12.5, 4.3]], { style: 'b1' });
  const storage = c.room('stores', 'storage', [[12.5, 0, 17, 4.3]], { style: 'b1' });
  const salon = c.room('salon', 'lounge', [[0, D - 10, 9, D]], { style: 'b2' });
  const hall = c.remainder('lobby', 'elevator_lobby', plate, core.cut, { style: 'b1' });
  c.door(toilets, hall, [(sw + 7) / 2, core.stair[1]], 1.0);
  c.door(mech, hall, [9.75, 4.3], 1.2);
  c.door(storage, hall, [14.75, 4.3], 1.2);
  c.door(salon, hall, [9, D - 5], 2.0);
  // the bar in the back-right corner: back bar on the wall, counter and stools before it
  c.piece(hall, { kind: 'kitchen_block', at: [W - 4.6, .42], size: [5.6, .8, .95], facing: 'front', fit: 'asm-b3-bar' });
  c.piece(hall, { kind: 'bar_counter', at: [W - 4.6, 2.9], size: [4.2, 1.0, 1.1], facing: 'front', fit: 'asm-b3-counter' });
  for (let i = 0; i < 5; i++) c.piece(hall, { kind: 'stool', at: [W - 6.4 + i * .9, 4.05], size: [.45, .45, .75], facing: 'back', fit: 'fit-bar-stool-b3' });
  c.piece(hall, { kind: 'plant', at: [W - .35, 6.5], size: [2.85, .6, 2.6], facing: 'left', fit: 'asm-b3-bamboo' });
  // the low lounge in front of the lift core's right, benches round a table, lanterns
  conversation(c, hall, [l1 + 4.8, lv1 + 6.0], 'u', 3.4);
  plant(c, hall, [l1 + 1.0, lv1 + 3.4]); plant(c, hall, [W - .7, lv1 + 6.0], true);
  // the concierge facing the entrance, a long bench under the art on the stair wall
  const desk = Math.min(W - 6, Math.max(12, entrance));
  c.piece(hall, { kind: 'reception_desk', at: [desk, D - 9.0], size: [3.2, .9, 1.1], facing: 'front', fit: 'fit-reception-desk-luxury' });
  c.piece(hall, { kind: 'office_chair', at: [desk, D - 10.1], size: [.62, .62, 1.1], facing: 'front' });
  c.piece(hall, { kind: 'bench', at: [sw + .3, 9.6], size: [3.0, .5, .45], facing: 'right' });
  art(c, hall, [sw + .05, 9.6], 'left', 2.4);
  art(c, hall, [(l0 + l1) / 2, lv1 + .05], 'back', 2.4);
  plant(c, hall, [W - .7, D - .7], true); plant(c, hall, [9.7, D - .7], true);
  // the salon: two sofas, a library wall on the solid side, a desk
  conversation(c, salon, [4.5, D - 5.2], 'v', 2.6);
  c.piece(salon, { kind: 'shelf', at: [.3, D - 2.0], size: [2.0, .5, 2.2], facing: 'right', fit: 'fit-bookcase-luxury' });
  c.piece(salon, { kind: 'desk', at: [6.8, D - 9.4], size: [1.6, .7, .75], facing: 'front' });
  plant(c, salon, [8.4, D - .6]);
  // services
  c.piece(mech, { kind: 'shelf', at: [12.23, 1.4], size: [1.8, .5, 2.2], facing: 'left', fit: 'fit-open-switchboard' });
  c.piece(mech, { kind: 'gym_machine', at: [9.0, 1.7], size: [2.8, 1.25, 2.25], facing: 'front', fit: 'fit-open-pump-skid' });
  c.piece(storage, { kind: 'shelf', at: [14.75, .3], size: [1.8, .5, 2.0], facing: 'front', fit: 'fit-industrial-storage-rack' });
  c.piece(storage, { kind: 'crate', at: [16.4, 2.4], size: [.62, .62, .55], facing: 'left', fit: 'fit-industrial-transit-case' });
  return { rooms: c.rooms, rearLanding: true };
}

/** Kind C's ground: the entry hall with the caretaker's desk facing the door, the mail bank,
 *  vending and a kiosk, a small canteen counter in the back corner, the public toilets, the
 *  machine room and the stores closed along the back. */
export function groundC(c: Composer, core: CoreBox, plate: readonly [number, number][], entrance: number): Composed {
  const { W, D } = c;
  const [, , l1, lv1] = core.lifts;
  const sw = core.stair[2];
  const toilets = c.room('toilets', 'toilets', [[0, 0, 7, core.stair[1]]], { style: 'c4', authored: false });
  const machine = c.room('machine', 'mechanical_room', [[7, 0, 13, 4.6]], { style: 'c5' });
  const storage = c.room('stores', 'storage', [[13, 0, 18, 4.3]], { style: 'c2' });
  const hall = c.remainder('lobby', 'elevator_lobby', plate, core.cut, { style: 'c3' });
  c.door(toilets, hall, [(sw + 7) / 2, core.stair[1]], 1.0);
  c.door(machine, hall, [10, 4.6], 1.2);
  c.door(storage, hall, [15.5, 4.3], 1.0);
  const desk = Math.min(W - 5, Math.max(8, entrance));
  c.piece(hall, { kind: 'reception_desk', at: [desk, D - 8.4], size: [2.6, .9, 1.1], facing: 'front', fit: 'fit-damaged-caretaker-desk' });
  c.piece(hall, { kind: 'office_chair', at: [desk, D - 9.4], size: [.62, .62, 1.1], facing: 'front' });
  c.piece(hall, { kind: 'shelf', at: [sw + .3, 9.0], size: [2.4, .5, 2.0], facing: 'right', fit: 'fit-damaged-mail-bank' });
  c.piece(hall, { kind: 'display_rack', at: [W - .5, D - 4.0], size: [1.0, .8, 2.0], facing: 'left', fit: 'fit-c1-vending' });
  c.piece(hall, { kind: 'display_rack', at: [W - .5, D - 5.4], size: [1.0, .8, 2.0], facing: 'left', fit: 'fit-c1-vending' });
  c.piece(hall, { kind: 'counter', at: [W - 1.0, D - 9.0], size: [1.6, 1.2, 2.2], facing: 'left', fit: 'fit-c3-kiosk' });
  // the canteen in the back-right corner
  c.piece(hall, { kind: 'kitchen_block', at: [W - 4.0, .36], size: [5.0, .7, .95], facing: 'front' });
  c.piece(hall, { kind: 'bar_counter', at: [W - 4.0, 2.6], size: [4.0, .7, 1.05], facing: 'front' });
  for (let i = 0; i < 5; i++) c.piece(hall, { kind: 'stool', at: [W - 5.6 + i * .8, 3.5], size: [.42, .42, .72], facing: 'back' });
  for (const du of [-3.2, 0]) {
    c.piece(hall, { kind: 'dining_table', at: [W - 3.2 + du, 6.4], size: [1.2, .8, .75], facing: 'front' });
    for (const s of [-1, 1]) c.piece(hall, { kind: 'chair', at: [W - 3.2 + du, 6.4 + s * .7], size: [.48, .48, .88], facing: s < 0 ? 'back' : 'front' });
  }
  c.piece(hall, { kind: 'bench', at: [l1 + 3.0, lv1 + 2.6], size: [2.2, .5, .45], facing: 'front' });
  c.piece(hall, { kind: 'shelf', at: [sw + .3, 12.0], size: [1.6, .45, 1.8], facing: 'right', fit: 'fit-damaged-community-shelf' });
  plant(c, hall, [.7, D - .7]);
  // machine room and stores
  c.piece(machine, { kind: 'room_divider', at: [12.73, 2.3], size: [2.4, .5, 2.0], facing: 'left', fit: 'fit-industrial-ventilation-bank' });
  c.piece(machine, { kind: 'ornament_wall', at: [9.0, .3], size: [3.0, .5, 2.0], facing: 'front', fit: 'fit-industrial-drive-bank' });
  c.piece(machine, { kind: 'counter', at: [8.0, 3.2], size: [2.0, .7, .9], facing: 'back', fit: 'fit-industrial-tool-counter' });
  c.piece(storage, { kind: 'shelf', at: [15.5, .3], size: [3.0, .5, 2.0], facing: 'front', fit: 'fit-damaged-storage-wall' });
  for (const [u, v] of [[13.5, 2.2], [13.5, 2.9], [17.4, 2.2]] as const) c.piece(storage, { kind: 'crate', at: [u, v], size: [.62, .62, .55], facing: 'right', fit: 'fit-crate' });
  return { rooms: c.rooms, rearLanding: true };
}

/** Kind C's home floor: a common gallery across the front of the core and down its right side
 *  (benches, planters, a laundry corner), compact homes all round it, each one open room with
 *  its wet cell by the door, a kitchenette, a bed niche on the window, a sofa and a desk. */
export function typicalC(c: Composer, core: CoreBox, variant: number): Composed {
  const { W, D } = c;
  const [l0, lv0, l1, lv1] = core.lifts;
  const sw = core.stair[2], g1 = lv1 + 4.0, mid = Math.round(W / 2 * 2) / 2;
  const unit = (n: number) => `f${c.floorIndex}-home-${n}`;
  const homes: { id: string; rects: PlanRect[]; wet: PlanRect; wetDoor: readonly [number, number]; entry: readonly [number, number]; zone: PlanRect; window: 'back' | 'front' }[] = [];
  homes.push({ id: 'home-1', rects: [[sw, 0, mid, lv0], [sw, lv0, l0, lv1]], wet: [0, 0, sw, core.stair[1]], wetDoor: [sw, core.stair[1] / 2],
    entry: [(sw + l0) / 2, lv1], zone: [sw, 0, mid, lv0], window: 'back' });
  homes.push({ id: 'home-2', rects: [[mid, 0, W, lv0]], wet: [W - 2.6, 0, W, 2.8], wetDoor: [W - 2.6, 1.4],
    entry: [(l1 + W) / 2, lv0], zone: [mid, 0, W - 2.8, lv0], window: 'back' });
  const n = variant % 2 ? 5 : 4, width = W / n;
  for (let i = 0; i < n; i++) {
    const u0 = Math.round(i * width * 10) / 10, u1 = i === n - 1 ? W : Math.round((i + 1) * width * 10) / 10;
    const wetLeft = i % 2 === 0;
    const wet: PlanRect = wetLeft ? [u0, g1, u0 + 2.4, g1 + 2.8] : [u1 - 2.4, g1, u1, g1 + 2.8];
    homes.push({ id: `home-${i + 3}`, rects: [[u0, g1, u1, D]], wet, wetDoor: [wetLeft ? u0 + 2.4 : u1 - 2.4, g1 + 1.4],
      entry: [wetLeft ? (u0 + 2.4 + u1) / 2 : (u0 + u1 - 2.4) / 2, g1], zone: [u0, g1 + 3.0, u1, D], window: 'front' });
  }
  const made = homes.map((h, i) => {
    const wet = c.room(`wet-${i + 1}`, 'bathroom', [h.wet], { style: 'c7', unit: unit(i + 1), authored: false });
    const room = c.room(h.id, 'studio_main', h.rects, { style: 'c7', unit: unit(i + 1), cut: [c.rect(h.wet)] });
    return { h, wet, room };
  });
  const gallery = c.room('gallery', 'elevator_lobby', [[0, core.stair[3], sw, g1], [sw, lv1, W, g1], [l1, lv0, W, lv1]], { style: 'c2' });
  for (const { h, wet, room } of made) {
    c.door(wet, room, h.wetDoor, .8);
    c.door(room, gallery, h.entry, 1.0);
    compactHome(c, room, h.zone, h.window);
  }
  // the gallery: a laundry corner by the window, benches, planters, a notice board
  c.piece(gallery, { kind: 'counter', at: [W - .4, lv0 + 2.2], size: [3.0, .7, .9], facing: 'left' });
  c.piece(gallery, { kind: 'bench', at: [sw + 2.4, g1 - .3], size: [2.0, .45, .45], facing: 'back' });
  art(c, gallery, [(l0 + l1) / 2, lv1 + .05], 'back', 1.6);
  plant(c, gallery, [W - .6, g1 - .6]);
  return { rooms: c.rooms, rearLanding: false };
}

/** One compact home in its zone: a bed against the window wall's corner, a sofa and low table,
 *  a kitchenette on a side wall, a desk, a wardrobe. */
function compactHome(c: Composer, room: PlanRoom, zone: PlanRect, window: 'back' | 'front'): void {
  const [u0, v0, u1, v1] = zone, w = u1 - u0;
  const far = window === 'front' ? v1 : v0, near = window === 'front' ? v0 : v1, s = window === 'front' ? -1 : 1;
  // bed in the window corner, head on the left side wall
  c.piece(room, { kind: 'bed_double', at: [u0 + 1.1, far + s * 1.2], size: [1.6, 2.1, .5], facing: 'right' });
  c.piece(room, { kind: 'low_table', at: [u0 + .3, far + s * 2.55], size: [.45, .45, .5], facing: 'right' });
  // sofa facing the right wall, a low table before it
  if (w >= 5.5) {
    c.piece(room, { kind: 'sofa', at: [u0 + 3.3, far + s * 1.4], size: [1.8, .85, .8], facing: 'right' });
    c.piece(room, { kind: 'low_table', at: [u0 + 4.4, far + s * 1.4], size: [.6, .9, .4], facing: 'right' });
  }
  // kitchenette on the right wall nearer the door, a table for two, a desk on the window
  const kv = (near + far) / 2, ka = near + s * .4;
  kitchen(c, room, [u1 - .8, Math.min(kv, ka), u1, Math.max(kv, ka)], 'right', 'c', { island: false });
  c.piece(room, { kind: 'dining_table', at: [u1 - 1.9, kv + s * 1.0], size: [.8, .8, .75], facing: 'front' });
  for (const t of [-1, 1]) c.piece(room, { kind: 'chair', at: [u1 - 1.9 + t * .62, kv + s * 1.0], size: [.45, .45, .88], facing: t < 0 ? 'right' : 'left' });
  c.piece(room, { kind: 'desk', at: [u1 - .45, far + s * .9], size: [1.2, .6, .75], facing: 'left' });
  c.piece(room, { kind: 'wardrobe', at: [u0 + .3, kv], size: [1.4, .6, 2.0], facing: 'right' });
  void bathroom;
}
