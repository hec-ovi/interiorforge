import { InteriorError } from '../../core/errors.js';
import type { PlanRoom } from '../plan-types.js';
import { RoomRegion } from '../room-region.js';
import { roomArea, sharedRoomEdges } from '../room-shape.js';
import { doorBetween, type IdGen } from '../rooms.js';
import { uvRectCorners, type UvRect } from '../uv.js';
import type { DuplexSection } from './section.js';

export interface DuplexProgram {
  unit: string;
  lower: PlanRoom[];
  upper: PlanRoom[];
  entrance: { room: string; at: [number, number]; width: number };
  /** The lower stair footprint remains floor area but is not furniture space. */
  reservations: { lower: UvRect[]; upper: UvRect[] };
  roles: Record<string, 'guest' | 'primary' | 'bathroom' | 'kitchen' | 'utility' | 'dressing' | 'linen' | 'study' | 'living' | 'gallery'>;
}

/** Connected type-C program in the section's local frame. The large primary
 * room includes its private linen approach; the gallery never becomes a second
 * home. Program figures are gross allocations and keep real wall/circulation
 * allowance rather than claiming every tabulated reference target is a clear room. */
export function planDuplexProgram(section: DuplexSection, unit = 'duplex-105', entryAt?: number): DuplexProgram {
  if (section.stairWall) return planWallStairProgram(section, unit, entryAt);
  const { width: w, depth: d, stairOpening: s } = section;
  const outline = uvRectCorners({ u: 0, v: 0, lu: w, lv: d });
  const roles: DuplexProgram['roles'] = {};
  const make = (level: 'lower' | 'upper', role: DuplexProgram['roles'][string], kind: PlanRoom['kind'], rect: UvRect): PlanRoom => {
    const id = `${unit}-${level}-${role}`; roles[id] = role;
    return { id, unit, kind, rect, polygon: uvRectCorners(rect), doors: [] };
  };
  const lowerParts = [
    make('lower', 'guest', 'bedroom', { u: 0, v: 0, lu: 4, lv: 4 }),
    make('lower', 'bathroom', 'bathroom', { u: w - 4, v: 0, lu: 4, lv: 3 }),
    make('lower', 'kitchen', 'kitchen', { u: w - 4, v: 3, lu: 4, lv: 4 }),
    make('lower', 'utility', 'storage', { u: w - 2, v: d - 3, lu: 2, lv: 3 }),
  ];
  const lowerMain = remainder(outline, lowerParts.map(room => room.rect), `${unit}-lower-living`, 'living', unit);
  roles[lowerMain.id] = 'living';
  lowerMain.doors.push({ id: `${unit}-private-entry`, to: 'outside', leaves: 2, edge: 'v0', at: s.u + 1.5, width: 1.6 });
  const linen = make('upper', 'linen', 'storage', { u: s.u - 2, v: 4, lu: 2, lv: 2 });
  const primary = make('upper', 'primary', 'bedroom', { u: 0, v: 0, lu: s.u, lv: 6 });
  const primaryShape = new RoomRegion(primary.polygon!).subtract([linen.rect, ...section.loungeVoids]);
  if (primaryShape.length !== 1) throw new InteriorError('E_ASSIGNMENT_INVALID', 'duplex primary suite has a disconnected linen approach');
  Object.assign(primary, primaryShape[0]);
  const upperParts = [primary, linen,
    make('upper', 'bathroom', 'bathroom', { u: w - 4, v: 0, lu: 4, lv: 3 }),
    make('upper', 'dressing', 'storage', { u: w - 4, v: 3, lu: 4, lv: 3 }),
    // A continuous two-metre gallery passes the study and reaches the rear
    // return even when the shell supplies a deeper unit than the canonical bay.
    make('upper', 'study', 'office_private', { u: w - 4, v: 6, lu: 4, lv: d - 6 }),
  ];
  // Subtract the entire primary/linen reservation once, then exact upper voids.
  const upperMain = remainder(outline,
    [{ u: 0, v: 0, lu: s.u, lv: 6 }, ...upperParts.slice(2).map(room => room.rect), s, ...section.loungeVoids],
    `${unit}-upper-gallery`, 'corridor', unit);
  roles[upperMain.id] = 'gallery';
  const ids = idsFor(unit);
  for (const part of lowerParts) connect(part, lowerMain, ids, part.kind === 'kitchen' ? 1.8 : 1.2);
  for (const part of upperParts) connect(part, part === linen ? primary : upperMain, ids, 1.2);
  const lower = [lowerMain, ...lowerParts], upper = [upperMain, ...upperParts];
  const area = (rooms: PlanRoom[]) => rooms.reduce((sum, room) => sum + roomArea(room), 0);
  if (Math.abs(area(lower) - section.lowerArea) > 1e-6 || Math.abs(area(upper) - section.upperArea) > 1e-6)
    throw new InteriorError('E_ASSIGNMENT_INVALID', 'duplex private rooms do not own the complete measured floor allocation');
  // Two metre approaches flank the stair; a broad foyer joins both to the
  // private entrance. Upper circulation is a real L route to the occupied wing.
  const approaches = [
    { u: s.u - 2, v: 0, lu: 2, lv: s.v + s.lv },
    { u: s.u + s.lu, v: 0, lu: 2, lv: s.v + s.lv },
    { u: s.u - 2, v: 0, lu: 7, lv: 2 },
  ];
  return { unit, lower, upper, roles, entrance: { room: lowerMain.id, at: [s.u + 1.5, 0], width: 1.6 },
    reservations: { lower: [s, ...approaches], upper: [approaches[1]!, approaches[2]!] } };
}

/** A composed loft (Apartment 1702): the stair rises against one side wall to a mezzanine;
 *  below, the open living round it with the bathroom and the kitchen on the far wall and a
 *  store at the back; above, the primary bedroom over the entrance, the bathroom and dressing on
 *  the far wall, a study beside the double-height lounge, and the walkway along the lounge's
 *  edge joining them to the stair. Planned with the stair on the low side and mirrored for the
 *  high one. */
function planWallStairProgram(section: DuplexSection, unit: string, entryAt?: number): DuplexProgram {
  const { width: w, depth: d, stairOpening: stair } = section, high = section.stairWall === 'high';
  const flip = (r: UvRect): UvRect => high ? { u: w - r.u - r.lu, v: r.v, lu: r.lu, lv: r.lv } : r;
  // the stair and the lounge void as planned on the low side
  const s = flip(stair), voids = section.loungeVoids.map(flip);
  const voidV = Math.min(...voids.map(r => r.v));
  const outline = uvRectCorners({ u: 0, v: 0, lu: w, lv: d });
  const roles: DuplexProgram['roles'] = {};
  const make = (level: 'lower' | 'upper', role: DuplexProgram['roles'][string], kind: PlanRoom['kind'], rect: UvRect): PlanRoom => {
    const id = `${unit}-${level}-${role}`; roles[id] = role;
    const placed = flip(rect);
    return { id, unit, kind, rect: placed, polygon: uvRectCorners(placed), doors: [] };
  };
  const lowerParts = [
    make('lower', 'bathroom', 'bathroom', { u: w - 4, v: 0, lu: 4, lv: 3.5 }),
    make('lower', 'kitchen', 'kitchen', { u: w - 4, v: 3.5, lu: 4, lv: 4.5 }),
    make('lower', 'utility', 'storage', { u: w - 2, v: d - 3, lu: 2, lv: 3 }),
  ];
  const lowerMain = remainder(outline, lowerParts.map(room => room.rect), `${unit}-lower-living`, 'living', unit);
  roles[lowerMain.id] = 'living';
  // the entrance stays where the floor's gallery has it, unless that is the stair's own flank
  // or the bathroom's wall; then it stands beside the stair
  const beside = high ? w - (s.u + 3 + 1) : s.u + 3 + 1;
  const clearOf = (at: number) => { const low = high ? w - at : at; return low - .8 >= s.u + 3 + .2 && low + .8 <= w - 4 - .2; };
  const at = entryAt !== undefined && clearOf(entryAt) ? entryAt : beside;
  lowerMain.doors.push({ id: `${unit}-private-entry`, to: 'outside', leaves: 2, edge: 'v0', at, width: 1.6 });
  const upperParts = [
    make('upper', 'primary', 'bedroom', { u: s.u + 5, v: 0, lu: Math.max(4, w - 4 - (s.u + 5)), lv: Math.min(6, voidV - 3) }),
    make('upper', 'bathroom', 'bathroom', { u: w - 4, v: 0, lu: 4, lv: 3.5 }),
    make('upper', 'dressing', 'storage', { u: w - 4, v: 3.5, lu: 4, lv: 2.5 }),
    make('upper', 'study', 'office_private', { u: w - 4, v: 6, lu: 4, lv: d - 6 }),
  ];
  const upperMain = remainder(outline, [...upperParts.map(room => room.rect), stair, ...section.loungeVoids],
    `${unit}-upper-gallery`, 'corridor', unit);
  roles[upperMain.id] = 'gallery';
  const ids = idsFor(unit);
  for (const part of lowerParts) connect(part, lowerMain, ids, part.kind === 'kitchen' ? 1.8 : 1.2);
  // the bathroom and the dressing open off the bedroom (an en-suite and a walk-in)
  const [primary, bath, dressing, study] = upperParts as [PlanRoom, PlanRoom, PlanRoom, PlanRoom];
  connect(primary, upperMain, ids, 1.2);
  connect(bath, primary, ids, .9);
  connect(dressing, primary, ids, .9);
  connect(study, upperMain, ids, 1.2);
  const lower = [lowerMain, ...lowerParts], upper = [upperMain, ...upperParts];
  const area = (rooms: PlanRoom[]) => rooms.reduce((sum, room) => sum + roomArea(room), 0);
  if (Math.abs(area(lower) - section.lowerArea) > 1e-6 || Math.abs(area(upper) - section.upperArea) > 1e-6)
    throw new InteriorError('E_ASSIGNMENT_INVALID', 'loft private rooms do not own the complete measured floor allocation');
  // the stair's foot and its flank stay clear below; its head stays clear above
  const foot = flip({ u: 0, v: 0, lu: 5, lv: 2 }), flank = flip({ u: 3, v: 0, lu: 2, lv: 2 + stair.lv });
  return { unit, lower, upper, roles, entrance: { room: lowerMain.id, at: [at, 0], width: 1.6 },
    reservations: { lower: [stair, foot, flank], upper: [foot, flank] } };
}

function remainder(outline: [number, number][], cuts: UvRect[], id: string, kind: PlanRoom['kind'], unit: string): PlanRoom {
  const shapes = new RoomRegion(outline).subtract(cuts);
  if (shapes.length !== 1) throw new InteriorError('E_ASSIGNMENT_INVALID', `${id} cannot form one connected circulation/living region`);
  return { ...shapes[0]!, id, unit, kind, doors: [] };
}

function connect(room: PlanRoom, main: PlanRoom, ids: IdGen, width: number): void {
  const edges = sharedRoomEdges(room, main);
  const choices = edges.map((edge, index) => ({ index, span: edge.hi - edge.lo })).sort((a, b) => b.span - a.span);
  const chosen = choices.find(choice => choice.span >= width + .4);
  if (!chosen || !doorBetween(room, main.id, main, ids, width > 1.5 ? 2 : 1, width, .5, chosen.index))
    throw new InteriorError('E_ASSIGNMENT_INVALID', `${room.id} has no ${width} m doorway onto its private approach`);
}

function idsFor(unit: string): IdGen {
  let n = 0;
  const next = (kind: string) => `${unit}-${kind}-${n++}`;
  return { room: () => next('room'), door: () => next('door'), furniture: () => next('furniture'), light: () => next('light') };
}
