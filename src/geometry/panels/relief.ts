import { polygonArea, type Point } from "../../core/geom.js";
import type { MeshBuilder, Vec3 } from "../../glb/mesh-builder.js";
import type { PanelRegion } from "./regions.js";

type UV = [number,number];
const midpoint = (a:Vec3,b:Vec3):Vec3 => a.map((v,i)=>(v+b[i]!)/2) as Vec3;
const uvMid = (a:UV,b:UV):UV => [(a[0]+b[0])/2,(a[1]+b[1])/2];

type Plane = [number, number, number];
const value = ([a,b,c]:Plane,[x,y]:Point):number => a*x+b*y+c;

/** Clip a convex field to the side where this depth plane owns the surface. */
function clipDepth(polygon:Point[], boundary:Plane):Point[] {
  const out:Point[]=[];
  for(let i=0;i<polygon.length;i++){
    const a=polygon[i]!,b=polygon[(i+1)%polygon.length]!;
    const va=value(boundary,a),vb=value(boundary,b);
    if(va<=0)out.push(a);
    if((va<0&&vb>0)||(va>0&&vb<0)){
      const t=va/(va-vb);
      out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
    }
  }
  return out;
}

/** Each returned polygon lies on one bevel plane, including trimmed corner ridges. */
export function reliefPolygons(region:PanelRegion,width:number,height:number,joint:number,depth:number):Point[][] {
  const {x,y,width:w,height:h}=region;
  const ring:Point[]=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  if(!depth||region.joint)return [ring];
  const planes:Plane[]=[[0,0,depth],[1,0,-joint/2],[-1,0,width-joint/2],[0,1,-joint/2],[0,-1,height-joint/2]];
  if(planes.some(plane=>ring.every(point=>planes.every(other=>value(plane,point)<=value(other,point)+1e-12))))return [ring];
  return planes.flatMap((plane,index)=>{
    let polygon=ring;
    for(let i=0;i<planes.length&&polygon.length>=3;i++)if(i!==index){
      const other=planes[i]!;
      polygon=clipDepth(polygon,plane.map((v,j)=>v-other[j]!) as Plane);
    }
    return polygon.length>=3&&Math.abs(polygonArea(polygon))>1e-12?[polygon]:[];
  });
}

export function reliefTriangle(mesh:MeshBuilder,material:string,p:[Vec3,Vec3,Vec3],uv:[UV,UV,UV]):void {
  const center=p[0].map((v,i)=>(v+p[1][i]!+p[2][i]!)/3) as Vec3;
  const middle:UV=[(uv[0][0]+uv[1][0]+uv[2][0])/3,(uv[0][1]+uv[1][1]+uv[2][1])/3];
  for(let i=0;i<3;i++){
    const j=(i+1)%3,k=(i+2)%3;
    mesh.addQuadUv(material,[p[i]!,midpoint(p[i]!,p[j]!),center,midpoint(p[k]!,p[i]!)],
      [uv[i]!,uvMid(uv[i]!,uv[j]!),middle,uvMid(uv[k]!,uv[i]!)]);
  }
}

export function panelRecess(x:number,y:number,width:number,height:number,joint:number,depth:number):number {
  return Math.max(0,Math.min(depth,x-joint/2,width-joint/2-x,y-joint/2,height-joint/2-y));
}
