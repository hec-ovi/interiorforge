import type { Vec3 } from "../../glb/mesh-builder.js";
import type { Assembly } from "./assembly.js";

export function plantedBay(a:Assembly,x:number,base:number,top:number):void{
  const stem=a.material("wood"),leaf=a.keys.panels.style === "damaged" ? a.material("interior-leaf-dry","poor") : a.material("interior-leaf","rich");
  const sway=a.rng.range(-.012,.012),height=top-base;
  a.tube(stem,[x,base,0],[x+sway,top,0],.009);
  for(let node=0;node<8;node++){
    const y=base+height*(.15+node*.09),side=node%2===0?-1:1;
    const reach=a.rng.range(.045,.06),z=a.rng.range(-.10,.10);
    const origin:Vec3=[x+sway*node/8,y,0],tip:Vec3=[origin[0]+side*reach,y+a.rng.range(.025,.06),z];
    a.tube(stem,origin,tip,.0035);
    for(let j=0;j<4;j++){
      const along=.4+j*.2;
      const petiole=origin.map((value,i)=>value+(tip[i]!-value)*along) as Vec3;
      const direction:Vec3=[side*a.rng.range(.45,.9),a.rng.range(-.2,.85),a.rng.range(-.2,.2)];
      const length=a.rng.range(.13,.17),width=a.rng.range(.09,.13),magnitude=Math.hypot(...direction);
      const axis=direction.map(value=>value/magnitude) as Vec3;
      const across:Vec3=[-axis[1],axis[0],0],acrossLength=Math.hypot(...across);
      const point=(alongLeaf:number,acrossLeaf:number):Vec3=>petiole.map((value,i)=>value+axis[i]!*length*alongLeaf+across[i]!/acrossLength*width*acrossLeaf) as Vec3;
      a.quad(leaf,[petiole,point(.45,.5),point(1,0),point(.45,-.5)],true);
    }
  }
}

export function fish(a:Assembly,x:number,y:number,z:number):void{
  const material=a.material("interior-fish","rich"),len=.16,thick=.03,tall=.055;
  // A tapered body with a narrow tail joint and distinct fins.
  const front:Vec3=[x+len*.5,y,z],top:Vec3=[x,y+tall,z],bottom:Vec3=[x,y-tall,z];
  const left:Vec3=[x,y,z-thick],right:Vec3=[x,y,z+thick],tail:Vec3=[x-len*.5,y,z];
  for(const face of [[front,left,top],[front,top,right],[front,right,bottom],[front,bottom,left],
    [tail,top,left],[tail,right,top],[tail,bottom,right],[tail,left,bottom]] as [Vec3,Vec3,Vec3][])a.triangle(material,face);
  a.quad(material,[[x-len*.5,y,z],[x-len*.9,y+tall,z],[x-len,y,z+.012],[x-len*.9,y-tall,z]],true);
}
