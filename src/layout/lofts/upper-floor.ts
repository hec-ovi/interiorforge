import { boundaryDistance, polygonBounds } from "../../core/geom.js";
import { WalkGrid } from "../../core/grid.js";
import type { BlueprintFloor, FloorInterior, InteriorRequest } from "../../core/types.js";
import { createRng } from "../../core/rng.js";
import { CELL, AGENT_RADIUS } from "../constants.js";
import type { CorePlan } from "../core-plan.js";
import { furnish } from "../furnish.js";
import { furnitureLights } from "../furniture-lights.js";
import { planLights } from "../lighting.js";
import { furnitureUvRect } from "../navgrid.js";
import { furnitureToWorld, type PlannedFloor } from "../plan-floor.js";
import type { PlanRoom } from "../plan-types.js";
import { idGen } from "../rooms.js";
import { worldToUv } from "../uv.js";
import { blockLoftSolids } from "./grid.js";

export function planUpperLoft(lower: FloorInterior, floor: BlueprintFloor, core: CorePlan, request: InteriorRequest): PlannedFloor {
  const loft=lower.loft!, polygon=loft.platform.map(p=>worldToUv(p,core.frame));
  const b=polygonBounds(polygon), ids=idGen(floor.index);
  const parent=lower.rooms.find(r=>r.id===loft.lowerRoom)!;
  const room: PlanRoom={id:loft.upperRoom,kind:parent.kind.startsWith("office")||parent.kind==="executive_office"?"lounge":"bedroom",
    rect:{u:b.x,v:b.z,lu:b.w,lv:b.d},polygon,doors:[],...(parent.unit?{unit:parent.unit}:{})};
  const edge=worldToUv(loft.stair.upperEntry,core.frame), direction=loft.stair.direction;
  const alongU=Math.abs(direction[0]*core.frame.cos+direction[1]*core.frame.sin)>.5;
  const entry={u:edge[0]-.8,v:edge[1]-.8,lu:1.6,lv:1.6};
  const strip=alongU?{u:entry.u,v:b.z,lu:1.6,lv:b.d}:{u:b.x,v:entry.v,lu:b.w,lv:1.6};
  const furniture=furnish([room],"residence_studio",createRng(request.seed,"loft",floor.index),ids,
    {outline:polygon,inner:polygon,facadeDepth:0},[strip],request.building.tier);
  const grid=WalkGrid.forPolygon(loft.platform,CELL,polygonBounds(loft.platform));
  for(let row=0;row<grid.rows;row++)for(let col=0;col<grid.cols;col++)
    if(boundaryDistance(grid.center(col,row),loft.platform)<AGENT_RADIUS)grid.set(col,row,false);
  blockLoftSolids(grid,furniture.filter(f=>(f.elevation??0)<1.8).map(furnitureUvRect),core.frame);
  const ceilingElevation=lower.ceilingElevation;
  const lights=[...planLights([room],core,polygon,ceilingElevation,ceilingElevation,ids,request.building.tier)
    .filter(l=>l.room===room.id),...furnitureLights(furniture,core.frame,floor.elevation,request.building.tier)];
  return {grid,uv:{outline:floor.outline.map(p=>worldToUv(p,core.frame)),rooms:[room],furniture,sealed:[]},
    interior:{floor:floor.index,kind:lower.kind,elevation:floor.elevation,height:floor.height,ceilingElevation,
      coreAngleDeg:core.frame.angleDeg,core:{stairs:[],elevators:[],shafts:[]},openingReservations:[],
      mezzanineOf:lower.floor,rooms:[{id:room.id,kind:room.kind,polygon:loft.platform,doors:[],...(room.unit?{unit:room.unit}:{})}],
      furniture:furniture.map(f=>furnitureToWorld(f,core.frame)),lights}};
}
