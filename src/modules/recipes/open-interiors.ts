import { FINISH as F } from '../finishes.js';
import type { Kit } from '../kit.js';
import type { RecipeSet } from '../recipes.js';
import type { Point } from '../../core/geom.js';

function rounded(w:number,d:number,r:number):Point[] {
  return [[w/2-r,d/2-r,0],[-w/2+r,d/2-r,90],[-w/2+r,-d/2+r,180],[w/2-r,-d/2+r,270]]
    .flatMap(([x,z,a])=>Array.from({length:7},(_,i)=>{const t=(a!+i*15)*Math.PI/180;return [x!+r*Math.cos(t),z!+r*Math.sin(t)] as Point;}));
}
const cb=(k:Kit,s:string,x:number,y:number,z:number,w:number,h:number,d:number,r=.008)=>k.cbevel(s,[x,y,z],[w,h,d],r);
function cup(k:Kit,x:number,y:number,z:number) {
  k.turned(F.ceramic,[x,y,z],[[0,0],[.037,0],[.043,.008],[.047,.083],[.044,.09],[.039,.09],[.035,.015],[0,.015]],16);
  for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/9,b=-Math.PI/2+(i+1)*Math.PI/9;
    k.rod(F.ceramic,[x+.045+Math.cos(a)*.025,y+.048+Math.sin(a)*.025,z],[x+.045+Math.cos(b)*.025,y+.048+Math.sin(b)*.025,z],.007,true);}
}
function espresso(k:Kit,x:number,y:number,z:number) {
  cb(k,F.chrome,x,y,z,1.1,.08,.55,.018);cb(k,F.black,x,y+.08,z+.13,1.04,.47,.27,.035);
  cb(k,F.chrome,x,y+.42,z-.07,1.06,.14,.49,.025);
  for(let i=0;i<20;i++) cb(k,F.zinc,x-.48+i*.05,y+.075,z-.13,.024,.008,.28,.002);
  for(const dx of [-.34,0,.34]) {
    k.cylinder(F.chrome,[x+dx,y+.30,z-.16],.065,.14,14);
    k.rod(F.black,[x+dx,y+.30,z-.17],[x+dx,y+.30,z-.36],.028,true);
    cup(k,x+dx,y+.09,z-.14);
    cb(k,F.ledCyan,x+dx,y+.46,z-.323,.12,.045,.005,.002);
    cup(k,x+dx,y+.56,z+.04);
  }
  for(const side of [-1,1])k.rod(F.chrome,[x+side*.48,y+.38,z-.12],[x+side*.48,y+.15,z-.26],.012,true);
}
/** Authored at working dimensions: radius, joinery thickness and appliance detail
 * stay in metres. Repeated bays are modelled once into the module. */
export const openInteriorRecipes:RecipeSet=add=>{
  add('fit-open-concierge',k=>{
    k.slab(F.black,rounded(5.9,1.8,.35),0,.12,.016);
    k.slab(F.ivory,rounded(6.05,1.94,.42),.12,1.04,.025);
    k.slab(F.bronze,rounded(6.1,2,.44),1.04,1.07,.009);
    k.slab(F.stone,rounded(6.08,1.98,.43),1.07,1.12,.016);
    for(let i=0;i<13;i++)cb(k,F.bronze,-2.6+i*.43,.2,.972,.012,.72,.012,.003);
    for(const x of [-1.6,1.6]){cb(k,F.black,x,1.12,-.25,.46,.025,.3);cb(k,F.chrome,x,1.14,-.25,.025,.16,.025);
      cb(k,F.black,x,1.28,-.25,.62,.32,.035,.014);cb(k,F.screen,x,1.30,-.275,.58,.28,.004,.002);}
  });
  add('fit-open-cafe-bar',k=>{
    k.slab(F.black,rounded(6.15,.92,.16),0,.12,.014);
    cb(k,F.timber,0,.12,0,6.2,.86,.94,.015);
    for(let i=0;i<44;i++)cb(k,F.dark,-3.02+i*.14,.16,.476,.032,.73,.034,.006);
    k.slab(F.bronze,rounded(6.4,1.1,.2),.98,1.005,.007);
    k.slab(F.stone,rounded(6.38,1.08,.19),1.005,1.10,.016);
    k.rod(F.bronze,[-2.9,.22,.63],[2.9,.22,.63],.025,true);
    for(const x of [-2.8,-1.4,0,1.4,2.8])k.rod(F.bronze,[x,.22,.48],[x,.22,.63],.018,true);
    espresso(k,1.8,1.1,-.12);
    for(let i=0;i<4;i++)cup(k,-1.8+i*.24,1.1,-.05);
    cb(k,F.black,-.65,1.1,0,.42,.07,.32,.012);
    cb(k,F.screen,-.65,1.18,-.1,.36,.24,.025,.008);
  });
  add('fit-open-bar-stool',k=>{
    k.turned(F.bronze,[0,0,0],[[0,0],[.22,0],[.24,.025],[.22,.05],[.07,.09],[.035,.12],[.035,.69],[0,.69]],20);
    k.cylinder(F.black,[0,.69,0],.215,.04,24);k.cylinder(F.fabric,[0,.73,0],.24,.09,24);
    for(let i=0;i<24;i++){const a=i*Math.PI/12,b=(i+1)*Math.PI/12;
      k.rod(F.bronze,[Math.cos(a)*.16,.31,Math.sin(a)*.16],[Math.cos(b)*.16,.31,Math.sin(b)*.16],.009,true);}
  });
  add('fit-open-loft-desk',k=>{
    k.slab(F.timber,rounded(2.2,.85,.07),.73,.78,.012);
    for(const x of [-.98,.98]) {cb(k,F.black,x,0,0,.06,.74,.65,.01);cb(k,F.bronze,x,.025,0,.075,.025,.7);}
    cb(k,F.black,0,.31,-.26,1.9,.20,.025);cb(k,F.black,.18,.78,-.1,.32,.018,.23);
    cb(k,F.chrome,.18,.80,-.16,.026,.16,.026);cb(k,F.black,.18,.94,-.18,.68,.38,.04,.014);
    cb(k,F.screen,.18,.955,-.153,.65,.34,.008,.002);cb(k,F.black,.18,.78,.17,.46,.025,.17,.008);
    for(let row=0;row<4;row++)for(let key=0;key<13;key++)cb(k,F.zinc,-.01+key*.031,.805,.11+row*.032,.024,.005,.023,.002);
    for(let i=0;i<3;i++)cb(k,i%2?F.bronze:F.ivory,-.74,.78+i*.04,0,.28,.035,.36,.003);
    cup(k,.82,.78,.14);
  });
  add('fit-open-switchboard',k=>{
    cb(k,F.black,0,0,0,1.8,.12,.5);cb(k,F.steel,0,.12,0,1.76,2.05,.46,.025);
    for(const x of [-.58,0,.58]){
      cb(k,F.zinc,x,.25,.244,.53,1.75,.025,.014);cb(k,F.black,x,1.4,.26,.36,.34,.012,.01);
      cb(k,F.screen,x,1.44,.27,.30,.25,.008,.004);
      for(let i=0;i<6;i++)cb(k,F.black,x-.20+i*.08,.46,.27,.032,.16,.024,.005);
      for(const y of [.35,1.95])for(const dx of [-.23,.23])k.cylinder(F.chrome,[x+dx,y,.26],.013,.015,6);
      k.rod(F.black,[x+.2,.9,.28],[x+.2,1.14,.28],.018,true);
    }
  });
  add('fit-open-pump-skid',k=>{
    for(const x of [-1.22,1.22])cb(k,F.zinc,x,0,0,.12,.15,1.25);
    for(const z of [-.49,.49])cb(k,F.zinc,0,.06,z,2.8,.12,.12);
    for(const x of [-.72,.72]){
      k.cylinder(F.steel,[x,.2,0],.32,1.28,24);k.cylinder(F.chrome,[x,1.48,0],.34,.07,24);
      for(const y of [.35,.9,1.4])k.cylinder(F.zinc,[x,y,0],.327,.045,24);
      k.rod(F.zinc,[x,1.51,0],[x,1.96,0],.085,true);k.rod(F.zinc,[x,1.96,0],[0,1.96,0],.085,true);
      k.rod(F.chrome,[x,.38,.3],[x,.38,.58],.08,true);
      cb(k,F.black,x,.54,.325,.19,.14,.02);cb(k,F.ivory,x,.55,.342,.16,.11,.008);
      k.rod(F.black,[x,.60,.352],[x+.045,.63,.352],.004,true);
      cb(k,F.steel,x,1.65,.18,.3,.1,.2);k.rod(F.bronze,[x-.18,1.73,.18],[x+.18,1.73,.18],.02,true);
    }
    k.rod(F.zinc,[0,1.96,0],[0,2.25,0],.085,true);
    cb(k,F.black,0,.2,-.35,.45,.7,.32,.025);
    for(let i=0;i<8;i++)cb(k,F.chrome,-.2+i*.057,.25,-.52,.02,.52,.04);
  });
  add('fit-open-store-rack',k=>{
    for(const x of [-2.25,-.75,.75,2.25])for(const z of [-.40,.4]){cb(k,F.zinc,x,0,z,.055,2.5,.055,.006);
      for(let i=0;i<20;i++)cb(k,F.black,x,.10+i*.115,z+.029,.016,.035,.003,.001);}
    for(const y of [.12,.70,1.28,1.86,2.44]){cb(k,F.steel,0,y,0,4.6,.055,.9);cb(k,F.bronze,0,y+.006,.452,4.56,.043,.008);}
    for(let row=0;row<4;row++)for(let bay=0;bay<3;bay++)for(let j=0;j<2;j++){
      const x=-1.86+bay*1.5+j*.64,y=.18+row*.58;
      cb(k,(row+bay)%3?F.cardboard:F.steel,x,y,0,.53,.34+((row+j)%2)*.12,.67,.018);
      cb(k,F.paper,x,y+.08,.34,.22,.09,.005,.002);
      for(let n=0;n<7;n++)cb(k,F.black,x-.085+n*.025,y+.10,.344,n%3===0?.014:.006,.045,.002,.001);
      cb(k,F.black,x,y+.32,.35,.17,.035,.012,.006);
    }
    for(const x of [-1.5,0,1.5])k.rod(F.zinc,[x-.68,.18,-.40],[x+.68,2.44,-.40],.015,true);
  });
};
