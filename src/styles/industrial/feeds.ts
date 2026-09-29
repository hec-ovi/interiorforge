import type { FloorInterior } from '../../core/types.js';
import { roomFootprintClearance } from '../../core/room-footprint.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { markIndustrialRoutes } from './wayfinding.js';
import type { Placement } from '../../placements/types.js';

/** Routes service-elevation cable sockets to an actual overhead tray in the same
 * room. The shortest valid feed wins; no route cuts a room hole or partition.
 * Drops remain above the equipment reservation; horizontal runs stay >=2.4m. */
export function placeIndustrialEquipmentFeeds(builder:PlacementBuilder,floor:Pick<FloorInterior,'rooms'> & Partial<Pick<FloorInterior,'furniture'>>):void{
  const trunks=builder.placements.filter(p=>p.module==='ceiling-services-industrial-bank'||p.module==='ceiling-services-industrial');
  const equipment=builder.placements.filter(p=>p.module==='fit-industrial-drive-bank');
  const world=(p:Placement,x:number,z:number):[number,number]=>[p.position[0]+x*Math.cos(p.rotationY)+z*Math.sin(p.rotationY),p.position[2]+z*Math.cos(p.rotationY)-x*Math.sin(p.rotationY)];
  for(const item of equipment){
    const room=floor.rooms.find(r=>r.id===item.room);if(!room)continue;
    const start=world(item,-.149*item.scale[0],.055*item.scale[2]);
    const base=item.position[1]+1.89*item.scale[1];
    const candidates=trunks.filter(t=>t.room===item.room).map(t=>{
      const tray=t.module==='ceiling-services-industrial-bank'?.27:.065;
      const anchor=world(t,0,tray),dx=Math.cos(t.rotationY),dz=-Math.sin(t.rotationY);
      const half=t.scale[0]*.25-.12;
      const along=Math.max(-half,Math.min(half,(start[0]-anchor[0])*dx+(start[1]-anchor[1])*dz));
      const end:[number,number]=[anchor[0]+dx*along,anchor[1]+dz*along];
      return {end,y:t.position[1]-.222,length:Math.hypot(end[0]-start[0],end[1]-start[1])};
    }).filter(c=>c.y>=2.4&&c.y>base+.1&&c.length>.12).sort((a,b)=>a.length-b.length);
    const route=candidates.find(c=>{
      const samples=Math.ceil(c.length/.1);
      for(let i=0;i<=samples;i++)if(roomFootprintClearance(room,[start[0]+(c.end[0]-start[0])*i/samples,start[1]+(c.end[1]-start[1])*i/samples])<.07)return false;
      return true;
    });if(!route)continue;
    builder.module('ceiling-services-industrial-feed-drop',item.room,[start[0],base,start[1]],[1,(route.y-base)/.5,1],item.rotationY);
    const angle=-Math.atan2(route.end[1]-start[1],route.end[0]-start[0]);
    builder.module('ceiling-services-industrial-feed-run',item.room,[(start[0]+route.end[0])/2,route.y,(start[1]+route.end[1])/2],[route.length/.5,1,1],angle);
    for(const point of [start,route.end])builder.module('ceiling-services-industrial-feed-joint',item.room,[point[0],route.y,point[1]],[1,1,1],angle);
    for(let y=base+.25;y<route.y-.12;y+=.65)builder.module('ceiling-services-industrial-feed-clamp',item.room,[start[0],y,start[1]],[1,1,1],item.rotationY);
  }
  markIndustrialRoutes(builder,floor);
}
