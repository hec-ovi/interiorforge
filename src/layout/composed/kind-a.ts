import type { StyleId } from '../../core/types.js';
import type { PlanRoom } from '../plan-types.js';
import type { UvRect } from '../uv.js';
import type { Composer, PlanRect, Side } from './composer.js';
import { COMPOSED_CORE } from './core.js';
import { art, bathroom, bedroom, dining, kitchen, lounge, plant, study } from './kits.js';

/** Kind A, the high-tech tower, composed floor by floor in plan terms (u from the user's left
 *  wall, v from the back wall; see composer.ts). The ground floor is the user's plan; the
 *  typical floors are loft apartments in three arrangements; the crown is two penthouses. */

export interface CoreBox {
  /** stair, lift core (columns and shafts) in plan terms */
  stair: PlanRect;
  lifts: PlanRect;
  /** every core rectangle in the frame, cut out of the floor's open rooms */
  cut: UvRect[];
}

export function coreBox(c: Composer, cut: UvRect[]): CoreBox {
  const S = COMPOSED_CORE.stair, L = COMPOSED_CORE.lifts;
  const span = 2 * L.column + L.widths[0] + L.widths[1];
  const start = Math.round((c.W / 2 - .05 - span / 2) * 1000) / 1000;
  return { stair: [0, S.back, S.width, S.back + S.depth], lifts: [start, L.back, start + span, L.back + L.depth], cut };
}

/** The look a composed home floor wears: its furniture family and the styles of its private
 *  and public rooms. Kind A by default; kinds B and C dress the same plans their own way. */
export interface HomeLook { look: 'a' | 'b' | 'c' | 'r'; home: StyleId; bath: StyleId; common: StyleId }
export const LOOK_A: HomeLook = { look: 'a', home: 'e1', bath: 'e1', common: 'e2' };
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
export function groundA(c: Composer, core: CoreBox, plate: readonly [number, number][]): Composed {
  const { W, D } = c;
  const s = (W - 8) / 26;
  const [, , liftR] = core.lifts;
  const xm = 8 * s, xs = xm + 6 * s, xg = xs + 6 * s, xt = W - 8;
  const mech = c.room('mechanical', 'mechanical_room', [[0, 0, xm, core.stair[1]]], { style: 'e2' });
  const storage = c.room('stores', 'storage', [[xm, 0, xs, 4.3]], { style: 'e2' });
  const meeting = c.room('meeting', 'meeting', [[xs, 0, xg, 4.5]], { style: 'e1' });
  const toilets = c.room('toilets', 'toilets', [[xg, 0, xt, 4.5]], { style: 'e1', authored: false });
  const small = c.room('small-lounge', 'lounge', [[0, D - 12, 6, D]], { style: 'e1' });
  const big = c.room('large-lounge', 'lounge', [[W - 14, D - 12, W, D]], { style: 'e1' });
  const hall = c.remainder('lobby', 'elevator_lobby', plate, core.cut, { style: 'e1' });

  c.door(mech, hall, [(core.stair[2] + xm) / 2, core.stair[1]], 1.2);
  c.door(storage, hall, [(xm + xs) / 2, 4.3], 1.2);
  c.door(meeting, hall, [(xs + xg) / 2, 4.5], 1.6);
  c.door(toilets, hall, [xg + 1.2, 4.5], 1.0);
  c.door(small, hall, [6, D - 6], 2.4);
  c.door(big, hall, [W - 14, D - 6], 2.4);

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
  c.piece(hall, { kind: 'reception_desk', at: [10.85, dv], size: [6.1, 2.0, 1.12], facing: 'front', fit: 'fit-open-concierge' });
  for (const du of [-1.6, 1.6]) c.piece(hall, { kind: 'office_chair', at: [10.85 + du, dv - 1.5], size: [.65, .65, 1.1], facing: 'front' });
  // planting either side of the entrance axis, benches along the lounge glass
  plant(c, hall, [7.4, D - 1.2], true);
  plant(c, hall, [18.6, D - 1.2], true);
  c.piece(hall, { kind: 'bench', at: [6.35, D - 9.5], size: [1.8, .45, .45], facing: 'right' });
  c.piece(hall, { kind: 'bench', at: [W - 14.35, D - 9.5], size: [1.8, .45, .45], facing: 'left' });
  // a seating bay between the stair and the lift core, art on the stair wall
  lounge(c, hall, [4.6, 6.2, liftR - 11.2 + 11.1, 12.4], 'left', 'a', { media: false });
  art(c, hall, [core.stair[2] + .05, 9.6], 'left', 2.2);
  // a waiting group right of the lift core
  lounge(c, hall, [core.lifts[2] + .5, 14.9, W - 3.4, 19.6], 'front', 'a', { media: false });
  plant(c, hall, [core.lifts[2] + .5, 9.0]);
  plant(c, hall, [core.lifts[0] - .5, 14.0]);

  // glass lounges
  conversation(c, small, [3, D - 6], 'v', 2.4);
  plant(c, small, [.55, D - .6], true);
  plant(c, small, [5.4, D - 11.4]);
  conversation(c, big, [W - 7, D - 4.0], 'u', 3.4);
  conversation(c, big, [W - 7, D - 9.4], 'u', 2.6);
  plant(c, big, [W - .6, D - .6], true);
  plant(c, big, [W - 13.4, D - .6], true);
  c.piece(big, { kind: 'shelf', at: [W - .3, D - 6.7], size: [1.6, .45, 2.0], facing: 'left' });

  // meeting room: a table on the long axis, six chairs, the screen on the solid end wall
  const mmid = (xs + xg) / 2;
  c.piece(meeting, { kind: 'meeting_table', at: [mmid, 2.1], size: [3.0, 1.2, .75], facing: 'back' });
  for (const du of [-1, 0, 1]) {
    c.piece(meeting, { kind: 'chair', at: [mmid + du, 1.15], size: [.5, .5, .9], facing: 'front' });
    c.piece(meeting, { kind: 'chair', at: [mmid + du, 3.05], size: [.5, .5, .9], facing: 'back' });
  }
  c.piece(meeting, { kind: 'display_screen', at: [xs + .06, 2.1], size: [1.6, .08, .9], facing: 'right', elevation: 1.2 });

  // mechanical room: switchboard and air handling on the party wall, pump skid in the middle,
  // drive bank on the far wall, transit cases
  c.piece(mech, { kind: 'shelf', at: [xm - .27, 1.15], size: [1.8, .5, 2.2], facing: 'left', fit: 'fit-open-switchboard' });
  c.piece(mech, { kind: 'room_divider', at: [xm - .27, 3.3], size: [2.4, .5, 2.0], facing: 'left', fit: 'fit-industrial-ventilation-bank' });
  c.piece(mech, { kind: 'gym_machine', at: [3.4, 1.7], size: [2.8, 1.25, 2.25], facing: 'front', fit: 'fit-open-pump-skid' });
  c.piece(mech, { kind: 'crate', at: [.6, 3.9], size: [.62, .62, .55], facing: 'right', fit: 'fit-industrial-transit-case' });
  c.piece(mech, { kind: 'crate', at: [1.35, 3.9], size: [.62, .62, .55], facing: 'right', fit: 'fit-industrial-transit-case' });

  // storage: a long rack on the back wall, steel racks on the side wall, cases
  c.piece(storage, { kind: 'shelf', at: [(xm + xs) / 2, .47], size: [4.6, .9, 2.5], facing: 'front', fit: 'fit-open-store-rack' });
  c.piece(storage, { kind: 'shelf', at: [xs - .27, 2.4], size: [1.8, .5, 2.0], facing: 'left', fit: 'fit-industrial-storage-rack' });
  c.piece(storage, { kind: 'crate', at: [xm + .5, 2.2], size: [.62, .62, .55], facing: 'right', fit: 'fit-industrial-transit-case' });
  c.piece(storage, { kind: 'crate', at: [xm + .5, 2.9], size: [.62, .62, .55], facing: 'right', fit: 'fit-industrial-transit-case' });
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
function lofts(c: Composer, core: CoreBox, list: Loft[]): PlanRoom {
  const [, , l1, lv1] = core.lifts;
  const g1 = lv1 + 4.4;
  const made = list.map((loft, i) => {
    const unit = `f${c.floorIndex}-home-${i + 1}`;
    const baths = loft.baths.map((b, j) => ({ spec: b, room: c.room(`bath-${i + 1}${'abc'[j]}`, 'bathroom', [b.rect], { style: L.bath, unit }) }));
    const room = c.room(loft.id, 'studio_main', loft.rects, { style: L.home, unit, cut: loft.baths.map(b => c.rect(b.rect)) });
    return { loft, baths, room };
  });
  const gallery = c.room('gallery', 'elevator_lobby', [[0, core.stair[3], core.stair[2], g1], [core.stair[2], lv1, l1, g1]], { style: L.common });
  for (const { loft, baths, room } of made) {
    for (const b of baths) {
      c.door(b.room, room, b.spec.door, .9);
      bathroom(c, b.room, b.spec.rect, b.spec.vanity, L.look);
    }
    c.door(room, gallery, loft.entrance, 1.6);
    loft.furnish(c, room);
  }
  plant(c, gallery, [core.stair[2] + .6, lv1 + .6], true);
  plant(c, gallery, [l1 - .6, g1 - .6], true);
  c.piece(gallery, { kind: 'bench', at: [(core.lifts[0] + l1) / 2, g1 - .35], size: [2.4, .5, .45], facing: 'back' });
  art(c, gallery, [core.stair[2] / 2, g1 - .05], 'front', 1.6);
  return gallery;
}

/** A front-band loft from u0 to u1 between the gallery line and the facade: its bath in one
 *  corner on the gallery side, a wardrobe wall on the gallery wall, the kitchen wall on the
 *  party wall with its island, dining in the middle, the lounge on the facade, the bed's head
 *  on the party wall below the kitchen. `party` is the side of its party wall. */
function frontLoft(core: CoreBox, D: number, id: string, u0: number, u1: number, bathAt: 'low' | 'high', party: 'left' | 'right'): Loft {
  const g1 = core.lifts[3] + 4.4, bw = 4.6, bd = 4.4;
  const bath: PlanRect = bathAt === 'low' ? [u0, g1, u0 + bw, g1 + bd] : [u1 - bw, g1, u1, g1 + bd];
  // the entrance: the middle of the part of the gallery's front edge this loft meets beside its bath
  const lo = bathAt === 'low' ? u0 + bw : u0, hi = Math.min(core.lifts[2], bathAt === 'high' ? u1 - bw : u1);
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
      plant(k, r, [party === 'left' ? u1 - .6 : u0 + .6, g1 + (bathOnParty ? .7 : bd + .7)], true);
    },
  };
}

/** A typical floor: the gallery in front of the stair and the lift core, loft apartments
 *  opening directly off it, each one open loft room around its closed bathroom. Three
 *  arrangements turn with the floor index: four lofts split evenly, four split off-centre and
 *  mirrored, three lofts with one wide back loft wrapping the core. */
export function typicalA(c: Composer, core: CoreBox, variant: number): Composed {
  const { W, D } = c;
  const [l0, lv0, l1, lv1] = core.lifts;
  const sw = core.stair[2], g1 = lv1 + 4.4, mid = Math.round(W / 2 * 2) / 2;
  const list: Loft[] = [];
  const behindStair = { rect: [0, 0, sw, core.stair[1]] as PlanRect, door: [sw, core.stair[1] / 2] as const, vanity: 'back' as Side };
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
        study(k, r, [sw + .2, lv0 + .2, l0 - .3, lv1 - .3], 'left', L.look);
      },
    });
    list.push(frontLoft(core, D, 'loft-2', 0, mid + 2.5, 'high', 'right'));
    list.push(frontLoft(core, D, 'loft-3', mid + 2.5, W, 'high', 'left'));
  } else {
    list.push({
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
      },
    });
    const split = variant === 1 ? 14.5 : mid;
    list.push(frontLoft(core, D, 'loft-3', 0, split, variant === 1 ? 'low' : 'high', 'right'));
    list.push(frontLoft(core, D, 'loft-4', split, W, 'high', 'left'));
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
  const sw = core.stair[2], g1 = lv1 + 4.4;
  const back: Loft = {
    id: 'penthouse-1', rects: [[sw, 0, W, lv0], [sw, lv0, l0, lv1], [l1, lv0, W, g1]], entrance: [(sw + l0) / 2, lv1],
    baths: [{ rect: [0, 0, sw, core.stair[1]], door: [sw, core.stair[1] / 2], vanity: 'back' },
      { rect: [W - 4.6, g1 - 4.4, W, g1], door: [W - 4.6, g1 - 2.2], vanity: 'right' }],
    furnish: (k, r) => {
      kitchen(k, r, [l0 - .6, 0, l1 + .6, lv0], 'front', L.look);
      dining(k, r, [sw + .4, .6, l0 - 1.0, lv0 - .6], 'u', 8);
      lounge(k, r, [l1 + 1.0, 0, W - .2, lv0 - .2], 'back', L.look, { media: false, ledge: true });
      bedroom(k, r, [l1, lv0 + .2, W - 4.8, g1 - .2], 'left', L.look, { wardrobe: false });
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
      // the great room's centre: a conversation round a table, a bamboo enclosure beside it
      conversation(k, r, [W / 2 - 2.0, g1 + 9.0], 'u', 3.6);
      if (L.look === 'a') k.piece(r, { kind: 'plant', at: [W / 2 + 3.6, g1 + 9.0], size: [2.7, 1.1, 3.0], facing: 'front', fit: 'asm-e1-bamboo' });
      bedroom(k, r, [W - 8.8, g1 + 4.8, W, D - .1], 'right', L.look, { wardrobe: 'low' });
      bedroom(k, r, [0, g1 + 4.8, 5.6, D - 6.8], 'left', L.look, { wardrobe: false });
    },
  };
  lofts(c, core, [back, front]);
  return { rooms: c.rooms, rearLanding: false };
}
