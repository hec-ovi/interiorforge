import type { PlanRoom } from '../plan-types.js';
import type { Composer, PlanRect, Side } from './composer.js';
import type { Composed, CoreBox } from './kind-a.js';
import { conversation } from './kind-a.js';
import { art, dining, plant } from './kits.js';

/** Kind R, the rich office building, and the office floors of every composed kind. The floor
 *  is one open office around the core; only toilets and the service room are closed, meeting
 *  rooms are glass islands with an open doorway, the kitchen is an open café bar. Nothing but
 *  the core meets a window wall, so no partition ever lands on glass. Four plan types turn
 *  with the floor and the building's seed: an open loft floor, a studio round a glass meeting
 *  cluster, an executive floor and a co-working floor round a big café. */

export type OfficeType = 'loft' | 'studio' | 'executive' | 'cowork';
export const OFFICE_TYPES: readonly OfficeType[] = ['loft', 'studio', 'executive', 'cowork'];

const facingOf = (wall: Side): Side => wall === 'left' ? 'right' : wall === 'right' ? 'left' : wall === 'back' ? 'front' : 'back';

/** Desk pods: `rows` x `cols` blocks of four desks, two facing two, each with its chair,
 *  filling the zone in rows along u. */
function deskPods(c: Composer, room: PlanRoom, zone: PlanRect, opts: { podDesks?: 2 | 3; gapU?: number; gapV?: number } = {}): void {
  const [u0, v0, u1, v1] = zone, per = opts.podDesks ?? 2;
  const deskW = 1.5, deskD = .8, podW = per * deskW, podD = 2 * deskD;
  const gapU = opts.gapU ?? 1.8, gapV = opts.gapV ?? 2.4;
  const cols = Math.max(1, Math.floor((u1 - u0 + gapU) / (podW + gapU)));
  const rows = Math.max(1, Math.floor((v1 - v0 + gapV) / (podD + 2 * .7 + gapV)));
  const spanU = cols * podW + (cols - 1) * gapU, spanV = rows * (podD + 1.4) + (rows - 1) * gapV;
  const su = u0 + (u1 - u0 - spanU) / 2, sv = v0 + (v1 - v0 - spanV) / 2 + .7;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const pu = su + k * (podW + gapU), pv = sv + r * (podD + 1.4 + gapV);
    for (let i = 0; i < per; i++) {
      const cu = pu + deskW / 2 + i * deskW;
      c.piece(room, { kind: 'desk', at: [cu, pv + deskD / 2], size: [deskW - .05, deskD, .75], facing: 'back' });
      c.piece(room, { kind: 'office_chair', at: [cu, pv - .42], size: [.62, .62, 1.1], facing: 'front' });
      c.piece(room, { kind: 'desk', at: [cu, pv + deskD * 1.5], size: [deskW - .05, deskD, .75], facing: 'front' });
      c.piece(room, { kind: 'office_chair', at: [cu, pv + podD + .42], size: [.62, .62, 1.1], facing: 'back' });
    }
  }
}

/** A glass meeting room island: the room (made before the open floor is cut round it). */
function meetingRoom(c: Composer, id: string, rect: PlanRect): PlanRoom {
  return c.room(id, 'meeting', [rect], { style: 'r1' });
}

/** Its open doorway onto the floor, a table and chairs on its long axis. */
function furnishMeeting(c: Composer, room: PlanRoom, floor: PlanRoom, rect: PlanRect, door: readonly [number, number], seats: number): void {
  c.door(room, floor, door, 1.4);
  const [u0, v0, u1, v1] = rect, along = u1 - u0 >= v1 - v0;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, len = Math.min(along ? u1 - u0 - 1.6 : v1 - v0 - 1.6, seats >= 10 ? 4.2 : seats >= 8 ? 3.2 : 2.4);
  c.piece(room, { kind: 'meeting_table', at: [cu, cv], size: [len, 1.2, .75], facing: along ? 'back' : 'left' });
  const per = Math.max(1, Math.floor(seats / 2));
  for (let i = 0; i < per; i++) {
    const t = -((per - 1) * .75) / 2 + i * .75;
    if (along) {
      c.piece(room, { kind: 'chair', at: [cu + t, cv - .95], size: [.5, .5, .9], facing: 'front' });
      c.piece(room, { kind: 'chair', at: [cu + t, cv + .95], size: [.5, .5, .9], facing: 'back' });
    } else {
      c.piece(room, { kind: 'chair', at: [cu - .95, cv + t], size: [.5, .5, .9], facing: 'right' });
      c.piece(room, { kind: 'chair', at: [cu + .95, cv + t], size: [.5, .5, .9], facing: 'left' });
    }
  }
}

/** The open café bar of a floor: a counter facing the floor with stools, a back counter
 *  against `wall`, and café tables in front. */
function cafeBar(c: Composer, room: PlanRoom, zone: PlanRect, wall: Side, stools: number, tables: number): void {
  const [u0, v0, u1, v1] = zone;
  const alongU = wall === 'back' || wall === 'front';
  const len = Math.min(alongU ? u1 - u0 - .6 : v1 - v0 - .6, Math.max(2.4, stools * .7 + .4));
  const mid = alongU ? (u0 + u1) / 2 : (v0 + v1) / 2;
  const at = (a: number, d: number): [number, number] => wall === 'back' ? [a, v0 + d] : wall === 'front' ? [a, v1 - d] : wall === 'left' ? [u0 + d, a] : [u1 - d, a];
  c.piece(room, { kind: 'kitchen_block', at: at(mid, .35), size: [len, .7, 1.05], facing: facingOf(wall) });
  c.piece(room, { kind: 'bar_counter', at: at(mid, 2.35), size: [len, .75, 1.1], facing: facingOf(wall) });
  const n = Math.min(stools, Math.floor(len / .7));
  for (let i = 0; i < n; i++) c.piece(room, { kind: 'stool', at: at(mid - (n - 1) * .7 / 2 + i * .7, 3.25), size: [.45, .45, .75], facing: wall });
  for (let i = 0; i < tables; i++) {
    const a = mid - (tables - 1) * 1.9 / 2 + i * 1.9;
    const p = at(a, 5.0);
    c.piece(room, { kind: 'dining_table', at: p, size: [.9, .9, .75], facing: 'front' });
    for (const s of [-1, 1]) c.piece(room, { kind: 'chair', at: alongU ? [p[0], p[1] + s * .75] : [p[0] + s * .75, p[1]], size: [.5, .5, .9],
      facing: alongU ? (s < 0 ? 'front' : 'back') : (s < 0 ? 'right' : 'left') });
  }
}

/** A lounge along a window: sofas facing each other, armchairs, plants. */
function windowLounge(c: Composer, room: PlanRoom, at: readonly [number, number], along: 'u' | 'v', len: number): void {
  conversation(c, room, at, along, len);
}

/** The ground floor of an office building: the lobby hall with the reception facing the
 *  entrance, a waiting lounge, the café bar, glass meeting room, closed services. */
export function groundR(c: Composer, core: CoreBox, plate: readonly [number, number][], entrance: number): Composed {
  const { W, D } = c;
  const [l0, , l1, lv1] = core.lifts;
  const sw = core.stair[2];
  const mech = c.room('mechanical', 'mechanical_room', [[0, 0, 7, core.stair[1]]], { style: 'r1' });
  const storage = c.room('stores', 'storage', [[7, 0, 11.5, 4.3]], { style: 'r1' });
  const toilets = c.room('toilets', 'toilets', [[W - 7, 0, W, 4.6]], { style: 'r1', authored: false });
  const meeting = c.room('meeting', 'meeting', [[W - 9.5, D - 9, W, D]], { style: 'r1' });
  const hall = c.remainder('lobby', 'elevator_lobby', plate, core.cut, { style: 'r1' });
  c.door(mech, hall, [(sw + 7) / 2, core.stair[1]], 1.2);
  c.door(storage, hall, [9.25, 4.3], 1.2);
  c.door(toilets, hall, [W - 5.5, 4.6], 1.0);
  c.door(meeting, hall, [W - 9.5, D - 4.5], 1.6);
  // reception facing the entrance, set back on its axis
  const desk = Math.min(W - 6, Math.max(6, entrance));
  c.piece(hall, { kind: 'reception_desk', at: [desk, D - 9.5], size: [5.2, 1.4, 1.1], facing: 'front' });
  for (const du of [-1.3, 1.3]) c.piece(hall, { kind: 'office_chair', at: [desk + du, D - 10.7], size: [.62, .62, 1.1], facing: 'front' });
  art(c, hall, [(l0 + l1) / 2, lv1 + .05], 'back', 2.4);
  // café bar on the back between the stores and the toilets
  cafeBar(c, hall, [11.8, 0, W - 7.2, 8.0], 'back', 7, 2);
  // waiting lounge left of the entrance, a second group by the meeting room
  windowLounge(c, hall, [Math.max(3.6, desk - 6.5), D - 4.0], 'u', 2.8);
  windowLounge(c, hall, [W - 14, D - 4.2], 'v', 2.8);
  plant(c, hall, [.6, D - .6], true); plant(c, hall, [W - 10.1, D - .6], true);
  plant(c, hall, [sw + .6, core.stair[3] + .8]); plant(c, hall, [l1 + .7, lv1 + .7]);
  // meeting room furniture
  const mu = W - 4.75, mv = D - 4.5;
  c.piece(meeting, { kind: 'meeting_table', at: [mu, mv], size: [2.8, 1.2, .75], facing: 'left' });
  for (const t of [-1, 0, 1]) for (const s of [-1, 1]) c.piece(meeting, { kind: 'chair', at: [mu + s * .95, mv + t * .85], size: [.5, .5, .9], facing: s < 0 ? 'right' : 'left' });
  // services
  c.piece(mech, { kind: 'shelf', at: [6.73, 1.15], size: [1.8, .5, 2.2], facing: 'left', fit: 'fit-open-switchboard' });
  c.piece(mech, { kind: 'room_divider', at: [6.73, 3.3], size: [2.4, .5, 2.0], facing: 'left', fit: 'fit-industrial-ventilation-bank' });
  c.piece(mech, { kind: 'gym_machine', at: [2.6, 1.7], size: [2.8, 1.25, 2.25], facing: 'front', fit: 'fit-open-pump-skid' });
  c.piece(storage, { kind: 'shelf', at: [9.25, .3], size: [1.8, .5, 2.0], facing: 'front', fit: 'fit-industrial-storage-rack' });
  c.piece(storage, { kind: 'shelf', at: [11.23, 2.4], size: [1.8, .5, 2.0], facing: 'left', fit: 'fit-industrial-storage-rack' });
  c.piece(storage, { kind: 'crate', at: [7.5, 2.0], size: [.62, .62, .55], facing: 'right', fit: 'fit-industrial-transit-case' });
  return { rooms: c.rooms, rearLanding: true };
}

/** An office floor of the given plan type. The service block (toilets, a print and store
 *  room) fills the alcove between the stair and the lift core; the lifts open front and back
 *  onto the open floor. */
export function officeR(c: Composer, core: CoreBox, plate: readonly [number, number][], type: OfficeType): Composed {
  const { W, D } = c;
  const [l0, lv0, l1, lv1] = core.lifts;
  const sw = core.stair[2];
  const toilets = c.room('toilets', 'toilets', [[sw, core.stair[1], l0, lv1]], { style: 'r1', authored: false });
  const service = c.room('service', 'storage', [[l1, lv0, Math.min(W - 5, l1 + 4), lv1]], { style: 'r1' });
  const meetings: [string, PlanRect, readonly [number, number], number][] = [];
  const front = lv1 + 3.4; // the clear band in front of the lifts
  if (type === 'loft') {
    meetings.push(['meeting-1', [l1 + 4.6, 1.6, W - 1.6, 6.6], [l1 + 4.6, 4.1], 6]);
  } else if (type === 'studio') {
    // a cluster of three glass rooms in the middle of the front band round a lounge
    const cu = W / 2, cv = front + 5.2;
    meetings.push(['meeting-1', [cu - 7.2, cv - 2.4, cu - 2.4, cv + 2.4], [cu - 4.8, cv - 2.4], 6]);
    meetings.push(['meeting-2', [cu + 2.4, cv - 2.4, cu + 7.2, cv + 2.4], [cu + 4.8, cv - 2.4], 6]);
    meetings.push(['meeting-3', [cu - 2.4, cv + 1.0, cu + 2.4, cv + 5.0], [cu, cv + 5.0], 4]);
  } else if (type === 'executive') {
    meetings.push(['boardroom', [l1 + 4.6, 1.2, W - 1.2, 7.2], [l1 + 4.6, 4.2], 10]);
  } else {
    meetings.push(['booth-1', [W - 5.2, front + 1.0, W - 1.6, front + 4.2], [W - 5.2, front + 2.6], 4]);
  }
  const exec = type === 'executive' ? c.room('executive', 'executive_office', [[W - 9.6, D - 8.6, W - 1.2, D - 1.2]], { style: 'r1' }) : null;
  const rooms = meetings.map(([id, rect]) => meetingRoom(c, id, rect));
  const floorRoom = c.remainder('office', 'elevator_lobby', plate, core.cut, { style: 'r1' });
  c.door(toilets, floorRoom, [(sw + l0) / 2, lv1], 1.0);
  c.door(service, floorRoom, [(l1 + Math.min(W - 5, l1 + 4)) / 2, lv1], 1.0);
  c.piece(service, { kind: 'shelf', at: [l1 + 2, lv0 + .3], size: [1.8, .5, 2.0], facing: 'front', fit: 'fit-industrial-storage-rack' });
  c.piece(service, { kind: 'counter', at: [l1 + .4, (lv0 + lv1) / 2 + .4], size: [2.0, .7, .9], facing: 'right' });
  for (const [i, [, rect, door, seats]] of meetings.entries()) {
    const room = rooms[i]!;
    furnishMeeting(c, room, floorRoom, rect, door, seats);
    if (seats >= 6) c.piece(room, { kind: 'display_screen', at: [rect[2] - .06, (rect[1] + rect[3]) / 2], size: [1.6, .08, .9], facing: 'left', elevation: 1.2 });
  }
  if (exec) {
    c.door(exec, floorRoom, [W - 9.6, D - 4.9], 1.6);
    const ex = W - 5.4, ev = D - 4.9;
    c.piece(exec, { kind: 'desk', at: [ex + 1.6, ev], size: [1.8, .9, .75], facing: 'left', fit: 'fit-corporate-executive-desk' });
    c.piece(exec, { kind: 'office_chair', at: [ex + 2.6, ev], size: [.65, .65, 1.15], facing: 'left' });
    for (const s of [-1, 1]) c.piece(exec, { kind: 'chair', at: [ex + .2, ev + s * .7], size: [.6, .6, .9], facing: 'right', fit: 'fit-chair-corpo' });
    c.piece(exec, { kind: 'bench', at: [ex - 2.2, D - 1.6], size: [1.5, .7, .75], facing: 'back', fit: 'asm-r1-library' });
    c.piece(exec, { kind: 'shelf', at: [ex - 2.4, D - 8.2], size: [1.35, .5, 1.25], facing: 'front', fit: 'fit-r1-chest' });
    plant(c, exec, [W - 1.8, D - 7.8]);
  }
  // the floor: a band of work in front, a lounge and the café by the core, work along the back
  const pods = (zone: PlanRect, per: 2 | 3 = 2) => deskPods(c, floorRoom, zone, { podDesks: per });
  if (type === 'loft') {
    pods([1.2, front + 1.0, W - 1.2, D - 1.0], 3);
    pods([sw + 1.0, .8, l1 + 3.6, lv0 - 1.6], 2);
    cafeBar(c, floorRoom, [l1 + 4, lv0 - .4, W - .2, lv1 + .6], 'left', 5, 1);
  } else if (type === 'studio') {
    pods([1.2, D - 7.0, W - 1.2, D - 1.0], 2);
    pods([sw + 1.0, .8, l1 + 3.6, lv0 - 1.6], 2);
    cafeBar(c, floorRoom, [l1 + 4, lv0 - .4, W - .2, lv1 + .6], 'left', 4, 1);
    windowLounge(c, floorRoom, [W / 2, front + 7.0], 'u', 2.0);
  } else if (type === 'executive') {
    // assistants' desks before the executive suite, a lounge on the front windows, the café by the core
    pods([1.2, front + 1.0, W - 11.0, front + 6.2], 2);
    windowLounge(c, floorRoom, [7.0, D - 4.0], 'u', 3.2);
    windowLounge(c, floorRoom, [sw + 5.2, 3.8], 'u', 3.2);
    cafeBar(c, floorRoom, [l1 + 4, lv0 - .4, W - .2, lv1 + .6], 'left', 4, 0);
    c.piece(floorRoom, { kind: 'reception_desk', at: [(l0 + l1) / 2, front + 1.6], size: [3.6, 1.0, 1.1], facing: 'back' });
  } else {
    // co-working: a big café bar as the heart, communal tables, soft booths on the windows
    cafeBar(c, floorRoom, [l0, 0, l1, lv0], 'front', 9, 3);
    for (const [i, u] of [[0, W * .25], [1, W * .5], [2, W * .75]] as const) {
      dining(c, floorRoom, [u - 1.8, front + 1.4 + (i % 2) * .4, u + 1.8, front + 4.6 + (i % 2) * .4], 'u', 8);
    }
    pods([1.2, D - 7.0, W - 6.0, D - 1.0], 3);
    windowLounge(c, floorRoom, [W - 3.0, D - 4.4], 'v', 2.4);
    for (let i = 0; i < 4; i++) c.piece(floorRoom, { kind: 'wardrobe', at: [l1 + 4.7 + i * .9, lv0 - .3], size: [.85, .6, 2.0], facing: 'front' });
  }
  plant(c, floorRoom, [.6, D - .6], true); plant(c, floorRoom, [W - .6, D - .6], true);
  plant(c, floorRoom, [sw + .5, core.stair[3] + .6]);
  art(c, floorRoom, [(l0 + l1) / 2, lv1 + .05], 'back', 2.0);
  // the co-working café stands against the back of the lift core, so its cars open forward only
  return { rooms: c.rooms, rearLanding: type !== 'cowork' };
}
