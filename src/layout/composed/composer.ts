import type { Point } from '../../core/geom.js';
import { isCcw, polygonBounds } from '../../core/geom.js';
import type { FurnitureKind, RoomKind, StyleId } from '../../core/types.js';
import type { AuthoredPiece, EdgeName, PlanDoor, PlanRoom } from '../plan-types.js';
import { RoomRegion } from '../room-region.js';
import { sharedRoomEdges } from '../room-shape.js';
import type { IdGen } from '../rooms.js';
import type { UvRect } from '../uv.js';

/** A composed floor is drawn in plan terms, the way the user reads a plan walking in from the
 *  entrance: `u` metres from the user's LEFT wall, `v` metres from the BACK wall. The plate's
 *  frame runs the other way on both axes (its low v is the entrance side, its high u the
 *  user's left), so a plan point (u, v) is frame (U1 - u, V1 - v). A mirrored composition
 *  reads `u` from the right wall instead, so one plan serves both hands of a floor. */
export type Side = 'left' | 'right' | 'back' | 'front';

/** A rectangle in plan terms: [u0, v0, u1, v1]. */
export type PlanRect = readonly [number, number, number, number];

export interface Piece {
  kind: FurnitureKind;
  /** plan centre */
  at: readonly [number, number];
  /** width along the wall it backs onto, depth away from it, height */
  size: readonly [number, number, number];
  /** the side its front faces */
  facing: Side;
  fit?: string;
  elevation?: number;
}

const EPS = 1e-6;

export class Composer {
  readonly W: number;
  readonly D: number;
  private readonly U1: number;
  private readonly V1: number;
  readonly rooms: PlanRoom[] = [];
  /** pieces stood after every room is cut, so a piece can name any room */
  private readonly sealedRects: UvRect[] = [];

  constructor(private readonly plate: readonly Point[], readonly floorIndex: number, private readonly ids: IdGen, readonly mirror = false) {
    const b = polygonBounds(plate as Point[]);
    this.W = b.w; this.D = b.d; this.U1 = b.x + b.w; this.V1 = b.z + b.d;
  }

  /** Plan point to frame uv. */
  pt(u: number, v: number): Point {
    const pu = this.mirror ? this.W - u : u;
    return [round(this.U1 - pu), round(this.V1 - v)];
  }

  /** A frame point back to plan terms. */
  planPoint([u, v]: Point): [number, number] {
    const pu = this.U1 - u;
    return [round(this.mirror ? this.W - pu : pu), round(this.V1 - v)];
  }

  /** Plan rect to frame rect. */
  rect([u0, v0, u1, v1]: PlanRect): UvRect {
    const a = this.pt(u0, v0), b = this.pt(u1, v1);
    const u = Math.min(a[0], b[0]), v = Math.min(a[1], b[1]);
    return { u, v, lu: round(Math.abs(b[0] - a[0])), lv: round(Math.abs(b[1] - a[1])) };
  }

  /** A frame rect back to plan terms. */
  planOf(r: UvRect): PlanRect {
    const corners = [[r.u, r.v], [r.u + r.lu, r.v + r.lv]].map(([u, v]) => {
      const pu = this.U1 - u!, pv = this.V1 - v!;
      return [this.mirror ? this.W - pu : pu, pv] as const;
    });
    return [round(Math.min(corners[0]![0], corners[1]![0])), round(Math.min(corners[0]![1], corners[1]![1])),
      round(Math.max(corners[0]![0], corners[1]![0])), round(Math.max(corners[0]![1], corners[1]![1]))];
  }

  /** The side of a plan direction in the frame's rotation convention: a piece at rotation 0
   *  faces +v (the plan's back), 90 faces +u, 180 -v, 270 -u. */
  rotation(facing: Side): 0 | 90 | 180 | 270 {
    const side = this.mirror && (facing === 'left' || facing === 'right') ? (facing === 'left' ? 'right' : 'left') : facing;
    return side === 'back' ? 0 : side === 'front' ? 180 : side === 'left' ? 90 : 270;
  }

  /** Adds a room whose footprint is the union of plan rects, less any frame rects cut out of
   *  it (the core). */
  room(id: string, kind: RoomKind, rects: readonly PlanRect[], opts: { style?: StyleId; unit?: string; role?: string;
    authored?: boolean; cut?: readonly UvRect[] } = {}): PlanRoom {
    const shape = unionShape(rects.map(r => this.rect(r)), opts.cut ?? [], this.plate);
    const room: PlanRoom = { id: `f${this.floorIndex}-${id}`, kind, rect: shape.rect, polygon: shape.polygon,
      ...(shape.holes?.length ? { holes: shape.holes } : {}), doors: [],
      ...(opts.style ? { style: opts.style } : {}), ...(opts.unit ? { unit: opts.unit } : {}),
      role: opts.role ?? id, authored: [], ...(opts.authored === false ? {} : { authoredOnly: true }) };
    this.rooms.push(room);
    return room;
  }

  /** The open remainder of the plate once every other room and the core are cut out. */
  remainder(id: string, kind: RoomKind, plate: readonly Point[], core: readonly UvRect[], opts: { style?: StyleId; unit?: string } = {}): PlanRoom {
    const taken = this.rooms.flatMap(room => decompose(room));
    const shapes = new RoomRegion(plate as Point[]).subtract([...core, ...taken]);
    if (shapes.length !== 1) throw new Error(`composed floor ${this.floorIndex}: the open floor splits into ${shapes.length}`);
    const shape = shapes[0]!;
    const room: PlanRoom = { id: `f${this.floorIndex}-${id}`, kind, rect: shape.rect, polygon: shape.polygon,
      ...(shape.holes?.length ? { holes: shape.holes } : {}), doors: [], ...(opts.style ? { style: opts.style } : {}),
      ...(opts.unit ? { unit: opts.unit } : {}), role: id, authored: [], authoredOnly: true };
    this.rooms.push(room);
    return room;
  }

  /** A door from `a` into `b` centred at plan point `at` on their shared wall. */
  door(a: PlanRoom, b: PlanRoom, at: readonly [number, number], width: number, leaves: 1 | 2 = 1): PlanDoor {
    const [u, v] = this.pt(at[0], at[1]);
    const stretches = sharedRoomEdges(a, b);
    const hit = stretches.find(s => {
      const along = s.edge.startsWith('v') ? u : v, cross = s.edge.startsWith('v') ? v : u;
      return Math.abs(cross - s.c) < .3 && along >= s.lo - EPS && along <= s.hi + EPS;
    });
    if (!hit) throw new Error(`composed floor ${this.floorIndex}: ${a.id} and ${b.id} share no wall at ${at.join(',')}`);
    const along = hit.edge.startsWith('v') ? u : v;
    const half = width / 2, lo = hit.lo + half + .15, hi = hit.hi - half - .15;
    const centre = hi < lo ? (hit.lo + hit.hi) / 2 : Math.min(hi, Math.max(lo, along));
    const w = Math.min(width, hit.hi - hit.lo - .3);
    const door: PlanDoor = { id: this.ids.door(), to: b.id, leaves, width: round(w), edge: hit.edge as EdgeName, at: round(centre),
      position: hit.edge.startsWith('v') ? [round(centre), hit.c] : [hit.c, round(centre)] };
    a.doors.push(door);
    return door;
  }

  /** Stands an authored piece in a room at its plan pose. */
  piece(room: PlanRoom, p: Piece): void {
    const [u, v] = this.pt(p.at[0], p.at[1]);
    room.authored!.push({ id: `${room.role}-${room.authored!.length}`, kind: p.kind, at: [u, v],
      size: [p.size[0], p.size[1], p.size[2]], rotationDeg: this.rotation(p.facing), required: true,
      ...(p.fit ? { fit: p.fit } : {}), ...(p.elevation !== undefined ? { elevation: p.elevation } : {}) });
  }

  /** A sealed void (shaft column, service riser) in plan terms. */
  sealed(r: PlanRect): UvRect {
    const rect = this.rect(r);
    this.sealedRects.push(rect);
    return rect;
  }

  get sealedVoids(): UvRect[] { return this.sealedRects; }

  /** Keeps every doorway, the stair's mouth and the lift landings clear: a piece standing in
   *  the metre in front of a door on either side, or overlapping a piece stood before it, or
   *  leaving its room, is left out (and named in `dropped`). `keep` are frame rects to hold
   *  clear as well. */
  settle(keep: readonly UvRect[] = []): string[] {
    const dropped: string[] = [];
    const zones: UvRect[] = [...keep];
    for (const room of this.rooms) for (const door of room.doors) {
      const along = door.edge.startsWith('v'), c = along ? door.position![1] : door.position![0];
      const w = door.width + .3, depth = 1.1;
      zones.push(along ? { u: door.at - w / 2, v: c - depth, lu: w, lv: 2 * depth } : { u: c - depth, v: door.at - w / 2, lu: 2 * depth, lv: w });
    }
    const hits = (a: UvRect, b: UvRect, pad = 0) => a.u < b.u + b.lu + pad - EPS && b.u < a.u + a.lu + pad - EPS
      && a.v < b.v + b.lv + pad - EPS && b.v < a.v + a.lv + pad - EPS;
    for (const room of this.rooms) {
      const kept: UvRect[] = [];
      room.authored = (room.authored ?? []).filter(piece => {
        const fp = footprint(piece);
        const hung = (piece.elevation ?? 0) > .5;
        const why = !coversRect(room, fp) ? 'outside its room'
          : !hung && zones.some(z => hits(fp, z)) ? 'in a doorway or landing'
          : !hung && kept.some(k => hits(fp, k, -.02)) ? 'on another piece' : null;
        if (why) { dropped.push(`${piece.id} ${piece.kind} ${why}`); return false; }
        if (!hung) kept.push(fp);
        return true;
      });
    }
    return dropped;
  }
}

/** A piece's frame footprint, its size swapped when it stands across the axes. */
export function footprint(piece: Pick<AuthoredPiece, 'at' | 'size' | 'rotationDeg'>): UvRect {
  const swap = piece.rotationDeg === 90 || piece.rotationDeg === 270;
  const lu = swap ? piece.size[1] : piece.size[0], lv = swap ? piece.size[0] : piece.size[1];
  return { u: piece.at[0] - lu / 2, v: piece.at[1] - lv / 2, lu, lv };
}

function coversRect(room: PlanRoom, r: UvRect): boolean {
  const pts: Point[] = [[r.u + .01, r.v + .01], [r.u + r.lu - .01, r.v + .01], [r.u + r.lu - .01, r.v + r.lv - .01], [r.u + .01, r.v + r.lv - .01],
    [r.u + r.lu / 2, r.v + r.lv / 2]];
  return pts.every(p => inside(p, room.polygon!) && !(room.holes ?? []).some(h => inside(p, h)));
}

/** The footprint of the union of rectangles less the cut rectangles, inside `outline` (the
 *  plate, whose chamfered or cut corners trim a room standing in them) when given. */
export function unionShape(rects: readonly UvRect[], cut: readonly UvRect[] = [], outline?: readonly Point[]): { rect: UvRect; polygon: Point[]; holes?: Point[][] } {
  const ob = outline ? polygonBounds(outline as Point[]) : null;
  const us = [...new Set([...rects.flatMap(r => [r.u, r.u + r.lu]), ...(ob ? [ob.x, ob.x + ob.w] : [])].map(round))].sort((a, b) => a - b);
  const vs = [...new Set([...rects.flatMap(r => [r.v, r.v + r.lv]), ...(ob ? [ob.z, ob.z + ob.d] : [])].map(round))].sort((a, b) => a - b);
  const box: UvRect = { u: us[0]!, v: vs[0]!, lu: us.at(-1)! - us[0]!, lv: vs.at(-1)! - vs[0]! };
  const missing: UvRect[] = [];
  for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
    const cu = (us[i]! + us[i + 1]!) / 2, cv = (vs[j]! + vs[j + 1]!) / 2;
    if (!rects.some(r => cu > r.u && cu < r.u + r.lu && cv > r.v && cv < r.v + r.lv))
      missing.push({ u: us[i]!, v: vs[j]!, lu: us[i + 1]! - us[i]!, lv: vs[j + 1]! - vs[j]! });
  }
  const region: Point[] = outline ? [...outline] as Point[] : [[box.u, box.v], [box.u + box.lu, box.v], [box.u + box.lu, box.v + box.lv], [box.u, box.v + box.lv]];
  const shapes = new RoomRegion(region).subtract([...missing, ...cut]);
  if (shapes.length !== 1) throw new Error(`composed room splits into ${shapes.length} parts`);
  const shape = shapes[0]!;
  const polygon = isCcw(shape.polygon!) ? shape.polygon! : [...shape.polygon!].reverse();
  return { rect: shape.rect, polygon, ...(shape.holes?.length ? { holes: shape.holes } : {}) };
}

/** A room footprint as rectangles, for cutting it out of the open remainder. */
function decompose(room: PlanRoom): UvRect[] {
  const poly = room.polygon!;
  const us = [...new Set(poly.map(p => round(p[0])))].sort((a, b) => a - b);
  const vs = [...new Set(poly.map(p => round(p[1])))].sort((a, b) => a - b);
  const out: UvRect[] = [];
  for (let i = 0; i + 1 < us.length; i++) for (let j = 0; j + 1 < vs.length; j++) {
    const c: Point = [(us[i]! + us[i + 1]!) / 2, (vs[j]! + vs[j + 1]!) / 2];
    if (inside(c, poly) && !(room.holes ?? []).some(h => inside(c, h)))
      out.push({ u: us[i]!, v: vs[j]!, lu: us[i + 1]! - us[i]!, lv: vs[j + 1]! - vs[j]! });
  }
  return out;
}

function inside([x, y]: Point, poly: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export type { AuthoredPiece };
