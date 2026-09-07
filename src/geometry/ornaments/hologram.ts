import type { Assembly } from "./assembly.js";
import type { Vec3 } from "../../glb/mesh-builder.js";
import { caseFrame } from "./cases.js";

export function hologramCase(a:Assembly,open:boolean):void{
  const{bottom,top}=caseFrame(a,open),light=a.material("interior-led-cyan","mid"),frame=a.keys.door();
  for(let x=-a.w/2+.5;x<a.w/2-.2;x+=.75){
    a.box(frame,x-.12,x+.12,-.12,.12,bottom,bottom+.05);
    const radius=Math.min(.18,(top-bottom)*.3),cy=(bottom+top)/2;
    for(const latitude of [-.7,-.35,0,.35,.7]){
      const r=radius*Math.sqrt(1-latitude*latitude),y=cy+radius*latitude;
      for(let i=0;i<18;i++){
        const point=(n:number):Vec3=>[x+r*Math.cos(n*Math.PI/9),y,r*Math.sin(n*Math.PI/9)];
        a.tube(light,point(i),point(i+1),.004,6);
      }
    }
    for(let meridian=0;meridian<3;meridian++){
      const heading=meridian*Math.PI/3;
      const point=(n:number):Vec3=>{
        const theta=n*Math.PI/12,span=radius*Math.cos(theta);
        return[x+span*Math.cos(heading),cy+radius*Math.sin(theta),span*Math.sin(heading)];
      };
      for(let i=0;i<24;i++)a.tube(light,point(i),point(i+1),.004,6);
    }
    for(let i=0;i<3;i++){
      const offset=(i-1)*.07;
      a.tube(light,[x+offset,bottom+.09,0],[x+offset,cy-radius-.035,0],.0025,6);
    }
  }
  if(!open)a.box(a.material("interior-display-glass","rich"),-a.w/2+.075,a.w/2-.075,a.d/2-.024,a.d/2-.012,bottom,top);
}
