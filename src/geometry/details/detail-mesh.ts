import type { MeshBuilder, Vec3 } from "../../glb/mesh-builder.js";

/** Closed structural tubes with outward winding, in world metres. */
export class DetailMesh {
  constructor(readonly mesh: MeshBuilder) {}
  tube(material:string,a:Vec3,b:Vec3,radius:number,sides=8):void {
    const delta=b.map((n,i)=>n-a[i]!) as Vec3,length=Math.hypot(...delta);if(length<1e-8)return;
    const axis=delta.map(n=>n/length) as Vec3;
    const reference:Vec3=Math.abs(axis[1])>.9?[1,0,0]:[0,1,0];
    const u=cross(axis,reference),ul=Math.hypot(...u);for(let i=0;i<3;i++)u[i]=u[i]!/ul;
    const v=cross(axis,u);
    const ring=(p:Vec3,n:number):Vec3=>p.map((q,i)=>q+radius*(u[i]!*Math.cos(n*2*Math.PI/sides)+v[i]!*Math.sin(n*2*Math.PI/sides))) as Vec3;
    for(let i=0;i<sides;i++)this.mesh.addQuad(material,[ring(a,i),ring(a,i+1),ring(b,i+1),ring(b,i)]);
    for(let i=0;i<sides;i+=2){
      this.mesh.addQuad(material,[a,ring(a,i+2),ring(a,i+1),ring(a,i)]);
      this.mesh.addQuad(material,[b,ring(b,i),ring(b,i+1),ring(b,i+2)]);
    }
  }
}
function cross(a:Vec3,b:Vec3):Vec3{return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
