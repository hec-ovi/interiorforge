import type{Kit}from'../../modules/kit.js';
import{FINISH as F}from'../../modules/finishes.js';
import{softBox}from'../luxury/model-geometry.js';
import{CORPORATE_MATERIAL as M}from'./materials.js';
const box=(k:Kit,m:string,p:[number,number,number],s:[number,number,number],r=.003)=>softBox(k,m,p,s,{radius:r,planRadius:r,detail:0});
/** Gutierrez 80431/80435/80439: veined top, fine warm outer band, dark
 * recessed visitor face. Operator side is +Z and retains real knee clearance. */
export function executiveDesk(k:Kit):void{
  for(const x of [-.755,.755]){
    box(k,F.black,[x,0,0],[.076,.065,.70],.005);
    box(k,M.veneer,[x,.065,0],[.06,.646,.74]);
  }
  box(k,F.black,[0,.022,-.34],[1.47,.043,.058]);
  box(k,M.dark,[0,.065,-.337],[1.45,.646,.044]);
  box(k,M.bronze,[0,.711,0],[1.6,.009,.8],.002);
  box(k,M.stone,[0,.720,0],[1.6,.030,.8],.004);
  // One modest pedestal, open knee bay and a separate under-top cable tray.
  box(k,M.veneer,[-.535,.066,-.017],[.34,.564,.53]);
  for(let row=0;row<3;row++){
    box(k,F.black,[-.535,.084+row*.176,.254],[.313,.158,.006]);
    box(k,M.dark,[-.535,.089+row*.176,.259],[.300,.146,.008]);
    box(k,M.bronze,[-.535,.201+row*.176,.269],[.17,.012,.012],.002);
  }
  box(k,F.black,[.18,.604,-.19],[1.02,.045,.11]);
  for(const x of [-.732,.732])box(k,M.bronze,[x,.069,-.365],[.007,.63,.005],.001);
  box(k,M.bronze,[0,.692,-.365],[1.47,.007,.005],.001);
  // Inlaid stepped lines are fine metal, not emissive decoration.
  for(const offset of [0,.033]){
    const p:[number,number,number][]=[[-.70,.143+offset,-.363],[-.18,.143+offset,-.363],[-.04,.228+offset,-.363],[.18,.228+offset,-.363],[.28,.181+offset,-.363],[.70,.181+offset,-.363]];
    for(let i=0;i<p.length-1;i++)k.rod(M.bronze,p[i]!,p[i+1]!,.0028);
  }
  k.cbox(F.black,[.53,.749,-.19],[.16,.001,.065]);
}
