import { clipPolygonToRect, polygonArea, polygonBounds, type Point } from '../core/geom.js';
import type { BlueprintFloor, InteriorRequest, RoomKind } from '../core/types.js';
import type { CorePlan } from './core-plan.js';
import { FacadeSeats, facadeSlots } from './facade-seats.js';
import { RoomRegion } from './room-region.js';
import { roomCoversRect, sharedRoomEdges } from './room-shape.js';
import { doorBetween, type IdGen } from './rooms.js';
import type { FloorFrame, PlanRoom } from './plan-types.js';
import { coreRectsOf } from './pier-align.js';
import { uvRectCorners, worldToUv, type UvRect } from './uv.js';

export interface ResidentialGround {
  rooms: PlanRoom[];
  /** Complete allocations removed from the remaining shared circulation region. */
  occupied: UvRect[];
}

/** A residential arrival has a front-of-house sequence and an aligned service back.
 * Two glazed residents' rooms flank its entrance; the middle stays a broad reception
 * and a three-metre cross approach to the core. Staff, mail and washrooms stand in
 * the rear wings and behind the stable shafts, each reached from public circulation.
 * Unsupported shallow/side-entry plates retain the ordinary service planner. */
export function planResidentialGround(request: InteriorRequest, floor: BlueprintFloor, core: CorePlan,
  frame: FloorFrame, corridor: PlanRoom, plate: Point[], outline: Point[], approaches: UvRect[], ids: IdGen): ResidentialGround | null {
  if (request.building.type !== 'residential' || !['rich', 'high_rich'].includes(request.building.tier)) return null;
  const bounds = polygonBounds(plate);
  const frontDepth = frame.corridor.v - bounds.z;
  if (bounds.w < 26 || frontDepth < 11) return null;
  const entrance = floor.openings.find(opening => opening.kind === 'door' && opening.doorRole === 'main')
    ?? floor.openings.find(opening => opening.kind === 'door' || opening.kind === 'openFront');
  if (!entrance) return null;
  const a = worldToUv(floor.outline[entrance.edge]!, core.frame);
  const b = worldToUv(floor.outline[(entrance.edge + 1) % floor.outline.length]!, core.frame);
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // The core planner's front strip must be the actual street side, not a guessed
  // southern room on a side-entry or reverse-entry shell.
  if ((b[0] - a[0]) / length < 0.95 || Math.abs((a[1] + b[1]) / 2 - bounds.z) > 2) return null;
  const entryU = a[0] + (b[0] - a[0]) * (entrance.offset + entrance.width / 2) / length;
  const front: UvRect = { u: bounds.x, v: bounds.z, lu: bounds.w, lv: frontDepth };
  const seats = new FacadeSeats(floor, core.frame, outline, request.blueprint.facade!);
  const cuts = seats.cuts(front, 'v1', 3);
  const closest = (target: number, low: number, high: number) => cuts.filter(cut => cut >= low && cut <= high)
    .sort((x, y) => Math.abs(x - target) - Math.abs(y - target))[0];
  const leftStart = closest(bounds.x + 3, bounds.x + 2.5, entryU - 10);
  const leftEnd = closest(entryU - 4, bounds.x + 9, entryU - 3.5);
  const rightStart = closest(entryU + 4, entryU + 3.5, bounds.x + bounds.w - 9);
  const rightEnd = closest(bounds.x + bounds.w - 3, entryU + 10, bounds.x + bounds.w - 2.5);
  if ([leftStart, leftEnd, rightStart, rightEnd].some(value => value === undefined)) return null;
  const loungeDepth = Math.min(13, frontDepth - 3);
  const loungeRects: UvRect[] = [[leftStart!, leftEnd!], [rightStart!, rightEnd!]].map(([low, high]) => ({
    u: low!, v: bounds.z, lu: high! - low!, lv: loungeDepth,
  }));
  const inside = (rect: UvRect) => roomCoversRect({ rect: front, polygon: plate }, rect);
  if (loungeRects.some(rect => rect.lu < 6 || !inside(rect) || approaches.some(cut => overlaps(rect, cut)))) return null;
  const receptionShapes = new RoomRegion(clipPolygonToRect(plate, toRect(front))).subtract(loungeRects);
  if (receptionShapes.length !== 1) return null;
  const reception: PlanRoom = { ...receptionShapes[0]!, id: ids.room(), kind: 'reception', doors: [] };
  const rooms: PlanRoom[] = [reception];
  loungeRects.forEach((rect, index) => {
    const lounge: PlanRoom = { id: ids.room(), kind: 'lounge', rect, polygon: uvRectCorners(rect), doors: [] };
    const facing = index === 0 ? 'u1' : 'u0';
    const stretch = sharedRoomEdges(lounge, reception).findIndex(edge => edge.edge === facing);
    if (stretch < 0) return;
    doorBetween(lounge, reception.id, reception, ids, 2, 2.4, 0.5, stretch);
    rooms.push(lounge);
  });
  if (rooms.length !== 3 || !doorBetween(reception, corridor.id, corridor, ids, 4, 3.6)) return null;

  const occupied: UvRect[] = [front];
  const coreSolids = coreRectsOf(core);
  const add = (kind: RoomKind, rect: UvRect): void => {
    if (rect.lu < 2.5 || rect.lv < 3 || !inside(rect)
      || [...occupied, ...coreSolids, corridor.rect, ...approaches].some(cut => overlaps(rect, cut))) return;
    rooms.push({ id: ids.room(), kind, rect, polygon: uvRectCorners(rect), doors: [] });
    occupied.push(rect);
  };
  // Detached service wings keep 2.5m circulation on both sides; their partitions
  // never terminate in side-facade glass. Wider wings gain staff workspace.
  const wingBottom = frame.coreBlock.v;
  const wingTop = Math.floor((bounds.z + bounds.d - 3) * 2) / 2;
  const wings = [
    { low: Math.ceil((bounds.x + 2.5) * 2) / 2, high: Math.floor((core.u0 - 2.5) * 2) / 2, left: true },
    { low: Math.ceil((core.u1 + 2.5) * 2) / 2, high: Math.floor((bounds.x + bounds.w - 2.5) * 2) / 2, left: false },
  ];
  for (const wing of wings) {
    if (wing.high - wing.low < 2.5 || wingTop - wingBottom < 8) continue;
    const split = Math.min(wingTop - 3, wingBottom + 6);
    add(wing.left ? 'office_private' : 'storage', { u: wing.low, v: wingBottom, lu: wing.high - wing.low, lv: split - wingBottom });
    add(wing.left ? 'kitchen' : 'mechanical_room', { u: wing.low, v: split, lu: wing.high - wing.low, lv: wingTop - split });
  }
  const rearV = Math.ceil((Math.max(...coreSolids.map(rect => rect.v + rect.lv)) + 3) * 2) / 2;
  const rear: UvRect = { u: core.u0, v: rearV, lu: core.u1 - core.u0, lv: bounds.z + bounds.d - rearV };
  if (rear.lv >= 4) {
    const rearCuts = seats.cuts(rear, 'v0', 3);
    const slots = facadeSlots(rearCuts, 6, (low, high) => high - low >= 3.5 && high - low <= 8
      && inside({ ...rear, u: low, lu: high - low }));
    const kinds: RoomKind[] = ['toilets', 'meeting', 'storage'];
    slots.slice(0, kinds.length).forEach(([low, high], index) => add(kinds[index]!, { ...rear, u: low, lu: high - low }));
  }
  return { rooms, occupied };
}

function overlaps(a: UvRect, b: UvRect): boolean {
  return Math.min(a.u + a.lu, b.u + b.lu) - Math.max(a.u, b.u) > 1e-6
    && Math.min(a.v + a.lv, b.v + b.lv) - Math.max(a.v, b.v) > 1e-6;
}
function toRect(rect: UvRect) { return { x: rect.u, z: rect.v, w: rect.lu, d: rect.lv }; }
