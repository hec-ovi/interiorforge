import type { Assembly } from "./assembly.js";
import { fish, plantedBay } from "./vegetation.js";
import { nineSlice } from "../panels/nine-slice.js";

export function caseFrame(a:Assembly,open:boolean):{bottom:number;top:number}{
  const {w,d,h}=a,hw=w/2,hd=d/2;
  const frame=a.keys.door(),body=a.keys.panels.surface("wall");
  const bronze=a.material("interior-bronze","rich");
  const led=a.keys.panels.style==="luxury"?a.material("interior-led-warm","rich"):a.material("interior-led-cyan","mid");
  const bottom=.5,top=h-.5;
  a.box(frame,-hw+.04,hw-.04,-hd+.04,hd-.04,0,.08);
  for(const cell of nineSlice(w,1).pieces.filter(cell => cell.y === 0)){
    const inset=Math.min(.004,cell.width/4);
    a.box(body,-hw+cell.x+inset,-hw+cell.x+cell.width-inset,-hd,hd,.08,bottom-.03);
  }
  a.box(frame,-hw,hw,-hd,hd,bottom-.03,bottom);
  a.box(bronze,-hw+.02,hw-.02,hd-.018,hd,bottom-.06,bottom-.04);
  a.box(led,-hw+.08,hw-.08,-hd+.055,-hd+.075,bottom,bottom+.014);
  a.box(led,-hw+.08,hw-.08,hd-.075,hd-.055,bottom,bottom+.014);
  for(const side of [-1,1]){
    const x=side*(hw-.035);a.box(frame,x-.035,x+.035,-hd,hd,bottom,h);
    a.box(bronze,x-.013,x+.013,hd-.014,hd,bottom+.08,h-.08);
  }
  if(!open){
    a.box(frame,-hw,hw,-hd,hd,top,h);
    a.box(led,-hw+.08,hw-.08,-hd+.045,hd-.045,top-.012,top);
    a.box(frame,-hw+.07,hw-.07,-hd,-hd+.025,bottom,top);
  }else{
    a.box(frame,-hw,hw,-hd,-hd+.055,h-.055,h);
  }
  return{bottom:bottom+.035,top:(open?h-.08:top-.04)};
}

export function plantedCase(a:Assembly,open:boolean,aquarium:boolean):void{
  const {bottom,top}=caseFrame(a,open),hw=a.w/2,hd=a.d/2;
  const soil=a.material("concrete");a.box(soil,-hw+.08,hw-.08,-hd+.065,hd-.065,bottom-.025,bottom);
  for(let x=-hw+.25;x<=hw-.25+1e-9;x+=.5)plantedBay(a,x,bottom,top-a.rng.range(.04,.18));
  if(!open){
    const glass=a.material("interior-display-glass","rich");a.box(glass,-hw+.07,hw-.07,hd-.025,hd-.012,bottom-.02,top+.015);
  }
  if(aquarium){
    for(let x=-hw+.35;x<hw-.2;x+=.55)fish(a,x,bottom+(top-bottom)*a.rng.range(.25,.72),a.rng.range(.06,.11));
  }
}
