import { polygonArea, type Point } from '../core/geom.js';
import type { RoomKind, Tier } from '../core/types.js';
import type { PlanRoom } from './plan-types.js';
import { RoomRegion } from './room-region.js';
import { roomCoversRect, sharedRoomEdges } from './room-shape.js';
import { doorBetween, MIN_STRETCH, type IdGen } from './rooms.js';
import { uvRectCorners, type UvRect } from './uv.js';

/** Gross allocation targets of the generous residential program. Legal shell
 * seats and actual plate depth remain authoritative; these are not clear-room areas. */
export function residentialTarget(tier: Tier): number {
  return tier === 'rich' || tier === 'high_rich' ? 150 : 75;
}

/** Prefer ten-metre dwellings on deep plates. Only leave an inboard public band when
 * it is at least 3m wide; a thin leftover cannot carry a useful entrance or corridor. */
export function residentialEnvelope(rect: UvRect, side: 'v0' | 'v1'): UvRect {
  const depth = rect.lv >= 13 ? 10 : rect.lv;
  return { ...rect, v: side === 'v0' ? rect.v + rect.lv - depth : rect.v, lv: depth };
}

/** A connected living/entry room with wet rooms on the service edge and bedrooms at
 * daylight. All bedroom partitions that meet glass use the shell's legal facade seats.
 * Tapered or narrow units retain the established studio fallback if this cannot fit. */
export function residentialProgram(rect: UvRect, side: 'v0' | 'v1', polygon: Point[],
  legalCuts: readonly number[], tier: Tier, unit: string, ids: IdGen): PlanRoom[] | null {
  const luxury = residentialTarget(tier) === 150;
  // Keep a real cross-room approach between the bedroom and the service band.
  // A half-metre residual slot is geometrically connected but cannot carry a person.
  if (rect.lu < (luxury ? 13 : 7) || rect.lv < (luxury ? 10 : 9)) return null;
  const near = (u: number, width: number, depth: number): UvRect => ({ u,
    v: side === 'v0' ? rect.v : rect.v + rect.lv - depth, lu: width, lv: depth });
  const far = (u: number, width: number, depth: number): UvRect => ({ u,
    v: side === 'v0' ? rect.v + rect.lv - depth : rect.v, lu: width, lv: depth });
  const width = luxury ? 5.5 : 3.5;
  const bedroomCuts = legalCuts.filter(cut => cut - rect.u >= (luxury ? 5 : 3.5)
    && rect.u + rect.lu - cut >= (luxury ? 7.5 : 3.5))
    .sort((a, b) => Math.abs(a - rect.u - width) - Math.abs(b - rect.u - width));
  const split = bedroomCuts[0];
  if (split === undefined) return null;
  const parts: { kind: RoomKind; rect: UvRect }[] = [
    { kind: 'bathroom', rect: near(rect.u, luxury ? 3.5 : 2.5, luxury ? 3.5 : 3) },
    { kind: 'kitchen', rect: near(rect.u + rect.lu - (luxury ? 4 : 3), luxury ? 4 : 3, luxury ? 4 : 3) },
    { kind: 'bedroom', rect: far(rect.u, split - rect.u, luxury ? 5 : 4.5) },
  ];
  if (luxury) {
    parts.push({ kind: 'bathroom', rect: near(rect.u + 3.5, 3, 3.5) });
    // Storage stays on the service edge and leaves a clear, direct entry beside it.
    if (rect.lu >= 15) parts.push({ kind: 'storage', rect: near(rect.u + 6.5, 2, 2) });
    const guestCut = legalCuts.filter(cut => cut - split >= 3
      && rect.u + rect.lu - cut >= 4.5 && rect.u + rect.lu - cut <= 6)
      .sort((a, b) => Math.abs(rect.u + rect.lu - a - 4.5) - Math.abs(rect.u + rect.lu - b - 4.5))[0];
    if (guestCut !== undefined) {
      parts.push({ kind: 'bedroom', rect: far(guestCut, rect.u + rect.lu - guestCut, 4.5) });
    }
  } else if (rect.lv >= 9.5) {
    const storage = near(rect.u, 2, 4.5);
    storage.lv = 1.5;
    if (side === 'v0') storage.v += 3;
    parts.push({ kind: 'storage', rect: storage });
  }
  if (parts.some(part => !roomCoversRect({ rect, polygon }, part.rect))) return null;
  const remaining = new RoomRegion(polygon).subtract(parts.map(part => part.rect));
  if (remaining.length !== 1) return null;
  const mainShape = remaining[0]!;
  if (Math.abs(polygonArea(mainShape.polygon!)) < (luxury ? 36 : 22.5)) return null;
  // Every private function opens straight onto living/entry; nobody crosses a bedroom
  // or bathroom to reach the kitchen, storage or another bedroom.
  if (parts.some(part => !sharedRoomEdges(part, mainShape).some(edge => edge.hi - edge.lo >= MIN_STRETCH))) return null;
  const main: PlanRoom = { ...mainShape, id: ids.room(), kind: 'living', unit, doors: [] };
  const rooms = [main, ...parts.map(part => ({ ...part, polygon: uvRectCorners(part.rect),
    id: ids.room(), unit, doors: [] } as PlanRoom))];
  for (const room of rooms.slice(1)) {
    const edges = sharedRoomEdges(room, main);
    const stretch = edges.reduce((best, edge, index) => edge.hi - edge.lo > edges[best]!.hi - edges[best]!.lo ? index : best, 0);
    doorBetween(room, main.id, main, ids, room.kind === 'kitchen' ? 2 : 1,
      room.kind === 'kitchen' ? 1.6 : 0.9, 0.5, stretch);
  }
  return rooms;
}
