import type{PlanFurniture,PlanRoom}from'../../layout/plan-types.js';
import{roomCoversRect}from'../../layout/room-shape.js';
interface Placer{workstationAt?(at:[number,number],rotationDeg:0|90|180|270):PlanFurniture|null;}
/** The principal desk faces an arriving visitor; operator and visitor routes
 * remain beside the existing entry spine, without pinning the desk to a wall. */
export function executiveStation(room:PlanRoom,p:Placer):PlanFurniture|null{
  const entry=room.doors[0];if(!entry||!p.workstationAt)return null;
  const r=room.rect,e=entry.openFront?.position??entry.position??(entry.edge==='v0'?[entry.at,r.v]:entry.edge==='v1'?[entry.at,r.v+r.lv]:entry.edge==='u0'?[r.u,entry.at]:[r.u+r.lu,entry.at]);
  const inward:Record<string,[number,number]>={v0:[0,1],v1:[0,-1],u0:[1,0],u1:[-1,0]},n=inward[entry.edge]!;
  const rotation=n[1]>0?0:n[1]<0?180:n[0]>0?90:270;
  for(const depth of [3.2,2.7,3.8])for(const side of [-1.55,1.55,-2,2,0]){
    const at:[number,number]=[e[0]!+n[0]*depth+n[1]*side,e[1]!+n[1]*depth-n[0]*side];
    const center=[at[0]+n[0]*.4125,at[1]+n[1]*.4125],w=n[0]?1.95:2,d=n[0]?2:1.95;
    if(!roomCoversRect(room,{u:center[0]!-w/2,v:center[1]!-d/2,lu:w,lv:d},.1))continue;
    const desk=p.workstationAt(at,rotation);if(desk)return desk;
  }
  return null;
}
