import type { Kit } from '../../modules/kit.js';
import type { Vec3 } from '../../glb/mesh-builder.js';

/** Folded/machined steel corners: a real metric chamfer, 44 triangles, with
 * separate broad face normals and diagonal bevel normals. No subdivision grid. */
export function chamferBox(k: Kit, slot: string, at: Vec3, size: Vec3, radius = .006): void {
  const h = size.map(v => v / 2) as Vec3, r = Math.min(radius, ...h.map(v => v * .45));
  const g = { positions: [] as number[], normals: [] as number[], uvs: [] as number[], indices: [] as number[] };
  const face = (points: Vec3[], normal: Vec3) => {
    const a = points[0]!, b = points[1]!, c = points[2]!;
    const ab = b.map((v,i)=>v-a[i]!) as Vec3, ac = c.map((v,i)=>v-a[i]!) as Vec3;
    const cross: Vec3 = [ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    if(cross.reduce((v,n,i)=>v+n*normal[i]!,0)<0) points.reverse();
    const base=g.positions.length/3, axis=Math.abs(normal[1])>.5?[0,2]:Math.abs(normal[2])>.5?[0,1]:[2,1];
    for(const p of points){g.positions.push(p[0]+at[0],p[1]+at[1]+h[1],p[2]+at[2]);g.normals.push(...normal);g.uvs.push(p[axis[0]!]!+h[axis[0]!]!,p[axis[1]!]!+h[axis[1]!]!);}
    for(let i=1;i<points.length-1;i++)g.indices.push(base,base+i,base+i+1);
  };
  for(let axis=0;axis<3;axis++)for(const s of [-1,1]){
    const a=(axis+1)%3,b=(axis+2)%3,n:Vec3=[0,0,0];n[axis]=s;
    face([[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{const p:Vec3=[0,0,0];p[axis]=s*h[axis]!;p[a]=u!*(h[a]!-r);p[b]=v!*(h[b]!-r);return p}),n);
  }
  for(let along=0;along<3;along++)for(const sa of [-1,1])for(const sb of [-1,1]){
    const a=(along+1)%3,b=(along+2)%3,n:Vec3=[0,0,0];n[a]=sa/Math.SQRT2;n[b]=sb/Math.SQRT2;
    face([[-1,0],[1,0],[1,1],[-1,1]].map(([s,t])=>{const p:Vec3=[0,0,0];p[along]=s!*(h[along]!-r);p[a]=sa*(h[a]!-(t?r:0));p[b]=sb*(h[b]!-(t?0:r));return p}),n);
  }
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
    const signs:Vec3=[x,y,z];face([0,1,2].map(axis=>h.map((v,i)=>signs[i]!*(v-(axis===i?0:r)))as Vec3),signs.map(v=>v/Math.sqrt(3))as Vec3);
  }
  k.mesh.addSurface(slot,g);
}
