import type { PlanRoom } from '../plan-types.js';
import type { Composer, PlanRect, Side } from './composer.js';

/** Furniture kits: a zone of a room (a plan rect) furnished against one of its walls. A kit
 *  stands its pieces at real sizes and leaves the zone's aisle side clear. Every kit takes
 *  `wall`, the side of the zone its main piece backs onto; pieces face away from it. */

const OPPOSITE: Record<Side, Side> = { left: 'right', right: 'left', back: 'front', front: 'back' };
export const opposite = (side: Side): Side => OPPOSITE[side];

/** Zone geometry seen from a wall: `along` runs on the wall (low to high plan coordinate),
 *  `out` runs away from it. */
export class Frame {
  readonly along0: number; readonly along1: number; readonly length: number; readonly depth: number;
  constructor(readonly zone: PlanRect, readonly wall: Side) {
    const [u0, v0, u1, v1] = zone;
    const vertical = wall === 'left' || wall === 'right';
    this.along0 = vertical ? v0 : u0; this.along1 = vertical ? v1 : u1;
    this.length = this.along1 - this.along0;
    this.depth = vertical ? u1 - u0 : v1 - v0;
  }
  /** plan point at `a` along the wall and `d` out from it */
  at(a: number, d: number): [number, number] {
    const [u0, v0, u1, v1] = this.zone;
    switch (this.wall) {
      case 'left': return [u0 + d, a];
      case 'right': return [u1 - d, a];
      case 'back': return [a, v0 + d];
      case 'front': return [a, v1 - d];
    }
  }
  get mid(): number { return (this.along0 + this.along1) / 2; }
  /** the wall's side seen along the wall: low end and high end sides */
  get lowSide(): Side { return this.wall === 'left' || this.wall === 'right' ? 'back' : 'left'; }
  get highSide(): Side { return opposite(this.lowSide); }
}

type Look = 'a' | 'b' | 'c' | 'r';

/** A built-in kitchen wall along the zone's wall, a tall column at one end, an island in
 *  front with stools on its far side. */
export function kitchen(c: Composer, room: PlanRoom, zone: PlanRect, wall: Side, look: Look, opts: { island?: boolean; tall?: 'low' | 'high' } = {}): void {
  const f = new Frame(zone, wall);
  const run = Math.min(f.length - .2, 7.2);
  const start = f.mid - run / 2;
  const tallLen = run > 4.2 ? 1.2 : 0;
  const tallAtLow = (opts.tall ?? 'high') === 'low';
  const wallLen = run - tallLen;
  const wallMid = tallAtLow ? start + tallLen + wallLen / 2 : start + wallLen / 2;
  const fit = look === 'a' ? 'asm-e1-kitchen' : look === 'b' ? 'asm-b3-bar' : undefined;
  c.piece(room, { kind: 'kitchen_block', at: f.at(wallMid, .35), size: [wallLen, .7, 1.05], facing: opposite(wall), ...(fit ? { fit } : {}) });
  if (tallLen) {
    const tallMid = tallAtLow ? start + tallLen / 2 : start + wallLen + tallLen / 2;
    if (look === 'a') c.piece(room, { kind: 'display_rack', at: f.at(tallMid, .3), size: [tallLen, .5, 2.6], facing: opposite(wall), fit: 'asm-e1-display' });
    else c.piece(room, { kind: 'fridge', at: f.at(tallMid, .35), size: [tallLen, .7, 2.2], facing: opposite(wall) });
  }
  if ((opts.island ?? true) && f.depth >= 4.6) {
    const len = Math.min(3.2, Math.max(2.2, run - 2));
    const islandFit = look === 'a' ? 'asm-e1-island' : look === 'b' ? 'asm-b3-counter' : undefined;
    c.piece(room, { kind: 'bar_counter', at: f.at(f.mid, 2.0), size: [len, 1.0, 1.0], facing: wall, ...(islandFit ? { fit: islandFit } : {}) });
    const n = Math.max(2, Math.floor(len / .62));
    for (let i = 0; i < n; i++) {
      const a = f.mid - (n - 1) * .62 / 2 + i * .62;
      c.piece(room, { kind: 'stool', at: f.at(a, 3.0), size: [.45, .45, .75], facing: wall,
        ...(look === 'a' ? { fit: 'fit-bar-stool-e1' } : look === 'b' ? { fit: 'fit-bar-stool-b3' } : {}) });
    }
  }
}

/** A dining table centred in the zone with chairs on both long sides. */
export function dining(c: Composer, room: PlanRoom, zone: PlanRect, axis: 'u' | 'v', seats = 6): void {
  const [u0, v0, u1, v1] = zone, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const len = seats >= 8 ? 2.8 : seats >= 6 ? 2.2 : 1.4;
  const per = Math.max(1, Math.floor(seats / 2));
  c.piece(room, { kind: 'dining_table', at: [cu, cv], size: [len, 1.0, .75], facing: axis === 'u' ? 'back' : 'left' });
  for (let i = 0; i < per; i++) {
    const t = -((per - 1) * .7) / 2 + i * .7;
    if (axis === 'u') {
      c.piece(room, { kind: 'chair', at: [cu + t, cv - .85], size: [.5, .5, .9], facing: 'front' });
      c.piece(room, { kind: 'chair', at: [cu + t, cv + .85], size: [.5, .5, .9], facing: 'back' });
    } else {
      c.piece(room, { kind: 'chair', at: [cu - .85, cv + t], size: [.5, .5, .9], facing: 'right' });
      c.piece(room, { kind: 'chair', at: [cu + .85, cv + t], size: [.5, .5, .9], facing: 'left' });
    }
  }
}

/** A seating group facing the zone's wall (a media wall or a view): a long sofa with its back
 *  to the open room, a return, a low table, two lounge chairs, a screen on the wall, plants. */
export function lounge(c: Composer, room: PlanRoom, zone: PlanRect, wall: Side, look: Look, opts: { media?: boolean; returnAt?: 'low' | 'high'; ledge?: boolean } = {}): void {
  const f = new Frame(zone, wall);
  // a lounge facing the glass looks over a low planter ledge under the window (E1)
  if (opts.ledge && look === 'a' && f.depth >= 4.6) c.piece(room, { kind: 'plant', at: f.at(f.mid, .36), size: [Math.min(5.0, f.length - .6), .7, .72], facing: opposite(wall), fit: 'asm-e1-planter' });
  const sofaLen = Math.min(3.6, f.length - 1.6);
  const sofaD = Math.min(f.depth - .6, 4.2);
  const sofaFit = look === 'a' ? 'asm-e1-lounge' : look === 'b' ? 'fit-sofa-corpo' : undefined;
  c.piece(room, { kind: 'sofa', at: f.at(f.mid, sofaD), size: [sofaLen, .95, .8], facing: wall, ...(sofaFit ? { fit: sofaFit } : {}) });
  c.piece(room, { kind: 'low_table', at: f.at(f.mid, sofaD - 1.45), size: [Math.min(1.6, sofaLen - 1), .8, .4], facing: wall });
  const side = (opts.returnAt ?? 'low') === 'low' ? -1 : 1;
  const chairA = f.mid + side * (sofaLen / 2 + .2);
  if (f.length >= sofaLen + 1.5)
    c.piece(room, { kind: 'chair', at: f.at(chairA, sofaD - 1.45), size: [.8, .8, .8], facing: side < 0 ? (wall === 'left' || wall === 'right' ? 'front' : 'right') : (wall === 'left' || wall === 'right' ? 'back' : 'left'),
      fit: look === 'r' ? 'fit-chair-corpo' : 'fit-chair-luxury' });
  if (opts.media ?? true)
    c.piece(room, { kind: 'display_screen', at: f.at(f.mid, .06), size: [1.8, .08, 1.0], facing: opposite(wall), elevation: 1.2 });
  if (f.length >= sofaLen + 2.2) c.piece(room, { kind: 'plant', at: f.at(f.mid - side * (sofaLen / 2 + .6), sofaD), size: [.6, .6, 1.3], facing: wall });
}

/** A bedroom zone: the bed's head against the wall, nightstands, a bench at the foot, art
 *  above, and a wardrobe wall along the zone's side when it is deep enough. */
export function bedroom(c: Composer, room: PlanRoom, zone: PlanRect, wall: Side, look: Look, opts: { wardrobe?: 'low' | 'high' | false; desk?: boolean } = {}): void {
  const f = new Frame(zone, wall);
  const bedW = look === 'a' ? 2.6 : 2.0, bedD = 2.3;
  const at = f.mid;
  c.piece(room, { kind: 'bed_double', at: f.at(at, bedD / 2), size: [bedW, bedD, .55], facing: opposite(wall), ...(look === 'a' ? {} : {}) });
  for (const s of [-1, 1]) c.piece(room, { kind: 'low_table', at: f.at(at + s * (bedW / 2 + .35), .3), size: [.5, .45, .5], facing: opposite(wall) });
  c.piece(room, { kind: 'wall_art', at: f.at(at, .05), size: [1.6, .06, .9], facing: opposite(wall), elevation: 1.35 });
  if (f.depth >= bedD + 1.4) c.piece(room, { kind: 'bench', at: f.at(at, bedD + .45), size: [1.5, .45, .45], facing: opposite(wall) });
  const wardrobe = opts.wardrobe ?? 'high';
  if (wardrobe && f.length >= bedW + 4) {
    // a wardrobe wall standing at one end of the zone, square to the bed wall
    const end = wardrobe === 'low' ? f.along0 + .35 : f.along1 - .35;
    const len = Math.min(3.2, f.depth - .6);
    const facing = wardrobe === 'low' ? f.highSide : f.lowSide;
    const centre = f.at(end, .3 + len / 2);
    c.piece(room, { kind: 'wardrobe', at: centre, size: [len, .6, 2.4], facing, ...(look === 'a' ? { fit: 'asm-e1-wardrobe' } : {}) });
  }
}

/** A work corner: desk against the wall, chair, a bookcase beside it. */
export function study(c: Composer, room: PlanRoom, zone: PlanRect, wall: Side, look: Look): void {
  const f = new Frame(zone, wall);
  c.piece(room, { kind: 'desk', at: f.at(f.mid, .4), size: [1.8, .8, .75], facing: opposite(wall), ...(look === 'r' ? { fit: 'fit-corporate-executive-desk' } : {}) });
  c.piece(room, { kind: 'office_chair', at: f.at(f.mid, 1.2), size: [.65, .65, 1.15], facing: wall });
  if (f.length >= 3.6) c.piece(room, { kind: 'shelf', at: f.at(f.along1 - .55, .25), size: [1.0, .45, 2.0], facing: opposite(wall) });
}

/** An entry: a bench with art over it against the wall beside the door. */
export function entry(c: Composer, room: PlanRoom, at: readonly [number, number], wall: Side): void {
  c.piece(room, { kind: 'bench', at, size: [1.4, .45, .45], facing: opposite(wall) });
}

/** A bathroom fitted wall to wall: vanity on one wall, toilet beside it, a walk-in shower in
 *  the far corner. `wall` is the vanity's wall; `door` the side the door is on. */
export function bathroom(c: Composer, room: PlanRoom, zone: PlanRect, wall: Side, look: Look): void {
  const f = new Frame(zone, wall);
  const vanity = Math.min(2.0, f.length - 2.2);
  c.piece(room, { kind: 'sink', at: f.at(f.along0 + .2 + vanity / 2, .28), size: [vanity, .55, .9], facing: opposite(wall) });
  c.piece(room, { kind: 'toilet', at: f.at(f.along0 + .2 + vanity + .55, .35), size: [.45, .7, .8], facing: opposite(wall) });
  const showerW = Math.min(1.6, f.length - vanity - 1.5);
  if (showerW >= 1.0) c.piece(room, { kind: 'shower', at: f.at(f.along1 - showerW / 2 - .05, Math.min(1.6, f.depth - 1.3) / 2 + .05), size: [showerW, Math.min(1.6, f.depth - 1.3), 2.2], facing: opposite(wall) });
  void look;
}

/** A plant at a point. */
export function plant(c: Composer, room: PlanRoom, at: readonly [number, number], big = false): void {
  c.piece(room, { kind: 'plant', at, size: big ? [.9, .9, 1.8] : [.6, .6, 1.3], facing: 'front' });
}

/** Art hung on a wall at a point on it. */
export function art(c: Composer, room: PlanRoom, at: readonly [number, number], wall: Side, width = 1.4): void {
  c.piece(room, { kind: 'wall_art', at, size: [width, .06, .9], facing: opposite(wall), elevation: 1.3 });
}

/** A plant room fitted round its walls, its door in the wall opposite `back`: the switchboard
 *  and the drive bank along the back wall, the air handling on one side wall, the pump skid in
 *  the middle where the room is deep enough, a tool counter with the status screen and a parts
 *  shelf over it on the other side wall, transit cases by it. */
export function mechanical(c: Composer, room: PlanRoom, zone: PlanRect, back: Side): void {
  const f = new Frame(zone, back);
  const lo = f.along0 + .15, hi = f.along1 - .15;
  c.piece(room, { kind: 'shelf', at: f.at(lo + .9, .27), size: [1.8, .5, 2.2], facing: opposite(back), fit: 'fit-open-switchboard' });
  if (hi - lo >= 5.2) c.piece(room, { kind: 'ornament_wall', at: f.at(lo + 1.95 + 1.5, .27), size: [3.0, .5, 2.0], facing: opposite(back), fit: 'fit-industrial-drive-bank' });
  // the side walls: air handling at the low end, the tool counter at the high end
  const side = (end: 'low' | 'high', d: number, len: number, off = .27) => {
    const a = end === 'low' ? f.along0 + off : f.along1 - off;
    return { at: f.at(a, d), facing: end === 'low' ? f.highSide : f.lowSide, len };
  };
  if (f.depth >= 3.6) {
    const air = side('low', Math.min(f.depth - 1.4, 1.0 + 1.25), 2.4);
    c.piece(room, { kind: 'room_divider', at: air.at, size: [2.4, .5, 2.0], facing: air.facing, fit: 'fit-industrial-ventilation-bank' });
    const bench = side('high', 1.0 + 1.0, 2.0, .37);
    c.piece(room, { kind: 'counter', at: bench.at, size: [2.0, .7, .9], facing: bench.facing, fit: 'fit-industrial-tool-counter' });
    c.piece(room, { kind: 'display_screen', at: side('high', 2.0, 1.2, .05).at, size: [1.2, .08, .7], facing: bench.facing, fit: 'wall-screen-industrial-status', elevation: 1.45 });
  }
  if (f.depth >= 4.2 && f.length >= 6.5) c.piece(room, { kind: 'gym_machine', at: f.at(f.mid + .4, Math.min(f.depth - 1.6, 2.2)), size: [2.8, 1.25, 2.25], facing: opposite(back), fit: 'fit-open-pump-skid' });
  for (const k of [0, 1]) c.piece(room, { kind: 'crate', at: f.at(hi - .4 - k * .7, f.depth - .5), size: [.62, .62, .55], facing: back, fit: 'fit-industrial-transit-case' });
}

/** A store fitted round its walls, its door in the wall opposite `back`: the long labelled
 *  rack on the back wall, steel racks on the side walls, lockers by the door, cases. */
export function storage(c: Composer, room: PlanRoom, zone: PlanRect, back: Side): void {
  const f = new Frame(zone, back);
  if (f.length >= 5.0) c.piece(room, { kind: 'shelf', at: f.at(f.mid, .47), size: [4.6, .9, 2.5], facing: opposite(back), fit: 'fit-open-store-rack' });
  else c.piece(room, { kind: 'shelf', at: f.at(f.mid, .27), size: [1.8, .5, 2.0], facing: opposite(back), fit: 'fit-industrial-storage-rack' });
  if (f.depth >= 3.2) {
    c.piece(room, { kind: 'shelf', at: f.at(f.along0 + .27, 2.0), size: [1.8, .5, 2.0], facing: f.highSide, fit: 'fit-industrial-storage-rack' });
    c.piece(room, { kind: 'wardrobe', at: f.at(f.along1 - .35, 1.7), size: [1.6, .65, 2.0], facing: f.lowSide, fit: 'fit-industrial-lockers' });
  }
  for (const [a, d] of [[f.mid - .4, 1.6], [f.mid + .35, 1.6], [f.mid - .05, 2.3]] as const)
    if (d < f.depth - 1.0) c.piece(room, { kind: 'crate', at: f.at(a, d), size: [.62, .62, .55], facing: back, fit: 'fit-industrial-transit-case' });
}
