import { standingBodyClear } from "./placement-clearance.js";
import type { Point } from "../core/geom.js";
import { roomFootprintAnchor,roomFootprintClearance } from "../core/room-footprint.js";
import { segmentDistance } from "../core/segment-sweep.js";
import type { Anchor,FloorInterior,NpcPlacement,RoleSlot,Room } from "../core/types.js";
import type { WalkGrid } from "../core/grid.js";
import type { BuildingPlan } from "../layout/index.js";
import { SPINE_KINDS } from "../layout/constants.js";
import { DoorKeepOut } from "./keep-out.js";
import { roomFloodStart } from "./anchor-placement.js";
import { occupy } from "./placement-grid.js";

const RADIUS=.3;
const STORY_ROOMS=new Set(["reception","lounge","living","studio_main","office_open","executive_office","dining_area","bar","counter_area","sales_floor","gym_floor","bedroom","kitchen","bathroom","toilets","locker_room","storage","mechanical_room","terrace_open","parking_area"]);

export function buildPlacements(plan:BuildingPlan,anchors:readonly Anchor[],roles:readonly RoleSlot[]):NpcPlacement[] {
  const placements:NpcPlacement[]=[];
  for(const floor of plan.floors){
    if(!floor.rooms.length)continue;
    const fitter=new PlacementFitter(plan,floor);
    if(!fitter.start)continue;
    for(const anchor of anchors.filter(a=>a.floor===floor.floor&&a.kind==="counter_spot")){
      const role=roles.find(r=>r.homeAnchor===anchor.id),room=floor.rooms.find(r=>r.id===anchor.room)!;
      const purpose=role&&["vendor","clerk","barista"].includes(role.role)?"vendor":"staff";
      const result=fitter.fit(room,anchor.position,anchor.facingDeg,`${anchor.furniture??anchor.id}-npc`,purpose);
      if(result)placements.push({...result,anchor:anchor.id,...(role?{role:role.id}:{})});
    }
    for(const room of floor.rooms.filter(r=>STORY_ROOMS.has(r.kind))){
      const center=roomFootprintAnchor(room);
      for(const position of fitter.candidates(room)){
        const facing=(Math.atan2(center[0]-position[0],center[1]-position[1])*180/Math.PI+360)%360;
        const result=fitter.fit(room,position,facing,`${room.id}-story-npc`,"story");
        if(result){placements.push(result);break;}
      }
    }
  }
  return placements;
}

class PlacementFitter {
  readonly start:Point|null;
  private grid:WalkGrid;
  private readonly doors:DoorKeepOut;
  private readonly accepted:NpcPlacement[]=[];
  private readonly targets:Point[];
  private readonly paths:Point[][];
  private readonly bodyWidth:number;
  constructor(plan:BuildingPlan,private readonly floor:FloorInterior){
    this.grid=plan.navGrids.get(floor.floor)!;this.doors=new DoorKeepOut(floor);
    const lower=plan.floors.find(f=>f.floor===floor.mezzanineOf),spine=floor.rooms.find(r=>SPINE_KINDS.has(r.kind));
    this.start=lower?.loft?.stair.upperEntry??(spine?roomFloodStart(this.grid,spine):null);
    const circulation=plan.circulation.get(floor.floor);
    this.paths=circulation?.routes.map(r=>r.points)??[];this.bodyWidth=circulation?.bodyWidth??.6;
    this.targets=[...(circulation?.endpoints.map(e=>e.position)??[]),
      ...(floor.loft?[floor.loft.stair.lowerEntry]:[]),...(this.start?[this.start]:[])].filter(p=>this.grid.isWalkableAt(p));
  }
  *candidates(room:Room):Generator<Point>{
    const points:Point[]=[];
    for(let row=0;row<this.grid.rows;row++)for(let col=0;col<this.grid.cols;col++){
      if(!this.grid.isWalkable(col,row))continue;
      const p=this.grid.center(col,row),clear=roomFootprintClearance(room,p);
      if(clear>=.5&&clear<=1.25)points.push(p);
    }
    points.sort((a,b)=>roomFootprintClearance(room,a)-roomFootprintClearance(room,b)||a[0]-b[0]||a[1]-b[1]);
    yield* points;
  }
  fit(room:Room,position:Point,facingDeg:number,id:string,purpose:NpcPlacement["purpose"]):NpcPlacement|null {
    if(!this.start||!this.grid.isWalkableAt(position)||roomFootprintClearance(room,position)<RADIUS)return null;
    if(!standingBodyClear(this.floor,position,RADIUS))return null;
    if(this.paths.some(path=>path.slice(1).some((b,i)=>segmentDistance(position,position,path[i]!,b)<RADIUS+this.bodyWidth/2)))return null;
    if(this.accepted.some(slot=>Math.hypot(slot.position[0]-position[0],slot.position[1]-position[1])<1.2))return null;
    const occupied=occupy(this.grid,position,RADIUS),visited=occupied.flood(this.start);
    if(!this.targets.every(p=>occupied.reaches(visited,p))||!this.accepted.every(s=>occupied.reaches(visited,s.approach)))return null;
    const rad=facingDeg*Math.PI/180;
    for(const distance of [.9,1.3,1.8])for(const offset of [0,Math.PI/2,-Math.PI/2,Math.PI]){
      const approach:Point=[Math.round((position[0]+Math.sin(rad+offset)*distance)*100)/100,Math.round((position[1]+Math.cos(rad+offset)*distance)*100)/100];
      if(roomFootprintClearance(room,approach)<.3||!occupied.reaches(visited,approach)||!this.doors.clear(approach))continue;
      const result:NpcPlacement={id,purpose,floor:this.floor.floor,room:room.id,position,facingDeg,radius:RADIUS,approach};
      this.grid=occupied;this.accepted.push(result);return result;
    }
    return null;
  }
}
