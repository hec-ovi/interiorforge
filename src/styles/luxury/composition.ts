import type { FurnitureKind } from '../../core/types.js';
import type { EdgeName, PlanFurniture, PlanRoom } from '../../layout/plan-types.js';
import { roomArea, roomEdges } from '../../layout/room-shape.js';
import { doorUvPoint } from '../../layout/plan-floor.js';
import type { UvRect } from '../../layout/uv.js';

type Turn = 0 | 90 | 180 | 270;
type Piece = Pick<PlanFurniture, 'kind' | 'at' | 'size' | 'rotationDeg' | 'elevation'>;
interface Recipe { span: [number, number]; pieces: Piece[]; carpet?: UvRect }
export type LuxuryComposition = 'concierge' | 'hospitality' | 'living' | 'living_compact' | 'living_linear' | 'suite' | 'suite_compact' | 'reading' | 'dining' | 'dining_pair' | 'breakfast' | 'display';
export interface FittedComposition { reservation: UvRect; pieces: Piece[]; carpet?: UvRect }

const piece = (kind: FurnitureKind, at: [number, number], size: [number, number, number], rotationDeg: Turn = 0, elevation?: number): Piece =>
  ({ kind, at, size, rotationDeg, ...(elevation === undefined ? {} : { elevation }) });

/** Source relationships, in metres, rather than independent random props. The dimensions
 * are our architectural proposals: the reference images are not a measured survey.
 * Biotechnica public floor: a pale seated bay with planted enclosure.
 * Corpo Plaza apartment: dark media joinery facing pale low seating.
 * Whole approach zones must fit; furniture is never compressed to fill a narrow room. */
const RECIPES: Record<LuxuryComposition, Recipe> = {
  concierge: {
    span: [4.2, 2.5],
    pieces: [piece('reception_desk', [0, .5], [3.8, 1, 1.1]), piece('office_chair', [0, -.625], [.75, .75, 1.15])],
  },
  hospitality: {
    span: [6.5, 5.5],
    pieces: [
      piece('ornament_wall', [.45, -2.28], [3, .75, 2.7]),
      piece('sofa', [.45, -1.23], [3.2, 1, .9]),
      piece('sofa', [-2.43, .1], [2.8, 1, .9], 90),
      piece('low_table', [.45, .47], [1.9, 1.1, .4]),
      piece('chair', [2.6, .47], [.75, .8, .9], 270),
    ],
    carpet: { u: -2.95, v: -1.88, lu: 5.85, lv: 4.25 },
  },
  living: {
    span: [5.1, 4.8],
    pieces: [
      piece('counter', [0, -2.03], [3, .45, .65]),
      piece('display_screen', [0, -2.26], [2.15, .08, 1.08], 0, 1.03),
      piece('sofa', [0, 1.45], [2.8, 1, .9], 180),
      piece('low_table', [0, -.05], [1.6, .9, .4]),
      piece('chair', [1.96, -.05], [.75, .8, .9], 270),
      piece('room_divider', [-2.19, .37], [2.4, .5, 2], 90),
    ],
    carpet: { u: -1.75, v: -.76, lu: 3.45, lv: 2.96 },
  },
  suite: {
    span: [4.8, 4.8],
    pieces: [
      piece('bed_double', [0, -1.1], [2, 2.3, .6]),
      piece('low_table', [-1.55, -1.65], [.55, .6, .4]),
      piece('low_table', [1.55, -1.65], [.55, .6, .4]),
    ],
  },
  living_compact: {
    span: [4.5, 3.8],
    pieces: [
      piece('counter', [0, -1.56], [3, .45, .65]),
      piece('display_screen', [0, -1.76], [2.15, .08, 1.08], 0, 1.03),
      piece('sofa', [0, 1.23], [2.8, 1, .9], 180),
      piece('low_table', [0, -.25], [1.6, .75, .4]),
      piece('chair', [1.79, -.05], [.75, .8, .9], 270),
    ],
    carpet: { u: -1.65, v: -.8, lu: 3.3, lv: 2.55 },
  },
  suite_compact: {
    span: [4.1, 3.55],
    pieces: [
      piece('bed_double', [0, -.45], [2, 2.3, .6]),
      piece('low_table', [-1.55, -1.2], [.55, .6, .4]),
      piece('low_table', [1.55, -1.2], [.55, .6, .4]),
    ],
  },
  living_linear: {
    span: [3.4, 3.8],
    pieces: [
      piece('counter', [0, -1.56], [3, .45, .65]),
      piece('display_screen', [0, -1.76], [2.15, .08, 1.08], 0, 1.03),
      piece('sofa', [0, 1.23], [2.8, 1, .9], 180),
      piece('low_table', [0, -.25], [1.6, .9, .4]),
    ],
    carpet: { u: -1.5, v: -.85, lu: 3, lv: 2.6 },
  },
  reading: {
    span: [3.4, 3.2],
    pieces: [
      piece('shelf', [0, -1.27], [1.8, .5, 2]),
      piece('chair', [-1.08, .3], [.75, .8, .9], 90),
      piece('chair', [1.08, .3], [.75, .8, .9], 270),
      piece('low_table', [0, .3], [.7, .7, .4]),
    ],
    carpet: { u: -1.5, v: -.35, lu: 3, lv: 1.8 },
  },
  dining: {
    span: [3.8, 3.7],
    pieces: [
      piece('dining_table', [0, 0], [2, 1, .75]),
      piece('chair', [-.6, -1], [.65, .75, .9]),
      piece('chair', [.6, -1], [.65, .75, .9]),
      piece('chair', [-.6, 1], [.65, .75, .9], 180),
      piece('chair', [.6, 1], [.65, .75, .9], 180),
    ],
    carpet: { u: -1.45, v: -1.6, lu: 2.9, lv: 3.2 },
  },
  dining_pair: {
    span: [2.1, 2.8],
    pieces: [
      piece('dining_table', [0, 0], [1.4, .9, .75]),
      piece('chair', [0, -1], [.65, .75, .9]),
      piece('chair', [0, 1], [.65, .75, .9], 180),
    ],
    carpet: { u: -.95, v: -1.3, lu: 1.9, lv: 2.6 },
  },
  breakfast: {
    span: [2.2, 1.9],
    pieces: [
      piece('dining_table', [0, -.475], [1.6, .75, .75]),
      piece('chair', [-.45, .425], [.65, .75, .9], 180),
      piece('chair', [.45, .425], [.65, .75, .9], 180),
    ],
  },
  display: {
    span: [3.4, 1.25],
    pieces: [piece('ornament_wall', [0, 0], [3, .75, 2.7])],
  },
};

/** The full room bounds are searched, including concave reception rear arms. A
 * fixed +/-3.5 m search beside the entrance could never furnish a wide lobby.
 * The host callback owns wall thickness, room polygons, doors and public routes. */
export function fitLuxuryComposition(kind: LuxuryComposition, room: PlanRoom, bounds: UvRect,
  accepts: (reservation: UvRect, pieces: readonly Piece[]) => boolean): FittedComposition | null {
  const recipe = RECIPES[kind];
  const entrance = room.doors.find(door => door.to === 'outside') ?? room.doors[0];
  const entry = entrance ? doorUvPoint(entrance, room) : undefined;
  const towards: Turn = entrance?.edge === 'v0' ? 180 : entrance?.edge === 'u0' ? 270 : entrance?.edge === 'u1' ? 90 : 0;
  const rotations: Turn[] = kind === 'concierge' ? [towards, ((towards + 90) % 360) as Turn, ((towards + 270) % 360) as Turn, ((towards + 180) % 360) as Turn] : [0, 180, 90, 270];
  const candidates: { rotation: Turn; rect: UvRect; score: number; rank: number }[] = [];
  for (const [rank, rotation] of rotations.entries()) {
    const [width, depth] = rotation % 180 ? [recipe.span[1], recipe.span[0]] : recipe.span;
    const du = bounds.lu - width! - .2, dv = bounds.lv - depth! - .2;
    if (du < -1e-6 || dv < -1e-6) continue;
    const us = new Set(stations(du)), vs = new Set(stations(dv));
    const add = (set: Set<number>, value: number, extent: number) => {
      if (value >= -1e-6 && value <= extent + 1e-6) set.add(Math.max(0, Math.min(extent, value)));
    };
    const backEdge = rotation === 0 ? 'v0' : rotation === 180 ? 'v1' : rotation === 90 ? 'u0' : 'u1';
    for (const wall of roomEdges(room).filter(wall => wall.edge === backEdge)) {
      // Internal faces need not share the bounding box's half-metre phase. Include
      // their exact seats, or a valid media wall can be missed despite ample room.
      const along = rotation % 180 ? 1 : 0, across = 1 - along;
      const span = along ? depth! : width!, offset = along ? bounds.v : bounds.u;
      const low = Math.min(wall.a[along]!, wall.b[along]!), high = Math.max(wall.a[along]!, wall.b[along]!);
      const lateral = along ? vs : us, lateralExtent = along ? dv : du;
      for (const value of [low - offset, high - span - offset - .2, (low + high - span) / 2 - offset - .1])
        add(lateral, value, lateralExtent);
      const crossSpan = across ? depth! : width!, crossOffset = across ? bounds.v : bounds.u;
      const seat = wall.a[across]! - crossOffset - (rotation === 180 || rotation === 270 ? crossSpan + .2 : 0);
      add(across ? vs : us, seat, across ? dv : du);
    }
    for (const v of [...vs].sort((a, b) => a - b)) for (const u of [...us].sort((a, b) => a - b)) {
      const back = rotation === 0 ? v : rotation === 180 ? dv - v : rotation === 90 ? u : du - u;
      const side = rotation % 180 ? Math.abs(v - dv / 2) : Math.abs(u - du / 2);
      const rect = { u: bounds.u + .1 + u, v: bounds.v + .1 + v, lu: width!, lv: depth! };
      let score = back * 100 + side;
      if ((kind === 'concierge' || kind === 'display' && room.kind === 'reception') && entrance && entry) {
        const horizontal = entrance.edge.startsWith('v'), along = horizontal ? 0 : 1, cross = 1 - along;
        const centre = [rect.u + rect.lu / 2, rect.v + rect.lv / 2];
        const inward = entrance.edge === 'v0' || entrance.edge === 'u0' ? 1 : -1;
        const arrivalDepth = Math.min(kind === 'display' ? 6 : 8, (horizontal ? bounds.lv : bounds.lu) * .55);
        // A staffed counter must still be encountered from the entrance. Rotating
        // its front toward a broad arrival aisle is preferable to hiding it fifteen
        // metres away in a concave lobby's distant rear arm.
        score = Math.abs(centre[along]! - entry[along]!) * 3
          + Math.abs((centre[cross]! - entry[cross]!) * inward - arrivalDepth) + rank * (kind === 'display' ? .1 : 1.5);
        if (kind === 'display') {
          const facing = [Math.sin(rotation * Math.PI / 180), Math.cos(rotation * Math.PI / 180)];
          score += (1 - facing[along]! * Math.sign(entry[along]! - centre[along]!)) * 8;
        }
      }
      candidates.push({ rotation, rect, score, rank });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.rank - b.rank);
  for (const { rect: reservation, rotation } of candidates) {
    const u = reservation.u + reservation.lu / 2, v = reservation.v + reservation.lv / 2;
    const pieces = recipe.pieces.map(item => {
      const [x, z] = turn(item.at, rotation);
      return { ...item, at: [u + x, v + z] as [number, number], size: [...item.size] as [number, number, number], rotationDeg: ((item.rotationDeg + rotation) % 360) as Turn };
    });
    if (!accepts(reservation, pieces)) continue;
    const carpet = recipe.carpet;
    if (!carpet) return { reservation, pieces };
    const [x, z] = turn([carpet.u + carpet.lu / 2, carpet.v + carpet.lv / 2], rotation);
    const [lu, lv] = rotation % 180 ? [carpet.lv, carpet.lu] : [carpet.lu, carpet.lv];
    return { reservation, pieces, carpet: { u: u + x - lu! / 2, v: v + z - lv! / 2, lu: lu!, lv: lv! } };
  }
  return null;
}

function stations(extent: number): number[] {
  const span = Math.max(0, extent), out = Array.from({ length: Math.floor(span / .5) + 1 }, (_, index) => index * .5);
  if (span - out[out.length - 1]! > 1e-6) out.push(span);
  return out;
}

function turn([u, v]: readonly number[], rotation: Turn): [number, number] {
  return rotation === 0 ? [u!, v!] : rotation === 90 ? [v!, -u!] : rotation === 180 ? [-u!, -v!] : [-v!, u!];
}

export interface LuxuryPlacer {
  composition(kind: LuxuryComposition, bounds?: UvRect): boolean;
  group(kind: 'salon' | 'seating' | 'suite' | 'kitchen'): boolean;
  onAxis(kind: FurnitureKind): PlanFurniture | null;
  anyEdge(kind: FurnitureKind, edges?: EdgeName[]): PlanFurniture | null;
  center(kind: FurnitureKind): PlanFurniture | null;
  grid(kind: FurnitureKind, aisle: number, max: number): PlanFurniture[];
  looseBed(kind: 'bed_double' | 'bed_single'): PlanFurniture | null;
  wallPiece(kind: FurnitureKind, edges?: EdgeName[]): PlanFurniture | null;
  seatAt(item: PlanFurniture, kind: 'chair' | 'office_chair', behind?: boolean): void;
  workstation(): PlanFurniture | null;
  receptionWaiting(): boolean;
}

/** Room roles choose the same coherent language at each size. Large lounges gain a
 * reading function; they do not gain rows of identical sofas or tiny plant pedestals. */
export function furnishLuxuryComposition(room: PlanRoom, p: LuxuryPlacer): boolean {
  const area = roomArea(room);
  switch (room.kind) {
    case 'reception': {
      if (!p.composition('concierge')) {
        const desk = p.onAxis('reception_desk') ?? p.anyEdge('reception_desk');
        if (desk) p.seatAt(desk, 'office_chair', true);
      }
      p.receptionWaiting();
      // A planted display needs an opaque wall behind it; a glazed arrival stands its
      // planters on the floor instead.
      const displays = Number(p.composition('display')) + Number(area >= 100 && p.composition('display'));
      for (let i = displays; i < (area >= 100 ? 2 : 1); i++) p.anyEdge('plant');
      p.wallPiece('display_screen');
      return true;
    }
    case 'lounge':
      if (!p.composition('hospitality')) p.group('salon') || p.group('seating');
      if (area >= 65) p.composition('reading');
      p.wallPiece('wall_art');
      return true;
    case 'living': {
      const media: LuxuryComposition[] = ['living', 'living_compact', 'living_linear'];
      const dining: LuxuryComposition[] = ['dining', 'dining_pair', 'breakfast'];
      const furnished = media.some(kind => p.composition(kind));
      if (!furnished && !p.group('seating')) {
        p.anyEdge('sofa');
        p.center('low_table');
        p.wallPiece('display_screen');
      }
      if (area >= 25) dining.some(kind => p.composition(kind));
      if (area >= 65) p.workstation();
      return true;
    }
    case 'bedroom':
      // The full bed with both bedside cabinets against an opaque headwall first; a
      // room short of that keeps the fitted suite, then a bed on its own, and only then
      // a bed whose head stands at glazing or open floor. The home's bed is checked
      // once every room is furnished.
      if (!p.composition('suite') && !p.composition('suite_compact') && !p.group('suite')) {
        const bed = area >= 9 ? 'bed_double' : 'bed_single';
        if (!p.anyEdge(bed) && !p.grid(bed, .6, 1).length) p.looseBed(bed);
      }
      p.anyEdge('wardrobe');
      return true;
    default: return false;
  }
}
