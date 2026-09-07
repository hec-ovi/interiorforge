import type { Point } from "../../core/geom.js";
import { createRng } from "../../core/rng.js";
import type { Vec3, MeshBuilder } from "../../glb/mesh-builder.js";
import type { PlanFurniture } from "../../layout/plan-types.js";
import { uvToWorld, type Frame } from "../../layout/uv.js";
import type { MaterialKeys } from "../materials.js";

/** Local model coordinates: X across, Z back to front, Y above the finished floor. */
export class Assembly {
  readonly rng;
  readonly w: number; readonly d: number; readonly h: number;
  private readonly c: number; private readonly s: number;
  constructor(readonly mesh: MeshBuilder,readonly keys: MaterialKeys,readonly item:PlanFurniture,
    private readonly frame:Frame,private readonly base:number){
    [this.w,this.d,this.h]=item.size;this.rng=createRng(item.id,"ornament");
    const angle=item.rotationDeg*Math.PI/180;this.c=Math.cos(angle);this.s=Math.sin(angle);
  }
  material(kind:string,tier?:string):string{return this.keys.key(kind, undefined, tier);}
  point([x,y,z]:Vec3):Vec3{
    const p=uvToWorld([this.item.at[0]+x*this.c+z*this.s,this.item.at[1]-x*this.s+z*this.c],this.frame);
    return [p[0],this.base+y,p[1]];
  }
  quad(material:string,points:[Vec3,Vec3,Vec3,Vec3],twoSided=false):void{
    const [a,b,c,d]=points,normal=cross(subtract(b,a),subtract(c,a));
    if(Math.abs(dot(normal,subtract(d,a)))>Math.hypot(...normal)*1e-9){
      this.triangle(material,[a,b,c],twoSided);this.triangle(material,[a,c,d],twoSided);return;
    }
    const q=points.map(p=>this.point(p)) as [Vec3,Vec3,Vec3,Vec3];this.mesh.addQuad(material,q);
    if(twoSided)this.mesh.addQuad(material,[q[3],q[2],q[1],q[0]]);
  }
  triangle(material:string,points:[Vec3,Vec3,Vec3],twoSided=false):void{
    const [a,b,c]=points,ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
    const center=a.map((value,i)=>(value+b[i]!+c[i]!)/3) as Vec3;
    this.quad(material,[a,ab,center,ca],twoSided);
    this.quad(material,[b,bc,center,ab],twoSided);
    this.quad(material,[c,ca,center,bc],twoSided);
  }
  box(material:string,x0:number,x1:number,z0:number,z1:number,y0:number,y1:number):void{
    const corners:Point[]=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>{const p=this.point([x!,0,z!]);return[p[0],p[2]];});
    this.mesh.addPrism(material,corners,this.base+y0,this.base+y1,"world",y0===0?"top":"both");
  }
  tube(material:string,a:Vec3,b:Vec3,radius:number,sides=8):void{
    const delta=b.map((n,i)=>n-a[i]!) as Vec3,length=Math.hypot(...delta);if(length<1e-6)return;
    const axis=delta.map(n=>n/length) as Vec3;
    const reference:Vec3=Math.abs(axis[1])>.9?[1,0,0]:[0,1,0];
    const u=cross(axis,reference);const ul=Math.hypot(...u);for(let i=0;i<3;i++)u[i]=u[i]!/ul;
    const v=cross(axis,u);
    const ring=(p:Vec3,n:number):Vec3=>p.map((q,i)=>q+radius*(u[i]!*Math.cos(n*2*Math.PI/sides)+v[i]!*Math.sin(n*2*Math.PI/sides))) as Vec3;
    for(let i=0;i<sides;i++){
      this.quad(material,[ring(a,i),ring(a,i+1),ring(b,i+1),ring(b,i)]);

    }
    for(let i=0;i<sides;i+=2){
      this.quad(material,[a,ring(a,i+2),ring(a,i+1),ring(a,i)]);
      this.quad(material,[b,ring(b,i),ring(b,i+1),ring(b,i+2)]);
    }
  }
}
function cross(a:Vec3,b:Vec3):Vec3{return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
function subtract(a:Vec3,b:Vec3):Vec3{return a.map((value,i)=>value-b[i]!) as Vec3;}
function midpoint(a:Vec3,b:Vec3):Vec3{return a.map((value,i)=>(value+b[i]!)/2) as Vec3;}
function dot(a:Vec3,b:Vec3):number{return a.reduce((value,coordinate,i)=>value+coordinate*b[i]!,0);}
