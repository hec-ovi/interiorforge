import type { Kit } from '../../modules/kit.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import { FINISH as F } from '../../modules/finishes.js';
import { chamferBox } from './geometry.js';
import { tube } from '../luxury/model-geometry.js';
export const SERVICE_METAL = 'cyberpunk/interior-service-gunmetal/poor#aged';
const ENAMEL = 'cyberpunk/interior-service-enamel/poor#petrol';
const OCHRE = 'cyberpunk/interior-service-vinyl/poor#ochre';

/** True filleted conduit corners; the first/last point remain the connection sockets. */
export function conduit(k: Kit, slot: string, points: Vec3[], radius=.012, bend=.06): void {
  const route:Vec3[]=[points[0]!];
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1]!,p=points[i]!,b=points[i+1]!;
    const length=(q:Vec3)=>Math.hypot(...q.map((v,j)=>v-p[j]!));
    const da=length(a),db=length(b),r=Math.min(bend,da*.4,db*.4);
    const before=p.map((v,j)=>v+(a[j]!-v)*r/da)as Vec3,after=p.map((v,j)=>v+(b[j]!-v)*r/db)as Vec3;
    route.push(before);
    for(let j=1;j<=5;j++){const t=j/5;route.push(p.map((_,d)=>(1-t)**2*before[d]!+2*t*(1-t)*p[d]!+t*t*after[d]!)as Vec3);}
  }
  route.push(points.at(-1)!);tube(k,slot,route,radius,false,10);
}
function bolt(k:Kit,x:number,y:number,z:number):void{tube(k,F.zinc,[[x,y,z-.003],[x,y,z+.003]],.009,false,6);}
function enclosure(k:Kit,x:number,y:number,w:number,h:number,d:number,front:number,paint=ENAMEL):void{
  chamferBox(k,SERVICE_METAL,[x,y,front-d/2],[w,h,d],.012);
  chamferBox(k,F.black,[x,y+.023,front+.002],[w-.046,h-.046,.007],.008);
  chamferBox(k,paint,[x,y+.031,front+.009],[w-.066,h-.062,.012],.009);
  for(const sx of [-1,1])for(const yy of [y+.055,y+h-.055])bolt(k,x+sx*(w/2-.055),yy,front+.019);
  // Narrow steel hinge barrels and one recessed quarter-turn latch.
  for(const yy of [y+h*.22,y+h*.75])tube(k,F.zinc,[[x-w/2+.016,yy,front+.008],[x-w/2+.016,yy+.045,front+.008]],.007,false,10);
  tube(k,F.black,[[x+w/2-.07,y+h*.52,front+.016],[x+w/2-.07,y+h*.52,front+.024]],.015,false,12);
  k.cbox(F.zinc,[x+w/2-.07,y+h*.52-.006,front+.025],[.005,.012,.002]);
}

/** Clouds 74650/74651 + Hare 73142: mounted, unequal-depth service boxes;
 * an occupied internal rail, bundled routes and flexible loops instead of three
 * identical imaginary control kiosks. Canonical footprint remains 3 × .5 × 2m. */
export function electricalElevation(k:Kit):void{
  for(const x of [-1.35,1.35])chamferBox(k,SERVICE_METAL,[x,0,-.22],[.055,2,.045],.003);
  for(const y of [.12,1.02,1.94])chamferBox(k,SERVICE_METAL,[0,y,-.22],[2.76,.045,.045],.003);
  enclosure(k,-.93,1.13,.79,.77,.25,.07);
  enclosure(k,-.91,.38,.87,.51,.20,.13,SERVICE_METAL);
  enclosure(k,.02,1.49,.74,.40,.26,.09,SERVICE_METAL);
  enclosure(k,.98,.47,.78,1.09,.31,.19);
  // The small open service node exposes real terminals, recessed behind its rim.
  const x=.03,y=.63,w=.56,h=.69;
  chamferBox(k,SERVICE_METAL,[x,y,-.03],[w,h,.22],.014);
  k.cbox(F.black,[x,y+.025,.087],[w-.05,h-.05,.006]);
  for(const xx of [x-w/2+.018,x+w/2-.018])k.cbox(OCHRE,[xx,y+.014,.109],[.025,h-.028,.046]);
  for(const yy of [y+.014,y+h-.039])k.cbox(OCHRE,[x,yy,.109],[w-.02,.025,.046]);
  chamferBox(k,ENAMEL,[x-.105,y+.34,.11],[.24,.28,.045],.01);
  for(const yy of [y+.15,y+.55]){
    k.cbox(F.zinc,[x+.14,yy,.12],[.14,.014,.025]);
    for(let i=0;i<4;i++)chamferBox(k,F.zinc,[x+.087+i*.029,yy+.018,.13],[.022,.038,.021],.003);
  }
  for(let i=0;i<4;i++)conduit(k,i%2?OCHRE:F.black,[[x+.10+i*.028,y+.55,.14],[x+.10+i*.028,y+.28-i*.02,.14],[x-.10+i*.035,y+.28-i*.02,.145],[x-.10+i*.035,y+.34,.145]],.0035,.035);
  // A detached service cover parks beside the opening, within the same reservation.
  chamferBox(k,ENAMEL,[-.43,.69,.02],[.18,.61,.018],.009);
  for(let i=0;i<3;i++){
    const d=i*.031;
    conduit(k,F.zinc,[[-.67+d,1.13,.025],[-.67+d,1.01-d,.025],[-.14+d,1.01-d,.025],[-.14+d,1.32,.025]],.009,.055);
    conduit(k,SERVICE_METAL,[[.76+d,1.56,.055],[.76+d,1.97-d,.055],[-.18+d,1.97-d,.055],[-.18+d,1.89,.055]],.01,.04);
  }
  // Three protected cable arcs bridge low enclosures; ends enter their actual bodies.
  for(let i=0;i<3;i++){
    const points:Vec3[]=[];
    for(let j=0;j<=16;j++){const t=j/16;points.push([-.65+1.4*t,.39+.1*t-.20*Math.sin(t*Math.PI),.09+i*.025]);}
    tube(k,F.black,points,.012,false,10);
  }
  // Clamps sit across—not parallel to—the bundled drops.
  for(const yy of [1.68,1.82])k.cbox(F.zinc,[.79,yy,.076],[.13,.018,.045]);
  for(const xx of [-.52,-.3])k.cbox(F.zinc,[xx,.958,.051],[.025,.13,.026]);
  for(const yy of [.6,.64,.68,.72])k.cbox(F.black,[.93,yy,.207],[.48,.014,.004]);
}

/** Folded rectangular front with a true circular aperture and continuous reveal. */
function fanFace(k:Kit,cx:number,cy:number):void{
  const r=.435,w=.535,h=.455,z=.156;
  for(let i=0;i<48;i++){
    const points=(a:number)=>{const c=Math.cos(a),s=Math.sin(a),reach=Math.min(w/(Math.abs(c)||1e-9),h/(Math.abs(s)||1e-9));return {inner:[cx+c*r,cy+s*r,z]as Vec3,outer:[cx+c*reach,cy+s*reach,z]as Vec3};};
    const a=points(i*Math.PI/24),b=points((i+1)*Math.PI/24);
    k.mesh.addQuad(ENAMEL,[a.outer,b.outer,b.inner,a.inner]);
    k.mesh.addQuad(SERVICE_METAL,[a.inner,b.inner,[b.inner[0],b.inner[1],-.10],[a.inner[0],a.inner[1],-.10]]);
  }
}
function fan(k:Kit,cx:number,cy:number):void{
  const r=.43;fanFace(k,cx,cy);
  // Real opening: only a dark recessed back, annular housing and separate blades.
  tube(k,F.black,[[cx,cy,-.10],[cx,cy,-.09]],r,false,48);
  for(const rr of [r,r+.018]){const p:Vec3[]=[];for(let j=0;j<48;j++){const a=j/48*Math.PI*2;p.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,.17]);}tube(k,F.zinc,p,.008,true,6);}
  for(let blade=0;blade<5;blade++){
    const a=blade*Math.PI*2/5, point=(radius:number,theta:number,z:number):Vec3=>[cx+Math.cos(theta)*radius,cy+Math.sin(theta)*radius,z];
    const q:[Vec3,Vec3,Vec3,Vec3]=[point(.07,a,.08),point(.35,a+.2,.11),point(.39,a+.56,.10),point(.13,a+.78,.065)];
    k.mesh.addQuad(SERVICE_METAL,q);k.mesh.addQuad(SERVICE_METAL,[q[3],q[2],q[1],q[0]]);
  }
  tube(k,F.zinc,[[cx,cy,.09],[cx,cy,.16]],.085,false,20);
  for(const rr of [.13,.21,.29,.37,.425]){const p:Vec3[]=[];for(let j=0;j<48;j++){const a=j/48*Math.PI*2;p.push([cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,.205]);}tube(k,SERVICE_METAL,p,.0035,true,5);}
  for(let j=0;j<8;j++){const a=j*Math.PI/4;tube(k,SERVICE_METAL,[[cx+Math.cos(a)*.1,cy+Math.sin(a)*.1,.206],[cx+Math.cos(a)*.425,cy+Math.sin(a)*.425,.206]],.0035,false,5);}
}
/** Hiromi 70805/70807 fan/grille form adapted to an indoor ventilation bank. */
export function ventilationBank(k:Kit):void{
  for(const x of [-1.05,1.05])chamferBox(k,SERVICE_METAL,[x,0,0],[.18,.15,.46],.008);
  // Split front piers retain the two circular insets rather than capping the fans.
  for(const x of [-1.19,0,1.19])chamferBox(k,ENAMEL,[x,.15,0],[.11,1.13,.45],.009);
  for(const y of [.15,1.17])chamferBox(k,ENAMEL,[0,y,0],[2.49,.11,.45],.009);
  k.cbox(SERVICE_METAL,[0,.26,-.205],[2.28,.91,.04]);
  fan(k,-.6,.72);fan(k,.6,.72);
  chamferBox(k,SERVICE_METAL,[0,1.3,-.035],[1.94,.66,.38],.015);
  for(let i=0;i<9;i++)chamferBox(k,F.zinc,[0,1.36+i*.058,.175],[1.77,.024,.03],.004);
  for(const x of [-.91,.91])for(const y of [1.34,1.91])bolt(k,x,y,.166);
  // Raised drain pan and rear condensate outlet stay entirely inside the unit.
  k.cbox(F.zinc,[0,.055,-.07],[1.92,.008,.22]);
  for(const z of [-.175,.035])k.cbox(SERVICE_METAL,[0,.063,z],[1.92,.027,.013]);
  conduit(k,F.zinc,[[.84,.055,-.07],[.84,.032,-.07],[.84,.032,-.19],[.84,.012,-.19]],.01,.016);
}
