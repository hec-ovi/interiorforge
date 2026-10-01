import type { StyleId } from '../../core/types.js';
import type { PlanRoom } from '../plan-types.js';
import type { UvRect } from '../uv.js';
import type { Composer, PlanRect, Side } from './composer.js';
import { COMPOSED_CORE } from './core.js';
import { art, bathroom, bedroom, dining, kitchen, lounge, mechanical, opposite, plant, reading, screen, storage, study } from './kits.js';

/** Kind A, the high-tech tower, composed floor by floor in plan terms (u from the user's left
 *  wall, v from the back wall; see composer.ts). The ground floor is the user's plan; the
 *  typical floors are loft apartments in three arrangements; the crown is two penthouses. */

export interface CoreBox {
  /** stair, lift core (columns and shafts) in plan terms */
  stair: PlanRect;
  lifts: PlanRect;
  /** the landing niches between the columns at the core's front and back faces, plan terms */
  frontNiches: PlanRect[];
  backNiches: PlanRect[];
  /** every core rectangle in the frame, cut out of the floor's open rooms; `cutClosed` adds the
   *  back niches, sealed on a floor whose cars open forward only */
  cut: UvRect[];
  cutClosed: UvRect[];
}

export function coreBox(c: Composer, cut: UvRect[]): CoreBox {
  const S = COMPOSED_CORE.stair, L = COMPOSED_CORE.lifts;
  const span = 2 * L.column + L.widths[0] + L.widths[1];
  const start = Math.round((c.W / 2 - .05 - span / 2) * 1000) / 1000;
  const n = (L.depth - L.shaft) / 2, s0 = start + L.column, s1 = start + span - L.column;
  const frontNiches: PlanRect[] = [[s0, L.back + L.depth - n, s1, L.back + L.depth]];
  const backNiches: PlanRect[] = [[s0, L.back, s1, L.back + n]];
  return { stair: [0, S.back, S.width, S.back + S.depth], lifts: [start, L.back, start + span, L.back + L.depth],
    frontNiches, backNiches, cut, cutClosed: [...cut, ...backNiches.map(r => c.rect(r))] };
}

/** The look a composed home floor wears: its furniture family and the styles of its private
 *  and public rooms. Kind A by default; kinds B and C dress the same plans their own way. */
export interface HomeLook { look: 'a' | 'b' | 'c' | 'r'; home: StyleId; bath: StyleId; common: StyleId }
export const LOOK_A: HomeLook = { look: 'a', home: 'e1', bath: 'e1', common: 'e1' };
export const LOOK_R: HomeLook = { look: 'r', home: 'r1', bath: 'r1', common: 'r1' };
let L: HomeLook = LOOK_A;
/** Sets the look the next composition wears (one floor is composed at a time). */
export function wearing(look: HomeLook): void { L = look; }

export interface Composed {
  rooms: PlanRoom[];
  /** the lifts' back doors open on this floor */
  rearLanding: boolean;
}

// ---------------------------------------------------------------------------------- ground

/** The user's ground plan (INTERIOR-CONCEPT.md): an open lobby hall with the café bar in the
 *  back-right corner and a loft office below it, the closed back row (mechanical, storage,
 *  toilets) with the glass meeting room between them, two glass lounges flush with the side
 *  walls and the facade, and the front desk facing the entrance. */
export function groundA(c: Composer, core: CoreBox, plate: readonly [number, number][], entrance = 13): Composed {
  const { W, D } = c;
  const s = (W - 8) / 26;
  const [, , liftR] = core.lifts;
  const xm = 8 * s, xs = xm + 6 * s, xg = xs + 6 * s, xt = W - 8;
  // the user's plan on its own plate: the entrance at u 11.5-14.5, the small lounge left of it and
  // the big one right of it; on another plate the lounges keep a clear arrival either side of the
  // entrance, and one that would close it is left out
  const smallR = Math.min(6, entrance - 4.5), bigL = Math.max(W - 14, entrance + 5.5);
  const mech = c.room('mechanical', 'mechanical_room', [[0, 0, xm, core.stair[1]]], { style: 'e2' });
  const stores = c.room('stores', 'storage', [[xm, 0, xs, 4.3]], { style: 'e2' });
  const meeting = c.room('meeting', 'meeting', [[xs, 0, xg, 4.5]], { style: 'e1' });
  const toilets = c.room('toilets', 'toilets', [[xg, 0, xt, 4.5]], { style: 'e1', authored: false });
  const small = smallR >= 4 ? c.room('small-lounge', 'lounge', [[0, D - 12, smallR, D]], { style: 'e1' }) : null;
  const big = W - bigL >= 6 ? c.room('large-lounge', 'lounge', [[bigL, D - 12, W, D]], { style: 'e1' }) : null;
  const hall = c.remainder('lobby', 'elevator_lobby', plate, core.cut, { style: 'e1' });

  c.door(mech, hall, [(core.stair[2] + xm) / 2, core.stair[1]], 1.2);
  c.door(stores, hall, [(xm + xs) / 2, 4.3], 1.2);
  c.door(meeting, hall, [(xs + xg) / 2, 4.5], 1.6);
  c.door(toilets, hall, [xg + 1.2, 4.5], 1.0);
  if (small) c.door(small, hall, [smallR, D - 6], 2.4);
  if (big) c.door(big, hall, [bigL, D - 6], 2.4);

  // café bar, back-right corner: the kitchen wall on the back wall, the bar counter in front of
  // it with a staff aisle, a row of eight stools, café tables toward the open hall
  const cu0 = xt, cu1 = W, cmid = (cu0 + cu1) / 2;
  c.piece(hall, { kind: 'kitchen_block', at: [cmid, .36], size: [7.2, .7, 1.05], facing: 'front', fit: 'asm-e1-kitchen' });
  c.piece(hall, { kind: 'bar_counter', at: [cmid, 3.25], size: [6.2, .94, 1.1], facing: 'front', fit: 'fit-open-cafe-bar' });
  for (let i = 0; i < 8; i++) c.piece(hall, { kind: 'stool', at: [cmid - 2.73 + i * .78, 4.35], size: [.48, .48, .82], facing: 'back', fit: 'fit-open-bar-stool' });
  for (const du of [-2.1, 2.1]) {
    c.piece(hall, { kind: 'dining_table', at: [cmid + du, 6.9], size: [.9, .9, .75], facing: 'front' });
    c.piece(hall, { kind: 'chair', at: [cmid + du - .75, 6.9], size: [.5, .5, .9], facing: 'left' });
    c.piece(hall, { kind: 'chair', at: [cmid + du + .75, 6.9], size: [.5, .5, .9], facing: 'right' });
  }
  plant(c, hall, [W - .5, 7.9]);
  // loft office against the right wall below the café
  for (const v of [10.0, 12.9]) {
    c.piece(hall, { kind: 'desk', at: [W - .43, v], size: [2.2, .85, .78], facing: 'left', fit: 'fit-open-loft-desk' });
    c.piece(hall, { kind: 'office_chair', at: [W - 1.35, v], size: [.65, .65, 1.1], facing: 'right' });
  }
  c.piece(hall, { kind: 'shelf', at: [W - .25, 14.2], size: [1.0, .45, 2.0], facing: 'left' });

  // the front desk facing the entrance, staff chairs behind it
  const dv = D - 12.6;
  const deskU = Math.max(3.6, Math.min(W - 3.6, entrance - 2.15));
  c.piece(hall, { kind: 'reception_desk', at: [deskU, dv], size: [6.1, 2.0, 1.12], facing: 'front', fit: 'fit-open-concierge' });
  for (const du of [-1.6, 1.6]) c.piece(hall, { kind: 'office_chair', at: [deskU + du, dv - 1.5], size: [.65, .65, 1.1], facing: 'front' });
  // bamboo enclosures either side of the arrival (E2), benches along the lounge glass
  c.piece(hall, { kind: 'plant', at: [entrance - 5.0, D - 3.2], size: [2.7, 1.1, 3.0], facing: 'right', fit: 'asm-e1-bamboo' });
  c.piece(hall, { kind: 'plant', at: [entrance + 5.0, D - 3.2], size: [2.7, 1.1, 3.0], facing: 'left', fit: 'asm-e1-bamboo' });
  plant(c, hall, [entrance - 5.6, D - .8], true);
  plant(c, hall, [entrance + 5.6, D - .8], true);
  // pictures on the lift core's columns, either side of the landing
  art(c, hall, [core.lifts[0] + .9, core.lifts[3] + .05], 'back', 1.2);
  art(c, hall, [core.lifts[2] - .9, core.lifts[3] + .05], 'back', 1.2);
  if (small) c.piece(hall, { kind: 'bench', at: [smallR + .35, D - 9.5], size: [1.8, .45, .45], facing: 'right' });
  if (big) c.piece(hall, { kind: 'bench', at: [bigL - .35, D - 9.5], size: [1.8, .45, .45], facing: 'left' });
  // a seating bay between the stair and the lift core, art on the stair wall
  lounge(c, hall, [4.6, 6.2, liftR - 11.2 + 11.1, 12.4], 'left', 'a', { media: false });
  art(c, hall, [core.stair[2] + .05, 9.6], 'left', 2.2);
  // a waiting group right of the lift core
  lounge(c, hall, [core.lifts[2] + .5, 14.9, W - 3.4, 19.6], 'front', 'a', { media: false });
  plant(c, hall, [core.lifts[2] + .5, 9.0]);
  plant(c, hall, [core.lifts[0] - .5, 14.0]);

  // glass lounges
  if (small) {
    conversation(c, small, [smallR / 2, D - 6], 'v', 2.4);
    plant(c, small, [.55, D - .6], true);
    plant(c, small, [smallR - .6, D - 11.4]);
  }
  if (big) {
    const bm = (bigL + W) / 2;
    conversation(c, big, [bm, D - 4.0], 'u', Math.min(3.4, W - bigL - 4));
    conversation(c, big, [bm, D - 9.4], 'u', Math.min(2.6, W - bigL - 4));
    plant(c, big, [W - .6, D - .6], true);
    plant(c, big, [bigL + .6, D - .6], true);
    c.piece(big, { kind: 'shelf', at: [W - .3, D - 6.7], size: [1.6, .45, 2.0], facing: 'left' });
  }

  // meeting room: a table on the long axis, six chairs, the screen on the solid end wall
  const mmid = (xs + xg) / 2;
  c.piece(meeting, { kind: 'meeting_table', at: [mmid, 2.1], size: [3.0, 1.2, .75], facing: 'back' });
  for (const du of [-1, 0, 1]) {
    c.piece(meeting, { kind: 'chair', at: [mmid + du, 1.15], size: [.5, .5, .9], facing: 'front' });
    c.piece(meeting, { kind: 'chair', at: [mmid + du, 3.05], size: [.5, .5, .9], facing: 'back' });
  }
  c.piece(meeting, { kind: 'display_screen', at: [xs + .06, 2.1], size: [1.6, .08, .9], facing: 'right', elevation: 1.2 });

  // the plant room and the stores, fitted round their walls
  mechanical(c, mech, [0, 0, xm, core.stair[1]], 'back');
  storage(c, stores, [xm, 0, xs, 4.3], 'back');
  void toilets;
  return { rooms: c.rooms, rearLanding: true };
}

/** Two sofas facing each other across a low table, chairs at the ends. `along` is the
 *  direction the sofas run. */
export function conversation(c: Composer, room: PlanRoom, at: readonly [number, number], along: 'u' | 'v', len: number): void {
  const [u, v] = at, gap = 1.35;
  const sofa = L.look === 'a' ? { fit: 'asm-e1-lounge' } : L.look === 'b' || L.look === 'r' ? { fit: 'fit-sofa-corpo' } : {};
  const chair = L.look === 'a' || L.look === 'b' ? { fit: 'fit-chair-luxury' } : L.look === 'r' ? { fit: 'fit-chair-corpo' } : {};
  if (along === 'u') {
    c.piece(room, { kind: 'sofa', at: [u, v - gap], size: [len, .95, .8], facing: 'front', ...sofa });
    c.piece(room, { kind: 'sofa', at: [u, v + gap], size: [len, .95, .8], facing: 'back', ...sofa });
    c.piece(room, { kind: 'low_table', at: [u, v], size: [Math.min(1.6, len - .8), .8, .4], facing: 'back' });
    if (len >= 3) for (const s of [-1, 1]) c.piece(room, { kind: 'chair', at: [u + s * (len / 2 + .55), v], size: [.8, .8, .8], facing: s < 0 ? 'right' : 'left', ...chair });
  } else {
    c.piece(room, { kind: 'sofa', at: [u - gap, v], size: [len, .95, .8], facing: 'right', ...sofa });
    c.piece(room, { kind: 'sofa', at: [u + gap, v], size: [len, .95, .8], facing: 'left', ...sofa });
    c.piece(room, { kind: 'low_table', at: [u, v], size: [Math.min(1.6, len - .8), .8, .4], facing: 'left' });
    if (len >= 3) for (const s of [-1, 1]) c.piece(room, { kind: 'chair', at: [u, v + s * (len / 2 + .55)], size: [.8, .8, .8], facing: s < 0 ? 'front' : 'back', ...chair });
  }
}

// ------------------------------------------------------------------------- typical floors

/** Depth of a home floor's gallery in front of the lift core: a hall wide enough for a seat by
 *  the wall, not a corridor. */
const GALLERY = 5.6;

/** One loft apartment: its open loft room, its bathroom, and the furnishing plan. */
interface Loft {
  id: string;
  /** loft footprint (plan rects) and the bathroom rect */
  rects: PlanRect[];
  baths: { rect: PlanRect; door: readonly [number, number]; vanity: Side }[];
  /** the entrance from the gallery: plan point on the shared wall */
  entrance: readonly [number, number];
  furnish: (c: Composer, room: PlanRoom) => void;
}

/** Makes the lofts' rooms, their bathrooms and doors, and the gallery in front of the core. */
function lofts(c: Composer, core: CoreBox, list: Loft[], galleryEnd = core.lifts[2]): PlanRoom {
  const [, , l1, lv1] = core.lifts;
  const g1 = lv1 + GALLERY;
  const made = list.map((loft, i) => {
    const unit = `f${c.floorIndex}-home-${i + 1}`;
    const baths = loft.baths.map((b, j) => ({ spec: b, room: c.room(`bath-${i + 1}${'abc'[j]}`, 'bathroom', [b.rect], { style: L.bath, unit }) }));
    const room = c.room(loft.id, 'studio_main', loft.rects, { style: L.home, unit, cut: loft.baths.map(b => c.rect(b.rect)) });
    return { loft, baths, room };
  });
  const gallery = c.room('gallery', 'elevator_lobby', [[0, core.stair[3], core.stair[2], g1], [core.stair[2], lv1, galleryEnd, g1], ...core.frontNiches], { style: L.common });
  for (const { loft, baths, room } of made) {
    for (const b of baths) {
      c.door(b.room, room, b.spec.door, .9);
      bathroom(c, b.room, b.spec.rect, b.spec.vanity, L.look);
    }
    c.door(room, gallery, loft.entrance, 1.6);
    loft.furnish(c, room);
    // the arrival: a bench under a picture on the entrance wall beside the door, a plant
    const wall = entryWall(loft);
    const along = wall === 'back' || wall === 'front';
    for (const side of [1, -1]) {
      const [eu, ev] = loft.entrance;
      const a = (along ? eu : ev) + side * 2.0, d = .3;
      const at: [number, number] = along ? [a, wall === 'back' ? ev + d : ev - d] : [wall === 'left' ? eu + d : eu - d, a];
      const before = room.authored!.length;
      c.piece(room, { kind: 'bench', at, size: [1.4, .45, .45], facing: opposite(wall) });
      art(c, room, along ? [a, wall === 'back' ? ev + .05 : ev - .05] : [wall === 'left' ? eu + .05 : eu - .05, a], wall, 1.2);
      if (room.authored!.length > before) break;
    }
  }
  plant(c, gallery, [core.stair[2] + .6, lv1 + .6], true);
  plant(c, gallery, [l1 - .6, g1 - .6], true);
  c.piece(gallery, { kind: 'bench', at: [(core.lifts[0] + l1) / 2, g1 - .35], size: [2.4, .5, .45], facing: 'back' });
  art(c, gallery, [core.stair[2] / 2, g1 - .05], 'front', 1.6);
  // pictures between the doors on the gallery's front wall
  const fronts = made.map(m => m.loft).filter(l => Math.abs(l.entrance[1] - g1) < .01).map(l => l.entrance[0]).sort((x, y) => x - y);
  const stops = [core.stair[2] / 2, ...fronts, galleryEnd - 1];
  let seat = -1, widest = 0;
  for (let i = 0; i + 1 < stops.length; i++) {
    const gap = stops[i + 1]! - stops[i]!;
    if (gap >= 5) art(c, gallery, [(stops[i]! + stops[i + 1]!) / 2, g1 - .05], 'front', 1.4);
    if (gap > widest) { widest = gap; seat = (stops[i]! + stops[i + 1]!) / 2; }
  }
  // two chairs and a table under the picture in the widest stretch of the front wall, so the
  // gallery reads as a hall
  if (widest >= 5.2) reading(c, gallery, [seat - 1.7, g1 - 2.4, seat + 1.7, g1], 'front', L.look);
  // the floor's bamboo enclosure between the stair and the lifts (E2), pictures on the columns
  // (between the back loft's doorway, mid-alcove, and the first lift's landing; a long gallery's
  // islands stand in its place)
  const doorEdge = (core.stair[2] + core.lifts[0]) / 2 + .7, liftKeep = core.lifts[0] + COMPOSED_CORE.lifts.column - .3;
  if (L.look === 'a' && liftKeep - doorEdge >= 2.9 && galleryEnd <= 24) c.piece(gallery, { kind: 'plant', at: [(doorEdge + liftKeep) / 2, lv1 + .7], size: [2.7, 1.1, 3.0], facing: 'front', fit: 'asm-e1-bamboo' });
  art(c, gallery, [core.lifts[0] + .9, lv1 + .05], 'back', 1.2);
  art(c, gallery, [l1 - .9, lv1 + .05], 'back', 1.2);
  // A gallery longer than a plate's usual one (a wide plate's) is broken by planter islands on
  // its middle line, benches either side, never in front of the lifts, so no straight run along
  // it is over 20 m; its far end is a seat by the window.
  if (galleryEnd > 24) {
    const column = COMPOSED_CORE.lifts.column, mv = (lv1 + g1) / 2;
    const keepFrom = core.lifts[0] + column - .3, keepTo = l1 - column + .3;
    for (const u of galleryIslands(galleryEnd, keepFrom, keepTo)) {
      c.together(() => {
        screen(c, gallery, [u, mv], 'u', L.look);
        for (const side of [-1, 1]) c.piece(gallery, { kind: 'bench', at: [u, mv + side * .9], size: [1.6, .45, .45], facing: side < 0 ? 'back' : 'front' });
      });
    }
    reading(c, gallery, [galleryEnd - 2.6, lv1 + .3, galleryEnd, g1 - .3], 'right', L.look);
  }
  return gallery;
}

/** Half the length of a gallery island, and the longest straight run a gallery keeps. */
export const ISLAND_HALF = 1.35, GALLERY_RUN = 20;

/** Centres of the planter islands along a gallery from u 0 to `end`: each closes a run of at
 *  most GALLERY_RUN, none stands in front of the lift landings (`keepFrom` to `keepTo`), and a
 *  lift front longer than a run takes its island right after it. */
export function galleryIslands(end: number, keepFrom: number, keepTo: number): number[] {
  const islands: number[] = [];
  let from = 0;
  while (end - from > GALLERY_RUN + .5) {
    let u = from + GALLERY_RUN - ISLAND_HALF;
    if (u + ISLAND_HALF > keepFrom - .1 && u - ISLAND_HALF < keepTo + .1) u = keepFrom - .1 - ISLAND_HALF;
    if (u - ISLAND_HALF <= from + 2) u = keepTo + .1 + ISLAND_HALF;
    if (u + ISLAND_HALF > end - 1) break;
    islands.push(u);
    from = u + ISLAND_HALF;
  }
  return islands;
}

/** The side of its room the loft's entrance wall is: the gallery lies across it. */
function entryWall(loft: Loft): Side {
  const [eu, ev] = loft.entrance;
  for (const [u0, v0, u1, v1] of loft.rects) {
    if (Math.abs(ev - v0) < .01 && eu > u0 && eu < u1) return 'back';
    if (Math.abs(ev - v1) < .01 && eu > u0 && eu < u1) return 'front';
    if (Math.abs(eu - u0) < .01 && ev > v0 && ev < v1) return 'left';
    if (Math.abs(eu - u1) < .01 && ev > v0 && ev < v1) return 'right';
  }
  return 'back';
}

/** A front-band loft from u0 to u1 between the gallery line and the facade: its bath in one
 *  corner on the gallery side, a wardrobe wall on the gallery wall, the kitchen wall on the
 *  party wall with its island, dining in the middle, the lounge on the facade, the bed's head
 *  on the party wall below the kitchen. `party` is the side of its party wall. */
function frontLoft(core: CoreBox, D: number, id: string, u0: number, u1: number, asked: 'low' | 'high', party: 'left' | 'right', galleryEnd = core.lifts[2]): Loft {
  const g1 = core.lifts[3] + GALLERY, bw = 4.6, bd = 4.4;
  // the bathroom keeps the end that leaves the loft a doorway onto the gallery
  const meets = (at: 'low' | 'high') => Math.min(galleryEnd, at === 'high' ? u1 - bw : u1) - (at === 'low' ? u0 + bw : u0) >= 1.8;
  const bathAt: 'low' | 'high' = meets(asked) ? asked : asked === 'low' ? 'high' : 'low';
  const bath: PlanRect = bathAt === 'low' ? [u0, g1, u0 + bw, g1 + bd] : [u1 - bw, g1, u1, g1 + bd];
  // the entrance: the middle of the part of the gallery's front edge this loft meets beside its bath
  const lo = bathAt === 'low' ? u0 + bw : u0, hi = Math.min(galleryEnd, bathAt === 'high' ? u1 - bw : u1);
  const entrance: [number, number] = [Math.round((lo + hi) / 2 * 10) / 10, g1];
  const width = u1 - u0;
  const pu = party === 'left' ? u0 : u1, away = party === 'left' ? 1 : -1;
  return {
    id, rects: [[u0, g1, u1, D]], entrance,
    baths: [{ rect: bath, door: [bathAt === 'low' ? u0 + bw : u1 - bw, g1 + bd / 2], vanity: bathAt === 'low' ? 'left' : 'right' }],
    furnish: (k, r) => {
      // the kitchen wall on the party wall, clear of the bath when the bath sits on that side
      const bathOnParty = (bathAt === 'low') === (party === 'left');
      const kv0 = bathOnParty ? g1 + bd + .3 : g1 + 1.4;
      const kz: PlanRect = party === 'left' ? [u0, kv0, u0 + 5.4, kv0 + 7.0] : [u1 - 5.4, kv0, u1, kv0 + 7.0];
      // kind B's kitchen and bar stand on a platform one step up (its B3 apartment's raised bar)
      if (L.look === 'b') k.level(r, kz, .15);
      kitchen(k, r, kz, party, L.look, { island: width >= 13 });
      // the bed's head on the party wall below the kitchen, the lounge on the facade beside it
      const bz: PlanRect = party === 'left' ? [u0, kv0 + 7.2, u0 + 6.6, D - .1] : [u1 - 6.6, kv0 + 7.2, u1, D - .1];
      bedroom(k, r, bz, party, L.look, { wardrobe: false });
      const lz: PlanRect = party === 'left' ? [u0 + 7.0, D - 6.4, u1 - .2, D - .1] : [u0 + .2, D - 6.4, u1 - 7.0, D - .1];
      lounge(k, r, lz, 'front', L.look, { media: false, ledge: true });
      // a wardrobe wall on the gallery wall, on the side of the entrance away from the bath
      const wlo = bathAt === 'low' ? entrance[0] + 1.4 : u0 + .1, whi = bathAt === 'low' ? hi - .1 : entrance[0] - 1.4;
      if (whi - wlo >= 1.6) k.piece(r, { kind: 'wardrobe', at: [(wlo + whi) / 2, g1 + .32], size: [Math.min(3.6, whi - wlo), .6, 2.4], facing: 'front', ...(L.look === 'a' ? { fit: 'asm-e1-wardrobe' } : {}) });
      if (width >= 13) {
        const du = pu + away * 8.6;
        dining(k, r, [du - 1.6, kv0 + 1.0, du + 1.6, kv0 + 5.0], 'v', 6);
      }
      // the sleeping corner stands behind a screen from the lounge on the facade
      screen(k, r, [party === 'left' ? u0 + 6.9 : u1 - 6.9, kv0 + 7.2 + 1.6], 'v', L.look);
      plant(k, r, [party === 'left' ? u1 - .6 : u0 + .6, g1 + (bathOnParty ? .7 : bd + .7)], true);
      // a study on the outer facade between the arrival and the lounge, looking out
      const outer: Side = party === 'left' ? 'right' : 'left';
      const sv0 = bathOnParty ? g1 + 1.6 : g1 + bd + .4, sv1 = Math.min(D - 7.0, sv0 + 5.2);
      if (sv1 - sv0 >= 3.6) study(k, r, outer === 'left' ? [u0, sv0, u0 + 3.0, sv1] : [u1 - 3.0, sv0, u1, sv1], outer, L.look);
      // two chairs at the window between the study and the lounge
      const rv0 = Math.max(sv0, sv1) + .3, rv1 = D - 6.7;
      if (rv1 - rv0 >= 3.0) reading(k, r, outer === 'left' ? [u0, rv0, u0 + 2.6, rv1] : [u1 - 2.6, rv0, u1, rv1], outer, L.look);
    },
  };
}

/** A typical floor: the gallery in front of the stair and the lift core, loft apartments
 *  opening directly off it, each one open loft room around its closed bathroom. Three
 *  arrangements turn with the floor index: four lofts split evenly, four split off-centre and
 *  mirrored, three lofts with one wide back loft wrapping the core. */
export function typicalA(c: Composer, core: CoreBox, variant: number, flip = false, loft = false): Composed {
  // half the buildings stand their front lofts' bathrooms at the other end of their front
  const end = (at: 'low' | 'high'): 'low' | 'high' => flip ? (at === 'low' ? 'high' : 'low') : at;
  const { W, D } = c;
  const [l0, lv0, l1, lv1] = core.lifts;
  const sw = core.stair[2], g1 = lv1 + GALLERY, mid = Math.round(W / 2 * 2) / 2;
  const list: Loft[] = [];
  const behindStair = { rect: [0, 0, sw, core.stair[1]] as PlanRect, door: [sw, core.stair[1] / 2] as const, vanity: 'back' as Side };
  if (W >= 38) {
    // a wide plate: the gallery runs the whole width in front of the core, the back band is two
    // lofts (or one wrapping the core) entered from it, and the front band takes three
    if (variant === 2) list.push({
      id: 'loft-1', rects: [[sw, 0, W, lv0], [sw, lv0, l0, lv1], [l1, lv0, W, lv1]], entrance: [(sw + l0) / 2, lv1],
      baths: [behindStair, { rect: [W - 4.6, lv0, W, lv1], door: [W - 4.6, (lv0 + lv1) / 2], vanity: 'right' }],
      furnish: (k, r) => {
        kitchen(k, r, [l0 - .6, 0, l1 + .6, lv0], 'front', L.look);
        dining(k, r, [sw + .4, .6, l0 - 1.0, lv0 - .6], 'u', 8);
        lounge(k, r, [l1 + 1.0, 0, W - .2, lv0 - .2], 'back', L.look, { media: false, ledge: true });
        bedroom(k, r, [l1 + .2, lv0, W - 4.8, lv1], 'left', L.look, { wardrobe: false });
        study(k, r, [sw + .2, lv0 + .2, l0 - .3, lv1 - .3], 'left', L.look);
      },
    });
    else {
      list.push({
        id: 'loft-1', rects: [[sw, 0, mid, lv0], [sw, lv0, l0, lv1]], entrance: [(sw + l0) / 2, lv1], baths: [behindStair],
        furnish: (k, r) => {
          kitchen(k, r, [mid - 5.6, 0, mid, lv0], 'right', L.look, { island: true });
          lounge(k, r, [sw + .2, 0, mid - 5.8, lv0 - .1], 'back', L.look, { media: false, ledge: true });
          bedroom(k, r, [sw + .1, lv0, l0 - .1, lv1], 'left', L.look, { wardrobe: false });
        },
      });
      list.push({
        id: 'loft-2', rects: [[mid, 0, W, lv0], [l1, lv0, W, lv1]], entrance: [(l1 + W) / 2 + 1.5, lv1],
        baths: [{ rect: [W - 4.6, lv0, W, lv1], door: [W - 4.6, (lv0 + lv1) / 2], vanity: 'right' }],
        furnish: (k, r) => {
          kitchen(k, r, [mid, 0, mid + 6.4, lv0], 'left', L.look, { island: true });
          lounge(k, r, [mid + 6.8, 0, W - .2, lv0 - .1], 'back', L.look, { media: false, ledge: true });
          bedroom(k, r, [l1 + .1, lv0, W - 4.8, lv1], 'left', L.look, { wardrobe: false });
        },
      });
    }
    if (loft) {
      // a floor of the two-storey loft: two front lofts wide enough for its stair and lounge
      list.push(frontLoft(core, D, `loft-${list.length + 1}`, 0, mid, end('high'), 'right', W));
      list.push(frontLoft(core, D, `loft-${list.length + 1}`, mid, W, end('high'), 'left', W));
    } else {
      const a = Math.round(W * (variant === 1 ? .3 : 1 / 3) * 2) / 2, b = Math.round(W * (variant === 1 ? .65 : 2 / 3) * 2) / 2;
      list.push(frontLoft(core, D, `loft-${list.length + 1}`, 0, a, end('high'), 'right', W));
      list.push(frontLoft(core, D, `loft-${list.length + 1}`, a, b, end(variant === 1 ? 'low' : 'high'), 'left', W));
      list.push(frontLoft(core, D, `loft-${list.length + 1}`, b, W, end('high'), 'left', W));
    }
    lofts(c, core, list, W);
    return { rooms: c.rooms, rearLanding: false };
  }
  if (variant === 2) {
    list.push({
      id: 'loft-1', rects: [[sw, 0, W, lv0], [sw, lv0, l0, lv1], [l1, lv0, W, g1]], entrance: [(sw + l0) / 2, lv1],
      baths: [behindStair, { rect: [W - 4.6, g1 - 4.4, W, g1], door: [W - 4.6, g1 - 2.2], vanity: 'right' }],
      furnish: (k, r) => {
        // the kitchen wall on the back of the lift core, dining beside it, the lounge on the
        // back facade, the bed's head on the core's side, a study in the alcove by the stair
        kitchen(k, r, [l0 - .6, 0, l1 + .6, lv0], 'front', L.look);
        dining(k, r, [sw + .4, .6, l0 - 1.0, lv0 - .6], 'u', 6);
        lounge(k, r, [l1 + 1.0, 0, W - .2, lv0 - .2], 'back', L.look, { media: false, ledge: true });
        bedroom(k, r, [l1, lv0 + .2, W - 4.8, g1 - .2], 'left', L.look, { wardrobe: false });
        screen(k, r, [(l1 + W - 4.8) / 2, lv0 + .65], 'u', L.look);
        study(k, r, [sw + .2, lv0 + .2, l0 - .3, lv1 - .3], 'left', L.look);
      },
    });
    list.push(frontLoft(core, D, 'loft-2', 0, mid + 2.5, end('high'), 'right'));
    list.push(frontLoft(core, D, 'loft-3', mid + 2.5, W, end('high'), 'left'));
  } else {
    if (variant === 0 && l0 - sw >= 6.6) list.push({
      // the user's drawing of the floor: the built-in kitchen along the back wall, behind the
      // stair as well; the big bathroom beside the stair, entered from the loft; the entrance
      // down a short hall beside the bathroom; the bed against the stair wall, dining between
      // them, the lounge on the back facade by the party wall
      id: 'loft-1', rects: [[0, 0, mid, core.stair[1]], [sw, core.stair[1], mid, lv0], [sw + 4.6, lv0, l0, lv1]],
      entrance: [(sw + 4.6 + l0) / 2, lv1],
      baths: [{ rect: [sw, lv0, sw + 4.6, lv1], door: [sw + 3.8, lv0], vanity: 'left' }],
      furnish: (k, r) => {
        const ke = Math.min(mid - 5.4, 11.6);
        kitchen(k, r, [0, 0, ke, 5.0], 'back', L.look, { island: true, tall: 'low' });
        lounge(k, r, [ke + .2, 0, mid - .2, lv0 - .2], 'back', L.look, { media: false, ledge: true });
        bedroom(k, r, [sw + .1, core.stair[1], ke - .2, lv0 - .1], 'left', L.look, { wardrobe: false });
        dining(k, r, [sw + 2.9, core.stair[1] + .2, ke - .2, lv0 - .2], 'u', 4);
      },
    });
    else list.push({
      id: 'loft-1', rects: [[sw, 0, mid, lv0], [sw, lv0, l0, lv1]], entrance: [(sw + l0) / 2, lv1], baths: [behindStair],
      furnish: (k, r) => {
        // kitchen on the party wall with loft 2, the lounge facing the back facade, the bed in
        // the alcove beside the stair
        kitchen(k, r, [mid - 5.6, 0, mid, lv0], 'right', L.look, { island: variant === 0 });
        lounge(k, r, [sw + .2, 0, mid - 5.8, lv0 - .1], 'back', L.look, { media: false, ledge: true });
        bedroom(k, r, [sw + .1, lv0, l0 - .1, lv1], 'left', L.look, { wardrobe: false });
      },
    });
    list.push({
      id: 'loft-2', rects: [[mid, 0, W, lv0], [l1, lv0, W, g1]], entrance: [l1, (lv1 + g1) / 2],
      baths: [{ rect: [W - 4.6, g1 - 4.4, W, g1], door: [W - 4.6, g1 - 2.2], vanity: 'right' }],
      furnish: (k, r) => {
        // the kitchen on the party wall in front, its island toward the core; dining by the
        // core; the lounge on the back facade; the bed's head on the party wall with loft 1
        kitchen(k, r, [l1 + .2, g1 - 5.0, W - 4.8, g1], 'front', L.look, { island: false });
        dining(k, r, [l1 + .6, lv0 + .4, W - .6, g1 - 5.4], 'u', variant === 0 ? 6 : 4);
        lounge(k, r, variant === 0 ? [mid + 6.4, 0, W - .2, lv0 - .2] : [mid + .2, 0, W - 6.4, lv0 - .2], 'back', L.look, { media: false });
        bedroom(k, r, variant === 0 ? [mid, .2, mid + 6.2, lv0 - .2] : [W - 6.2, .2, W, lv0 - .2], variant === 0 ? 'left' : 'right', L.look, { wardrobe: false });
        screen(k, r, [variant === 0 ? mid + 6.3 : W - 6.3, lv0 / 2], 'v', L.look);
      },
    });
    const split = variant === 1 ? 14.5 : mid;
    list.push(frontLoft(core, D, 'loft-3', 0, split, end(variant === 1 ? 'low' : 'high'), 'right'));
    list.push(frontLoft(core, D, 'loft-4', split, W, end('high'), 'left'));
  }
  lofts(c, core, list);
  return { rooms: c.rooms, rearLanding: false };
}

// ---------------------------------------------------------------------------------- crown

/** The crown: two penthouses around the core. The back penthouse wraps the back and the right
 *  side of the lift core (kitchen, long dining table, the lounge on the back facade, a master
 *  bedroom on the right, a study in the alcove beside the stair); the front penthouse takes the
 *  whole facade (island kitchen on the gallery wall, dining, two lounges, master bedroom). */
export function crownA(c: Composer, core: CoreBox): Composed {
  const { W, D } = c;
  const [l0, lv0, l1, lv1] = core.lifts;
  const sw = core.stair[2], g1 = lv1 + GALLERY;
  const back: Loft = {
    id: 'penthouse-1', rects: [[sw, 0, W, lv0], [sw, lv0, l0, lv1], [l1, lv0, W, g1]], entrance: [(sw + l0) / 2, lv1],
    baths: [{ rect: [0, 0, sw, core.stair[1]], door: [sw, core.stair[1] / 2], vanity: 'back' },
      { rect: [W - 4.6, g1 - 4.4, W, g1], door: [W - 4.6, g1 - 2.2], vanity: 'right' }],
    furnish: (k, r) => {
      kitchen(k, r, [l0 - .6, 0, l1 + .6, lv0], 'front', L.look);
      dining(k, r, [sw + .4, .6, l0 - 1.0, lv0 - .6], 'u', 8);
      lounge(k, r, [l1 + 1.0, 0, W - .2, lv0 - .2], 'back', L.look, { media: false, ledge: true });
      bedroom(k, r, [l1, lv0 + .2, W - 4.8, g1 - .2], 'left', L.look, { wardrobe: false });
      screen(k, r, [(l1 + W - 4.8) / 2, lv0 + .65], 'u', L.look);
      study(k, r, [sw + .2, lv0 + .2, l0 - .3, lv1 - .3], 'left', L.look);
    },
  };
  const front: Loft = {
    id: 'penthouse-2', rects: [[0, g1, W, D]], entrance: [Math.round((5 + l1) / 2 * 10) / 10 + 2, g1],
    baths: [{ rect: [0, g1, 4.6, g1 + 4.4], door: [4.6, g1 + 2.2], vanity: 'left' },
      { rect: [W - 4.6, g1, W, g1 + 4.4], door: [W - 4.6, g1 + 2.2], vanity: 'right' }],
    furnish: (k, r) => {
      kitchen(k, r, [4.8, g1, 12.4, g1 + 6.2], 'back', L.look);
      dining(k, r, [13.6, g1 + 1.2, W - 5.2, g1 + 5.4], 'u', 10);
      lounge(k, r, [.2, D - 6.6, 11.6, D - .1], 'front', L.look, { media: false, ledge: true });
      lounge(k, r, [12.2, D - 6.6, W - 9.2, D - .1], 'front', L.look, { media: false, ledge: true });
      // the great room's centre: a conversation sunk one step round a table (the E1 lounge
      // pit), a bamboo enclosure beside it
      if (L.look === 'a' || L.look === 'b') k.level(r, [W / 2 - 6.4, g1 + 6.2, W / 2 + 2.4, g1 + 11.8], -.18);
      conversation(k, r, [W / 2 - 2.0, g1 + 9.0], 'u', 3.6);
      if (L.look === 'a' || L.look === 'b') screen(k, r, [W / 2 + 3.6, g1 + 9.0], 'u', L.look);
      bedroom(k, r, [W - 8.8, g1 + 4.8, W, D - .1], 'right', L.look, { wardrobe: 'low' });
      screen(k, r, [W - 9.0, (g1 + 4.8 + D) / 2 + 1.0], 'v', L.look);
      bedroom(k, r, [0, g1 + 4.8, 5.6, D - 6.8], 'left', L.look, { wardrobe: false });
      screen(k, r, [5.9, (g1 + 4.8 + D - 6.8) / 2], 'v', L.look);
      // two chairs by the screen, between the second bedroom and the sunken lounge
      if (W / 2 - 6.4 - 6.6 >= 3.4) reading(k, r, [6.6, g1 + 6.4, W / 2 - 6.6, g1 + 9.4], 'back', L.look);
    },
  };
  lofts(c, core, [back, front]);
  return { rooms: c.rooms, rearLanding: false };
}
