import type { FloorInterior } from '../../core/types.js';
import { roomFootprintClearance } from '../../core/room-footprint.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { Point } from '../../core/geom.js';

/** Fine painted boundaries lead from the actual arrival to the actual core door.
 * Markings occupy an existing clear route; they never invent a route through
 * furniture, partitions or an excluded room ring. */
export function markIndustrialRoutes(builder:PlacementBuilder,floor:Pick<FloorInterior,'rooms'> & Partial<Pick<FloorInterior,'furniture'>>):void{
  for(const room of floor.rooms){
    if(room.kind!=='mechanical_room')continue;
    const entry=room.doors.find(d=>d.to==='outside');if(!entry)continue;
    const target=room.doors.filter(d=>d.to!=='outside').sort((a,b)=>Math.hypot(a.position[0]-entry.position[0],a.position[1]-entry.position[1])-Math.hypot(b.position[0]-entry.position[0],b.position[1]-entry.position[1]))[0];
    if(!target)continue;
    const dx=target.position[0]-entry.position[0],dz=target.position[1]-entry.position[1],distance=Math.hypot(dx,dz);
    if(distance<5)continue;
    const u=dx/distance,v=dz/distance;
    const at=(t:number,side:number):Point=>{
      const width=1.5*(1-t)+Math.max(.35,target.width/2-.15)*t;
      const along=.9+(distance-1.4)*t;
      return[entry.position[0]+u*along-v*width*side,entry.position[1]+v*along+u*width*side];
    };
    const objects=(floor.furniture??[]).filter(f=>f.room===room.id&&(f.elevation??0)<.1);
    const clear=(p:Point)=>roomFootprintClearance(room,p)>=.07&&!objects.some(f=>{
      const a=f.rotationDeg*Math.PI/180,x=p[0]-f.position[0],z=p[1]-f.position[1];
      return Math.abs(x*Math.cos(a)-z*Math.sin(a))<f.size[0]/2+.1&&Math.abs(x*Math.sin(a)+z*Math.cos(a))<f.size[1]/2+.1;
    });
    for(const side of [-1,1]){
      const samples=Math.ceil(distance/.15);
      if(Array.from({length:samples+1},(_,i)=>at(i/samples,side)).some(p=>!clear(p)))continue;
      const a=at(0,side),b=at(1,side),length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      builder.module('floor-industrial-route-line',room.id,[(a[0]+b[0])/2,0,(a[1]+b[1])/2],[length/.5,1,1],-Math.atan2(b[1]-a[1],b[0]-a[0]));
    }
  }
}
