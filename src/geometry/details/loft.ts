import type { Point } from "../../core/geom.js";
import type { LoftPlan } from "../../core/loft.js";
import type { MeshBuilder, Vec3 } from "../../glb/mesh-builder.js";
import type { MaterialKeys } from "../materials.js";
import { DetailMesh } from "./detail-mesh.js";

export function emitLoftStair(mesh:MeshBuilder,keys:MaterialKeys,loft:LoftPlan,base:number):void {
  const model=new DetailMesh(mesh),s=loft.stair,d=s.direction,c:Point=[-d[1],d[0]];
  const at=(x:number,y:number,z:number):Vec3=>[s.start[0]+c[0]*x+d[0]*z,y,s.start[1]+c[1]*x+d[1]*z];
  const corners=(z0:number,z1:number):Point[]=>[[-.7,z0],[.7,z0],[.7,z1],[-.7,z1]].map(([x,z]):Point=>{const p=at(x!,0,z!);return[p[0],p[2]];}).reverse();
  for(let i=0;i<s.risers-1;i++) {
    const y=base+(i+1)*s.rise,ring=corners(i*s.tread,(i+1)*s.tread);
    mesh.addPrism(keys.trim(),ring,y-.055,y,"world","none");
    mesh.addHorizontalPolygon(keys.concrete(),ring,y-.055,"down");
    mesh.addHorizontalPolygon(keys.floorOf("living"),ring,y,"up");
  }
  for(const side of [-1,1]){
    const x=side*.665;
    model.tube(keys.trim(),at(x,base+.04,.03),at(x,loft.elevation-.13,s.run-.02),.042,4);
    const top0=at(x,base+s.rise+1.04,0),top1=at(x,loft.elevation+1.04,s.run);
    model.tube(keys.trim(),top0,top1,.03);
    const count=Math.ceil(s.run/.8);
    for(let i=0;i<=count;i++){
      const z=s.run*i/count,tread=Math.min(s.risers-1,Math.floor(z/s.tread)+1),bottom=base+tread*s.rise;
      const top=base+s.rise+1.04+(loft.elevation-base-s.rise)*i/count;
      model.tube(keys.trim(),at(x,bottom-.04,z),at(x,top,z),.018);
    }
    // Sloped infill rails leave the full 1.2 m walking strip clear.
    for(const h of [.38,.68])model.tube(keys.trim(),at(x,base+s.rise+h,0),at(x,loft.elevation+h,s.run),.009);
  }
  for(const [x,z] of loft.supports){
    mesh.addBox(keys.trim(),{x:x-.075,z:z-.075,w:.15,d:.15},base,loft.elevation-loft.thickness);
    mesh.addBox(keys.trim(),{x:x-.1,z:z-.1,w:.2,d:.2},base,base+.025);
  }
}

export function emitLoftPlatform(mesh:MeshBuilder,keys:MaterialKeys,loft:LoftPlan):void {
  mesh.addPrism(keys.trim(),loft.platform,loft.elevation-loft.thickness,loft.elevation,"world","none");
  mesh.addHorizontalPolygon(keys.ceiling(),loft.platform,loft.elevation-loft.thickness,"down");
  mesh.addHorizontalPolygon(keys.floorOf("bedroom"),loft.platform,loft.elevation,"up");
  const model=new DetailMesh(mesh),stairTop:Point=[loft.stair.start[0]+loft.stair.direction[0]*loft.stair.run,
    loft.stair.start[1]+loft.stair.direction[1]*loft.stair.run];
  for(let i=0;i<loft.platform.length;i++){
    const a=loft.platform[i]!,b=loft.platform[(i+1)%loft.platform.length]!,length=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
    const at=(t:number,y:number):Vec3=>[a[0]+dx*t-dz*.035,y,a[1]+dz*t+dx*.035];
    const projection=(stairTop[0]-a[0])*dx+(stairTop[1]-a[1])*dz;
    const onEdge=Math.abs((stairTop[0]-a[0])*dz-(stairTop[1]-a[1])*dx)<.01;
    const intervals=onEdge?[[0,Math.max(0,projection-.71)],[Math.min(length,projection+.71),length]]:[[0,length]];
    for(const [start,end] of intervals){
      if(end!-start!<.05)continue;
      for(const height of [1.05,.55])model.tube(keys.trim(),at(start!,loft.elevation+height),at(end!,loft.elevation+height),height===1.05?.028:.012);
      const count=Math.ceil((end!-start!)/.18);
      for(let p=0;p<=count;p++){
        const t=start!+(end!-start!)*p/count;
        model.tube(keys.trim(),at(t,loft.elevation+.02),at(t,loft.elevation+1.05),.009);
      }
    }
  }
}
