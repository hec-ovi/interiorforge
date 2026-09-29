import type{FurnitureKind}from'../../core/types.js';
import type{PlanFurniture,PlanRoom}from'../../layout/plan-types.js';
import{roomCoversRect}from'../../layout/room-shape.js';
interface Placer{placeAt?(kind:FurnitureKind,at:[number,number],rotation?:0|90|180|270):PlanFurniture|null;}
/** Reception belongs to the arrival pocket, not a remote arbitrary perimeter corner.
 * Work/queue envelopes remain inside the true room; shared fitting checks core paths. */
export function receptionPocket(room:PlanRoom,p:Placer):{desk:PlanFurniture|null;seats:number}{
  const entry=room.doors.find(d=>d.to==='outside');if(!entry||!p.placeAt)return{desk:null,seats:0};
  const r=room.rect;
  const e=entry.openFront?.position??entry.position??(entry.edge==='v0'?[entry.at,r.v]:entry.edge==='v1'?[entry.at,r.v+r.lv]:entry.edge==='u0'?[r.u,entry.at]:[r.u+r.lu,entry.at]);
  const inward:Record<string,[number,number]>={v0:[0,1],v1:[0,-1],u0:[1,0],u1:[-1,0]},n=inward[entry.edge]!;
  const at=(side:number,depth:number):[number,number]=>[e[0]+n[1]*side+n[0]*depth,e[1]-n[0]*side+n[1]*depth];
  const facing=entry.edge==='v0'?180:entry.edge==='v1'?0:entry.edge==='u0'?270:90;
  let desk:PlanFurniture|null=null;
  for(const depth of [5.5,4.5,7]){for(const side of [4,-4,5.5,-5.5]){
    const center=at(side,depth),alongV=facing===0||facing===180;
    const envelope={u:center[0]-(alongV?1.65:1.6),v:center[1]-(alongV?1.6:1.65),lu:alongV?3.3:3.2,lv:alongV?3.2:3.3};
    if(!roomCoversRect(room,envelope,.1))continue;
    desk=p.placeAt('reception_desk',center,facing);if(desk)break;
  }if(desk)break;}
  let seats=0;
  for(const side of [-6.6,6.6]){
    const direction:[number,number]=side<0?[n[1],-n[0]]:[-n[1],n[0]];
    const rotation=direction[1]>0?0:direction[1]<0?180:direction[0]>0?90:270;
    if(p.placeAt('sofa',at(side,3.4),rotation))seats++;
  }
  for(const side of [-6.6,6.6])p.placeAt('ornament_wall',at(side,7.5),facing);
  return{desk,seats};
}
