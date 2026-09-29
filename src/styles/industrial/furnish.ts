import type { FloorKind, FurnitureKind } from '../../core/types.js';
import type { EdgeName, PlanFurniture, PlanRoom } from '../../layout/plan-types.js';
import { furnishIndustrialBays, type IndustrialBayPlacer } from './bays.js';
import { roomArea } from '../../layout/room-shape.js';

/** Uses the shared collision-aware room placer: every item obeys door sweeps,
 * exterior reservations, circulation routes, room holes and the facade depth. */
export interface IndustrialPlacer extends IndustrialBayPlacer {
  anyEdge(kind: FurnitureKind, edges?: EdgeName[]): PlanFurniture | null;
  wallPiece(kind: FurnitureKind, edges?: EdgeName[]): PlanFurniture | null;
  grid(kind: FurnitureKind, aisle: number, max: number): PlanFurniture[];
  seatAt(item: PlanFurniture, kind: 'chair' | 'office_chair', behind?: boolean): void;
}

/** true means the room is fully furnished here; false leaves sanitary and unrelated
 * room programs to the shared placer. A factory's entrance keeps its central logistics
 * route open. Supplies stand on racks and wall benches rather than littering its floor. */
export function furnishIndustrial(room: PlanRoom, _floorKind: FloorKind, p: IndustrialPlacer): boolean {
  const area = roomArea(room);
  switch (room.kind) {
    case 'mechanical_room': {
      p.anyEdge('counter');
      if(area >= 35) p.anyEdge('ornament_wall');
      if(area >= 80) p.anyEdge('room_divider');
      for (let i = 0; i < Math.min(6, Math.max(1, Math.floor(area / 35))); i++) p.anyEdge('shelf');
      p.wallPiece('wall_art');
      p.wallPiece('display_screen');
      // Work/storage bays leave a four-metre entrance spine and six-metre
      // receiving pocket clear; shared fitting still enforces every core route.
      if(area>=180)furnishIndustrialBays(room,p);
      else if(!room.doors.some(door=>door.to==='outside')&&area>=48){
        for(const bench of p.grid('desk',2.1,Math.min(4,Math.floor(area/35))))p.seatAt(bench,'office_chair');
      }
      if (area >= 24) p.anyEdge('crate');
      p.wallPiece('wall_shelf');
      return true;
    }
    case 'storage':
      for (let i = 0; i < Math.min(10, Math.max(2, Math.floor(area / 12))); i++) p.anyEdge('shelf');
      // Wall-bound cases retain an unambiguous centre route between all doors.
      for (let i = 0; i < Math.min(4, Math.floor(area / 18)); i++) p.anyEdge('crate');
      p.wallPiece('wall_art');
      return true;
    case 'reception': {
      // Dispatch is off-axis; the first view is the onward route to the core.
      const desk = p.anyEdge('reception_desk', ['u0', 'u1', 'v1']);
      if (desk) p.seatAt(desk, 'office_chair', true);
      p.anyEdge('bench');
      if (area > 50) p.anyEdge('bench');
      p.wallPiece('display_screen');
      p.wallPiece('wall_art');
      return true;
    }
    case 'locker_room':
      p.anyEdge('wardrobe');
      if (area >= 22) p.anyEdge('wardrobe');
      p.anyEdge('bench');
      p.wallPiece('wall_art');
      return true;
    case 'corridor':
    case 'concourse':
    case 'elevator_lobby':
      // Navigation and maintenance panels are shallow wall fittings, never islands.
      if (area >= 14) p.wallPiece('wall_art');
      return true;
    case 'parking_area':
      p.wallPiece('wall_art');
      return true;
    default:
      return false;
  }
}
