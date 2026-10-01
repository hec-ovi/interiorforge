import { LIFT_CAR, LIFT_LANDING, LIFT_SHAFT_FRONT } from '../geometry/lift-spec.js';
import { elevatorDoorHole } from '../geometry/core-geo.js';
import type { LightFixture } from '../core/types.js';
import type { CorePlan } from '../layout/core-plan.js';
import { uvToWorld } from '../layout/uv.js';
import type { PlacementBuilder } from './builder.js';
import { surface } from './surfaces.js';

/** One moving cab per shaft, with independently published front and rear doors.
 * Landing leaves, reveals and full-height shaft cheeks remain on their floor. */
export function lifts(builder:PlacementBuilder,core:CorePlan,floorModule:string,room:string,minimumStoreyHeight:number,storeyHeight=minimumStoreyHeight,elevation=0,
  surround={jamb:'lift-landing-jamb',header:'lift-landing-header'}, rearLanding=false):LightFixture[]{
  // A through car opens its back doors only on floors whose plan keeps the back public; on the
  // others its back stands closed against a solid shaft lining.
  const rearServed=!!core.openPlan&&rearLanding;
  const lights:LightFixture[]=[], angle=-core.frame.angleDeg*Math.PI/180;
  const heightScale=Math.min(1,(minimumStoreyHeight-.15)/(LIFT_CAR.ceiling+LIFT_CAR.roof));
  for(const [index,elevator] of core.elevators.entries()){
    const r=elevator.rect,width=r.lu-.2,depth=r.lv-.2;
    const world=(u:number,v:number)=>uvToWorld([u,v],core.frame);
    const mid=r.u+r.lu/2,[x,z]=world(mid,r.v+r.lv/2);
    const car=builder.module(core.openPlan?'lift-car-through':'lift-car',elevator.id,[x,0,z],[width/LIFT_CAR.width,heightScale,depth/LIFT_CAR.depth],angle);
    lights.push({id:car.id,kind:'strip',room,position:[x,elevation+LIFT_CAR.lens.center[1]*heightScale-.002,z],
      length:LIFT_CAR.lens.depth*depth/LIFT_CAR.depth,angleDeg:core.frame.angleDeg+90,axis:[-core.frame.sin,0,core.frame.cos],direction:[0,-1,0],
      intensity:LIFT_CAR.lens.lumens,colorTemperatureK:3500,range:4,beamDeg:170,diffuse:.95,facing:'down'});
    const solid=(u:number,v:number,w:number,d:number,y=0)=>{const [sx,sz]=world(u,v);builder.module('elevator-shaft-wall',elevator.id,[sx,y,sz],[w,storeyHeight-y,d],angle);};
    const side=.1+LIFT_CAR.wall*width/LIFT_CAR.width-.04;
    for(const u of [r.u+side/2,r.u+r.lu-side/2])solid(u,r.v+r.lv/2,side,r.lv);
    if(!rearServed){const rear=.1+LIFT_CAR.wall*depth/LIFT_CAR.depth-.04;solid(mid,r.v+r.lv-rear/2,r.lu-2*side,rear);}
    for(const rear of rearServed?[false,true]:[false]){
      const sign=rear?-1:1,face=rear?r.v+r.lv:r.v,carFace=face+sign*.1,yaw=angle+(rear?Math.PI:0);
      const [cx,cz]=world(mid,carFace), [dx,dz]=world(mid,face);
      const prefix=rear?'lift-car-rear':'lift-car';
      const frontScale:[number,number,number]=[width/LIFT_CAR.width,Math.min(1,LIFT_CAR.ceiling*heightScale/LIFT_CAR.door.height),1];
      builder.module(`${prefix}-doors`,elevator.id,[cx,0,cz],frontScale,yaw);
      builder.module(`${prefix}-head`,elevator.id,[cx,0,cz],frontScale,yaw);
      const p=elevatorDoorHole(core,index,0,rear).hole,scale:[number,number,number]=[p.width/LIFT_CAR.doorWidth,1,1];
      builder.module(rear?'lift-rear-doors':'lift-doors',elevator.id,[dx,0,dz],scale,yaw+Math.PI);
      for(const s of [-1,1]){const [jx,jz]=world(mid+s*(p.width/2+.05),face);builder.module(surround.jamb,elevator.id,[jx,0,jz],[1,1,1],yaw);}
      builder.module(surround.header,elevator.id,[dx,2.20,dz],scale,yaw);
      const cheek=(r.lu-p.width)/2-.01,thick=LIFT_SHAFT_FRONT.depth;
      for(const u of [r.u+cheek/2,r.u+r.lu-cheek/2])solid(u,face+sign*thick/2,cheek,thick);
      solid(mid,face+sign*thick/2,p.width+.04,thick,LIFT_SHAFT_FRONT.faceFrom);
      const threshold=.1-LIFT_CAR.door.sill;
      surface(builder,floorModule,room,{u:mid-p.width/2,v:rear?face-threshold:face,lu:p.width,lv:threshold},0,core.frame);
      const from=face+sign*LIFT_LANDING.frame[1],reveal=.1+LIFT_CAR.door.plane[0]-.004-LIFT_LANDING.frame[1];
      if(reveal>.001){
        for(const s of [-1,1]){const [jx,jz]=world(mid+s*(p.width/2+.01),from);builder.module('lift-reveal-jamb',elevator.id,[jx,0,jz],[1,1,reveal],yaw);}
        const [hx,hz]=world(mid,from);builder.module('lift-reveal-header',elevator.id,[hx,2.20,hz],[scale[0],1,reveal],yaw);
      }
    }
  }
  return lights;
}
