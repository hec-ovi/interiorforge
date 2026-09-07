import type { Point } from "../../core/geom.js";
import { polygonArea } from "../../core/geom.js";
import type { LoftPlan } from "../../core/loft.js";
import type { PlanRoom } from "../plan-types.js";
import { roomCoversRect } from "../room-shape.js";
import { coversRect, uvToWorld, type Frame, type UvRect } from "../uv.js";

export interface FittedLoft { plan: LoftPlan; reserved: UvRect[]; solids: UvRect[]; room: PlanRoom }
const TYPES = new Set(["living","studio_main","office_open","executive_office","lounge"]);
const overlaps = (a: UvRect,b: UvRect): boolean => a.u < b.u+b.lu && a.u+a.lu > b.u && a.v < b.v+b.lv && a.v+a.lv > b.v;

/** Searches fitted end bays, with the stair completely outside the upper slab. */
export function fitLoft(rooms: readonly PlanRoom[], blocked: readonly UvRect[], frame: Frame,
  lowerFloor: number, upperFloor: number, baseY: number, upperY: number, ceilingY: number, upperOutline?: readonly Point[]): FittedLoft | null {
  if (upperY-baseY-.2 < 2.1 || ceilingY-upperY < 2.1) return null;
  const risers = Math.ceil((upperY-baseY)/.18), rise = (upperY-baseY)/risers, tread = .28;
  const run = (risers-1)*tread;
  for (const room of [...rooms].filter(r=>TYPES.has(r.kind)).sort((a,b)=>b.rect.lu*b.rect.lv-a.rect.lu*a.rect.lv)) {
    for (const turn of [false,true]) for (const reverse of [false,true]) for (const side of [false,true]) {
      const r=room.rect, u0=Math.ceil((r.u+.2)*2)/2,v0=Math.ceil((r.v+.2)*2)/2;
      const lu=Math.floor((r.u+r.lu-.2-u0)*2)/2,lv=Math.floor((r.v+r.lv-.2-v0)*2)/2;
      const availableWidth=turn?lv:lu,w=Math.min(10,availableWidth),d=turn?lu:lv,depth=3.5;
      if(w<4.5 || d<depth+run+1.2 || depth/d>.45)continue;
      const uv=(x:number,z:number):Point => {
        const px=side?availableWidth-x:x,pz=reverse?d-z:z;
        return turn?[u0+pz,v0+px]:[u0+px,v0+pz];
      };
      const rect=(x:number,z:number,width:number,length:number):UvRect=>{
        const a=uv(x,z),b=uv(x+width,z+length);
        return {u:Math.min(a[0],b[0]),v:Math.min(a[1],b[1]),lu:Math.abs(b[0]-a[0]),lv:Math.abs(b[1]-a[1])};
      };
      const platform=rect(0,d-depth,w,depth),bottom=d-depth-run;
      const stair=rect(w-1.4,bottom,1.4,run),approach=rect(w-1.4,bottom-1.2,1.4,1.2);
      const supports=[rect(.05,d-depth+.05,.15,.15),rect(.05,d-.2,.15,.15),rect(w-.2,d-.2,.15,.15)];
      const solids=[stair,...supports];
      if (![platform,stair,approach,...supports].every(part=>roomCoversRect(room,part,.12))) continue;
      if (upperOutline && ![platform,stair].every(part=>coversRect(upperOutline,part))) continue;
      if (solids.some(part=>blocked.some(zone=>overlaps(part,zone)))) continue;
      const world=(x:number,z:number)=>uvToWorld(uv(x,z),frame);
      let ring=[world(0,d-depth),world(w,d-depth),world(w,d),world(0,d)];
      if(polygonArea(ring)<0)ring=ring.reverse();
      const start=world(w-.7,bottom),end=world(w-.7,d-depth);
      const lowerEntry=world(w-.7,bottom-.6),upperEntry=world(w-.7,d-depth+.65);
      // An open cross aisle joins the bottom landing to the room's central circulation.
      const aisle=rect(0,bottom-1.2,w,1.2);
      return {plan:{id:`loft-${lowerFloor}`,lowerRoom:room.id,upperRoom:`f${upperFloor}-loft`,upperFloor,
        platform:ring,elevation:upperY,thickness:.2,
        supports:supports.map(p=>uvToWorld([p.u+p.lu/2,p.v+p.lv/2],frame)),
        stair:{start,direction:[(end[0]-start[0])/run,(end[1]-start[1])/run],width:1.4,run,risers,rise,tread,lowerEntry,upperEntry}},
        reserved:[...solids,approach,aisle],solids,room};
    }
  }
  return null;
}
