import type { Point } from "../core/geom.js";
import type { FloorInterior } from "../core/types.js";
import { DOOR } from "../layout/constants.js";
import { ENTRANCE_STANDOFF } from "./keep-out.js";

/** Circle versus actual oriented reservations, including chair footprints. */
export function standingBodyClear(floor:FloorInterior,p:Point,radius:number):boolean {
  for(const item of floor.furniture){
    if((item.elevation??0)>=1.8)continue;
    const rad=item.rotationDeg*Math.PI/180,dx=p[0]-item.position[0],dz=p[1]-item.position[1];
    if(rectDistance(dx*Math.cos(rad)-dz*Math.sin(rad),dx*Math.sin(rad)+dz*Math.cos(rad),item.size[0]/2,item.size[1]/2)<radius)return false;
  }
  for(const room of floor.rooms)for(const door of room.doors){
    const rad=door.angleDeg*Math.PI/180,dx=p[0]-door.position[0],dz=p[1]-door.position[1];
    const depth=door.kind==="openFront"||door.to==="outside"?Math.max(ENTRANCE_STANDOFF,door.clearDepth??0):Math.max(door.width/door.leaves,DOOR.clearance);
    if(rectDistance(dx*Math.cos(rad)+dz*Math.sin(rad),-dx*Math.sin(rad)+dz*Math.cos(rad),door.width/2+DOOR.jamb,depth)<radius)return false;
  }
  return true;
}
function rectDistance(x:number,z:number,hw:number,hd:number):number{return Math.hypot(Math.max(0,Math.abs(x)-hw),Math.max(0,Math.abs(z)-hd));}
