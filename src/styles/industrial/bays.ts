import type { FurnitureKind } from '../../core/types.js';
import type { PlanFurniture, PlanRoom } from '../../layout/plan-types.js';
import type { UvRect } from '../../layout/uv.js';
import { roomCoversRect } from '../../layout/room-shape.js';
import { doorUvPoint } from '../../layout/plan-floor.js';

export interface IndustrialBayPlacer {
  placeAt?(kind:FurnitureKind,at:[number,number],rotationDeg?:0|90|180|270):PlanFurniture|null;
  seatAt(item:PlanFurniture,kind:'chair'|'office_chair',behind?:boolean):void;
}
const overlap=(a:UvRect,b:UvRect)=>a.u<b.u+b.lu&&a.u+a.lu>b.u&&a.v<b.v+b.lv&&a.v+a.lv>b.v;

/** A large service hall has legible work/storage bays and a continuous arrival
 * spine, not one empty hectare labelled 'receiving'. This is an authored program
 * adaptation: the reference images evidence equipment, not a measured factory plan. */
export function furnishIndustrialBays(room:PlanRoom,p:IndustrialBayPlacer):number{
  if(!p.placeAt)return 0;
  const r=room.rect,entries=room.doors.filter(d=>d.to==='outside'),primary=entries[0]??room.doors[0];
  if(!primary)return 0;
  const [eu,ev]=doorUvPoint(primary,room),alongU=primary.edge.startsWith('v');
  const spine:UvRect=alongU?{u:eu-2,v:r.v,lu:4,lv:r.lv}:{u:r.u,v:ev-2,lu:r.lu,lv:4};
  const arrivals=entries.map(door=>{
    const [u,v]=doorUvPoint(door,room);
    switch(door.edge){
      case 'v0':return{u:u-4,v,lu:8,lv:6};
      case 'v1':return{u:u-4,v:v-6,lu:8,lv:6};
      case 'u0':return{u,v:v-4,lu:6,lv:8};
      case 'u1':return{u:u-6,v:v-4,lu:6,lv:8};
    }
  });
  let placed=0;
  // Compact bays fit room geometry independently of the 40/60m exterior set.
  for(let row=0,v=r.v+4;v+3<r.v+r.lv-1;row++,v+=7.5){
    for(let col=0,u=r.u+4.1;u+3.2<r.u+r.lu-1;col++,u+=8.2){
      const bay={u:u-3.1,v:v-2.7,lu:6.2,lv:5.4};
      if(overlap(bay,spine)||arrivals.some(a=>overlap(bay,a))||!roomCoversRect(room,bay,.15))continue;
      // Every third bay is open rack storage; no random floor-crate grid.
      if((col+row)%3===0){
        for(const dz of [-1.45,1.45])for(const dx of [-1.05,1.05])
          if(p.placeAt('shelf',[u+dx,v+dz],dz<0?0:180))placed++;
      }else{
        for(const dx of [-1.25,1.25]){
          p.placeAt('shelf',[u+dx,v-2.25],0);
          const desk=p.placeAt('desk',[u+dx,v-.25],0);
          if(desk){p.seatAt(desk,'office_chair');placed++;}
        }
      }
    }
  }
  return placed;
}
