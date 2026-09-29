import type { Kit } from '../../modules/kit.js';
import { FINISH as F } from '../../modules/finishes.js';
import { softBox,tube } from '../luxury/model-geometry.js';
import { CORPORATE_MATERIAL as M } from './materials.js';
const box=(k:Kit,m:string,p:[number,number,number],s:[number,number,number],r=.003)=>softBox(k,m,p,s,{radius:r,planRadius:r,detail:0});

/** Separately bound cover, recessed paper block, label pocket and finger ring. */
export function binder(k:Kit,x:number,y:number,z:number,w:number,h:number,d:number,dark=false):void{
  const cover=dark?M.dark:M.mineral;
  k.cbox(F.paper,[x,y+.005,z-.003],[w-.008,h-.012,d-.014]);
  for(const side of [-1,1])k.cbox(cover,[x+side*(w/2-.002),y,z],[.004,h,d]);
  k.cbox(cover,[x,y,z+d/2-.003],[w,h,.007]);
  k.cbox(M.alloy,[x,y+h*.52,z+d/2+.002],[w*.64,h*.28,.002]);
  k.cbox(F.paper,[x,y+h*.54,z+d/2+.003],[w*.50,h*.23,.001]);
  for(let i=0;i<3;i++)k.cbox(M.dark,[x,y+h*(.59+i*.048),z+d/2+.004],[w*.34,.002,.001]);
  const points:[number,number,number][]=[];for(let i=0;i<16;i++){const a=i*Math.PI/8;points.push([x+Math.cos(a)*.009,y+.045+Math.sin(a)*.009,z+d/2+.004]);}
  tube(k,M.alloy,points,.0015,true,5);tube(k,M.dark,[[x,y+.045,z+d/2+.002],[x,y+.045,z+d/2+.003]],.0075,false,12);
}
/** Referenced drawer towers have projecting rails and inset pale faces, not a flat tile grid. */
export function recordsCabinet(k:Kit):void{
  box(k,F.black,[0,0,-.005],[1.76,.055,.46]);
  for(let row=0;row<4;row++){
    const y=.055+row*.475;
    for(const x of [-.884,.884])box(k,M.veneer,[x,y,-.015],[.032,.435,.47]);
    box(k,M.veneer,[0,y,-.233],[1.736,.435,.024]);
    box(k,M.veneer,[0,y,0],[1.8,.035,.48]);
    box(k,M.veneer,[0,y+.40,0],[1.8,.035,.5]);
    box(k,M.veneer,[0,y+.035,-.005],[.024,.365,.47]);
    for(const x of [-.447,.447]){
      box(k,F.black,[x,y+.055,.203],[.838,.338,.009]);
      box(k,M.mineral,[x,y+.066,.216],[.812,.299,.022]);
      for(const sign of [-1,1])box(k,M.mineral,[x+sign*.247,y+.365,.216],[.318,.022,.022]);
      // Recessed grip sits below the projecting top rail and between raised corners.
      box(k,M.veneer,[x,y+.378,.229],[.20,.016,.033]);
      box(k,M.alloy,[x,y+.059,.229],[.786,.006,.003],.001);
    }
  }
  box(k,M.veneer,[0,1.967,0],[1.8,.033,.5]);
}
export function occupiedLibrary(k:Kit):void{
  box(k,F.black,[0,0,0],[1.73,.07,.44]);
  for(const x of [-.883,.883])box(k,M.veneer,[x,.07,0],[.034,1.93,.5]);
  box(k,M.veneer,[0,.07,-.237],[1.733,1.9,.026]);
  for(const y of [.07,.80,1.19,1.58,1.97])box(k,M.veneer,[0,y,0],[1.736,.03,.5]);
  for(const x of [-.435,.435]){
    box(k,M.veneer,[x,.12,.205],[.844,.63,.054]);
    box(k,M.mineral,[x,.16,.237],[.77,.52,.021]);
    box(k,M.bronze,[x,.70,.239],[.31,.009,.014]);
  }
  for(let shelf=0;shelf<3;shelf++){
    const y=.835+shelf*.39;
    const count=shelf===1?14:19;
    for(let i=0;i<count;i++)binder(k,-.792+i*.066,y,-.003,.057,.285+(i%4)*.011,.37,i%7===0);
    // Occupied shelves have a purposeful gap for stacked folders, not identical filling.
    if(shelf===1)for(let i=0;i<4;i++)box(k,i%2?M.veneer:M.mineral,[.55,y+i*.028,0],[.36,.025,.35],.002);
  }
}
