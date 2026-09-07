import type { Point } from "../../core/geom.js";
import type { MeshBuilder, Vec3 } from "../../glb/mesh-builder.js";
import type { PlanRoom } from "../../layout/plan-types.js";
import { roomCoversRect } from "../../layout/room-shape.js";
import type { Frame } from "../../layout/uv.js";
import { coversRect, uvToWorld } from "../../layout/uv.js";
import type { MaterialKeys } from "../materials.js";
import { DetailMesh } from "./detail-mesh.js";

/** Exposed utilities follow a fitted ceiling-side band, clear of doors and walk height. */
export function emitServices(mesh:MeshBuilder,keys:MaterialKeys,rooms:readonly PlanRoom[],frame:Frame,base:number,ceiling:number,usableOutline:readonly Point[]):void {
  if(keys.panels.style==="luxury" || ceiling-base<2.9)return;
  const model=new DetailMesh(mesh);
  for(const room of rooms){
    if(!["corridor","living","studio_main","office_open","mechanical_room","storage","bedroom"].includes(room.kind))continue;
    const r=room.rect,along=r.lu>=r.lv,run=(along?r.lu:r.lv)-1,deep=along?r.lv:r.lu;
    if(run<2||deep<2)continue;
    const band=along?{u:r.u+.5,v:r.v+.5,lu:run,lv:.65}:{u:r.u+.5,v:r.v+.5,lu:.65,lv:run};
    if(!roomCoversRect(room,band,.1)||!coversRect(usableOutline,band))continue;
    const point=(t:number,y:number,offset:number):Vec3=>{
      const p=uvToWorld(along?[band.u+t,band.v+offset]:[band.u+offset,band.v+t],frame);return[p[0],y,p[1]];
    };
    const pipe=keys.panels.style==="damaged"?keys.door():keys.trim();
    for(const offset of [.1,.34]){
      const y=ceiling-.17-(offset>.2?.06:0);
      model.tube(pipe,point(0,y,offset),point(run,y,offset),offset>.2?.035:.055);
      for(let t=.18;t<=run-.035;t+=1.25){
        model.tube(keys.trim(),point(t-.035,y,offset),point(t+.035,y,offset),offset>.2?.049:.069);
        model.tube(keys.trim(),point(t,y+.055,offset),point(t,ceiling,offset),.012);
      }
    }
    for(let t=.2;t<=run-.71;t+=.9){
      model.tube(keys.trim(),point(t,ceiling-.025,.53),point(t+.1,ceiling-.31,.57),.01,6);
      model.tube(keys.trim(),point(t+.1,ceiling-.31,.57),point(t+.55,ceiling-.34,.57),.01,6);
      model.tube(keys.trim(),point(t+.55,ceiling-.34,.57),point(t+.7,ceiling-.025,.53),.01,6);
    }
  }
}
