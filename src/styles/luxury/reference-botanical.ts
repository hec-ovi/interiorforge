import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { FINISH as F } from '../../modules/finishes.js';
import { clothSurface, softBox, tube } from './model-geometry.js';
import { REFERENCE_MATERIAL as R } from './reference-furniture.js';

const noise=(v:number)=>{const a=Math.sin(v*127.1+31.7)*43758.5453;return a-Math.floor(a);};
function bamboo(k:Kit,width:number,depth:number,base:number,top:number,seed:number):void{
  const stems=Math.round(width/.16);
  const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
  for(let i=0;i<stems;i++){
    const x=-width/2+.085+(width-.17)*i/(stems-1),z=(noise(seed+i*3)-.5)*depth*.48;
    const height=(top-base)*(.81+.19*noise(seed+i)),lean=(noise(i+seed+19)-.5)*.05;
    const shaft:[number,number,number][]=[];
    for(let s=0;s<=12;s++)shaft.push([x+lean*s/12,base+height*s/12,z+.014*Math.sin(s*.38+i)]);
    tube(k,F.stem,shaft,.010+noise(i+73)*.005,false,10);
    for(let n=2;n<10;n++){
      const y=base+height*n/10,cx=x+lean*n/10,cz=z+.014*Math.sin(n*.456+i),r=.014+noise(i+73)*.005;
      const ring:[number,number,number][]=[];
      for(let a=0;a<16;a++){const t=a/16*Math.PI*2;ring.push([cx+Math.cos(t)*r,y,cz+Math.sin(t)*r]);}
      tube(k,F.leaf,ring,.0018,true,6);
      if(n%2==i%2)continue;
      for(const side of[-1,1]){
        if(side<0&&cx<-width/2+.18||side>0&&cx>width/2-.18)continue;
        const branchEnd:[number,number,number]=[clamp(cx+side*(.07+.035*noise(n+i)),-width/2+.012,width/2-.012),y+.07,clamp(cz+(noise(n+i*7)-.5)*.13,-depth/2+.04,depth/2-.04)];
        tube(k,F.stem,[[cx,y,cz],branchEnd],.0025,false,6);
        for(let leaf=0;leaf<5;leaf++){
          const t=(leaf+.5)/5,bx=cx+(branchEnd[0]-cx)*t,by=y+.07*t,bz=cz+(branchEnd[2]-cz)*t;
          const heading=(side>0?0:Math.PI)+(leaf%2?.7:-.7),length=.14+.12*noise(seed+i*31+n*7+leaf),dx=Math.cos(heading),dz=Math.sin(heading)*.42;
          clothSurface(k,F.leaf,(u,v)=>{
            const blade=Math.max(.0004,.031*Math.sin(Math.PI*v)**.75),cross=(u-.5)*blade;
            return[clamp(bx+v*dx*length+cross*dz,-width/2+.004,width/2-.004),by+.020*Math.sin(v*Math.PI)-.05*v*v+.0035*(1-Math.abs(u*2-1))*Math.sin(v*Math.PI),clamp(bz+v*dz*length-cross*dx,-depth/2+.004,depth/2-.004)];
          },.031,length,.0006,2,8);
        }
      }
    }
  }
}
function lens(k:Kit,y:number,width:number,up:boolean):void{
  k.cbox(F.black,[0,up?y-.015:y+.003,0],[width+.02,.014,.038]);
  k.cbox(F.lensWarm,[0,y-.004,0],[width,.008,.030]);
}
function botanical(k:Kit,width:number,depth:number,height:number,publicCase:boolean,wall:boolean):void{
  const scaleY=height/2.7,boxTop=publicCase?.610:.447;
  softBox(k,F.black,[0,0,0],[width-.12,.06,depth-.08],{radius:.01});
  softBox(k,R.stone,[0,.06,0],[width,boxTop-.06,depth],{radius:.008});
  softBox(k,F.bronze,[0,boxTop-.012,0],[width,.008,depth],{radius:.002});
  k.cbox(F.soil,[0,boxTop-.010,0],[width-.065,.025,depth-.07]);
  bamboo(k,width-.09,depth-.09,boxTop+.013,height-.12,publicCase?27163108:27171805);
  if(publicCase){
    for(const x of[-width/2+.012,width/2-.012])for(const z of[-depth/2+.012,depth/2-.012])softBox(k,F.bronze,[x,boxTop,z],[.018,height-boxTop,.018],{radius:.003});
    for(const x of[-width/2+.014,width/2-.014])k.cbox(F.glass,[x,boxTop+.015,0],[.004,height-boxTop-.05,depth-.025]);
    for(const z of[-depth/2+.014,depth/2-.014])k.cbox(F.glass,[0,boxTop+.015,z],[width-.025,height-boxTop-.05,.004]);
    for(const z of[-depth/2+.025,depth/2-.025]){
      softBox(k,F.black,[0,height-.065,z],[width,.065,.050],{radius:.006});
      k.cbox(F.lensWarm,[0,height-.066,z],[width-.05,.006,.033]);
    }
    for(const x of[-width/2+.025,width/2-.025])softBox(k,F.black,[x,height-.065,0],[.050,.065,depth],{radius:.006});
  }else{
    // V Corpo's open bamboo divider has a low wave-line plinth and fine upper rail.
    for(let line=0;line<6;line++){
      const points:[number,number,number][]=[];
      for(let i=0;i<=80;i++){const x=-width/2+.035+(width-.07)*i/80;points.push([x,.10+line*.025+.009*Math.sin(x*14+line*.45),depth/2-.006]);}
      tube(k,F.bronze,points,.0013,false,5);
    }
    tube(k,F.bronze,[[-width/2+.025,height-.024,0],[width/2-.025,height-.024,0]],.009,false,10);
  }
  if(wall){
    // Backing is part of the display cavity, separate from the free foliage.
    if(!publicCase)k.cbox(R.veneer,[0,boxTop,-depth/2+.008],[width,height-boxTop,.016]);
    lens(k,2.64*scaleY,width*.907,false);lens(k,.625*scaleY,width*.907,true);
  }else lens(k,.620*scaleY,width*.90,true);
}
export const referenceBotanicalRecipes:RecipeSet=add=>{
  add('fit-bamboo-screen-corpo',k=>botanical(k,2.5,.5,2,false,false));
  add('fit-bamboo-wall-corpo',k=>botanical(k,3,.5,2,false,true));
  add('fit-botanical-display-biotechnica',k=>botanical(k,3,.75,2.7,true,true));
  add('fit-botanical-screen-biotechnica',k=>botanical(k,3,.55,2.7,true,false));
};
