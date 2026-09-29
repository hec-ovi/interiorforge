import type { FloorKind, FurnitureKind } from '../../core/types.js';
import type { EdgeName, PlanFurniture, PlanRoom } from '../../layout/plan-types.js';
import { executiveStation } from './executive.js';
import { receptionPocket } from './reception.js';
import { roomArea } from '../../layout/room-shape.js';

export interface CorporatePlacer {
  placeAt?(kind: FurnitureKind, at:[number,number], rotationDeg?:0|90|180|270):PlanFurniture|null;
  workstation?():PlanFurniture|null;
  workstationAt?(at:[number,number],rotationDeg:0|90|180|270):PlanFurniture|null;
  anyEdge(kind: FurnitureKind, edges?: EdgeName[]): PlanFurniture | null;
  center(kind: FurnitureKind): PlanFurniture | null;
  wallPiece(kind: FurnitureKind, edges?: EdgeName[]): PlanFurniture | null;
  grid(kind: FurnitureKind, aisle: number, max: number): PlanFurniture[];
  seatAt(item: PlanFurniture, kind: 'chair' | 'office_chair', behind?: boolean): void;
  seatsAround(item: PlanFurniture, kind: 'chair' | 'office_chair', perSide?: number, sides?: readonly (0 | 90 | 180 | 270)[]): void;
}

/** Every operation uses the shared door/facade/circulation-aware placer. Wall storage
 * is installed before desk grids so an office actually retains its support facilities. */
export function furnishCorporate(room: PlanRoom, _floorKind: FloorKind, p: CorporatePlacer): boolean {
  const area = roomArea(room);
  switch (room.kind) {
    case 'reception': {
      const pocket=receptionPocket(room,p);
      const desk = pocket.desk??p.anyEdge('reception_desk', ['u0', 'u1', 'v1']);
      if (desk) p.seatAt(desk, 'office_chair', true);
      if(pocket.seats<1)p.anyEdge('sofa');
      if(area>=50&&pocket.seats<2)p.anyEdge('sofa');
      p.anyEdge('plant');
      p.wallPiece('wall_art');
      p.wallPiece('display_screen');
      return true;
    }
    case 'office_open': {
      p.anyEdge('counter');
      p.anyEdge('shelf');
      p.anyEdge('plant');
      // 1.8 m between desk rows accommodates the pulled-in chair and a clear aisle.
      for (const desk of p.grid('desk', 1.8, Math.max(2, Math.floor(area / 14)))) p.seatAt(desk, 'office_chair');
      p.wallPiece('display_screen');
      return true;
    }
    case 'meeting': {
      // A door-to-door navigation route can legitimately occupy the centre.
      const table = p.center('meeting_table') ?? p.grid('meeting_table', 1.4, 1)[0];
      if (table) p.seatsAround(table, 'office_chair', 3, [0, 180]);
      p.anyEdge('counter');
      p.wallPiece('display_screen');
      return true;
    }
    case 'office_private':
    case 'executive_office': {
      p.wallPiece('wall_art');
      const composed=room.kind==='executive_office'&&executiveStation(room,p);
      if(!composed){
        if(p.workstation)p.workstation();
        else{const desk=p.anyEdge('desk');if(desk)p.seatAt(desk,'office_chair');}
      }
      p.anyEdge('shelf');
      p.wallPiece('wall_shelf');
      if (area >= 28) p.anyEdge('sofa');
      p.anyEdge('plant');
      return true;
    }
    case 'storage':
      for (let i = 0; i < Math.min(8, Math.max(2, Math.floor(area / 10))); i++) p.anyEdge('shelf');
      return true;
    case 'corridor':
    case 'elevator_lobby':
    case 'concourse':
      if (area >= 10) p.wallPiece('wall_art');
      return true;
    default: return false;
  }
}
