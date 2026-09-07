import type { Point } from "../../core/geom.js";
import type { MeshBuilder, Vec3 } from "../../glb/mesh-builder.js";
import type { Frame, UvRect } from "../../layout/uv.js";
import { uvToWorld } from "../../layout/uv.js";
import { STAIR, WALL } from "../../layout/constants.js";
import type { MaterialKeys } from "../materials.js";
import type { UvStep } from "../stairs.js";
import { DetailMesh } from "./detail-mesh.js";

/** Flight-side guards live entirely inside the dedicated rail allowance. */
export function emitStairRails(mesh:MeshBuilder,keys:MaterialKeys,frame:Frame,shaft:UvRect,steps:readonly UvStep[]):void {
  const along=shaft.lu>=shaft.lv,model=new DetailMesh(mesh);
  const lane=((along?shaft.lv:shaft.lu)-WALL)/2;
  const runs:UvStep[][]=[];
  for(const step of steps){
    const cross=along?step.lv:step.lu,run=along?step.lu:step.lv;
    if(Math.abs(cross-lane)>.001 || Math.abs(run-STAIR.tread)>.001)continue;
    const last=runs.at(-1),prior=last?.at(-1);
    if(!prior || Math.abs((along?prior.v:prior.u)-(along?step.v:step.u))>.01)runs.push([step]);
    else last!.push(step);
  }
  const world=(run:number,cross:number,y:number):Vec3=>{
    const p=uvToWorld(along?[run,cross]:[cross,run],frame);return[p[0],y,p[1]];
  };
  for(const run of runs){
    const first=run[0]!,last=run.at(-1)!,start=(along?first.u:first.v)+STAIR.tread/2,end=(along?last.u:last.v)+STAIR.tread/2;
    for(const side of [-1,1]){
      const cross=(along?first.v:first.u)+(side<0?STAIR.railAllowance/2:lane-STAIR.railAllowance/2);
      model.tube(keys.trim(),world(start,cross,first.y+1.02),world(end,cross,last.y+1.02),.025);
      model.tube(keys.trim(),world(start,cross,first.y+.54),world(end,cross,last.y+.54),.01);
      for(let i=0;i<run.length;i+=3){const step=run[i]!,t=(along?step.u:step.v)+STAIR.tread/2;
        model.tube(keys.trim(),world(t,cross,step.y),world(t,cross,step.y+1.02),.016);
      }
    }
  }
}
