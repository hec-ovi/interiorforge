import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import { triangulate } from '../../core/triangulate.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { clothSurface, loosePillow, softBox, tube, turned, upholsteryProfile, smoothSurface } from './model-geometry.js';

export const REFERENCE_MATERIAL = {
  veneer: 'cyberpunk/corpo-plaza-veneer/rich#smoked',
  stone: 'cyberpunk/corpo-plaza-stone/rich#polished',
  leather: 'cyberpunk/corpo-plaza-leather/rich#cream',
  publicFabric: 'cyberpunk/biotechnica-upholstery/rich#ivory',
  botanical: 'cyberpunk/corpo-plaza-bedding/rich#botanical',
  linen: 'cyberpunk/meridian-bedding/rich#ivory',
  steel: 'cyberpunk/interior-alloy/rich#satin-fine',
} as const;
const R=REFERENCE_MATERIAL;

/** Biotechnica 62410 / 62413: continuous angled seat/back shells, black outline,
 * two small neck pads and a lowered end bay. No generic loose sofa back pillows. */
export function biotechnicaSeat(k: Kit, chair = false): void {
  const width = chair ? .75 : 2.8, depth = chair ? .8 : 1, span = width - .24;
  const dz = depth / 1;
  const profile: [number, number][] = [[.225,.43],[.42,.45],[.477,.425],[.49,.395],[.49,-.125],[.505,-.18],[.77,-.34],[.84,-.38],[.857,-.415],[.842,-.455],[.79,-.474],[.215,-.474],[.215,.40]];
  const chassis: [number,number][] = [[0,.39],[.026,.455],[.218,.44],[.235,-.39],[.80,-.46],[.81,-.49],[.07,-.49],[.015,-.40]];
  softBox(k,F.black,[0,0,0],[width-.09,.035,depth*.90],{radius:.008});
  const count = chair ? 1 : 3, unit = span / count;
  for (let i = 0; i < count; i++) {
    const x = -span / 2 + unit * (i + .5), low = !chair && i === count - 1;
    upholsteryProfile(k,F.black,x,unit+.022,chassis.map(([y,z])=>[low&&y>.48?.48+(y-.48)*.36:y,z*dz]));
    const section = profile.map(([y,z])=>[low && y > .52 ? .52 + (y-.52)*.42 : y,z*dz] as [number,number]);
    upholsteryProfile(k, REFERENCE_MATERIAL.publicFabric, x, unit - .012, section);
    if (!low) {
      softBox(k,F.black,[x,.792,-.37*dz],[unit*.71,.108,.13*dz],{radius:.009,lean:.13});
      softBox(k,REFERENCE_MATERIAL.publicFabric,[x,.797,-.354*dz],[unit*.70,.101,.128*dz],{radius:.016,frontCrown:.010,lean:.13});
    }
  }
  // Exposed rigid perimeter with pale contact pads, as seen at the corner in62410.
  for (const x of [-width/2+.085,width/2-.085]) {
    upholsteryProfile(k,REFERENCE_MATERIAL.publicFabric,x,.085,[[.285,.39*dz],[.565,.39*dz],[.680,-.35*dz],[.705,-.405*dz],[.27,-.415*dz]]);
    softBox(k,F.black,[x,.58,.012],[.17,.085,depth*.88],{radius:.006,rotation:[.15,0,0]});
    softBox(k,REFERENCE_MATERIAL.publicFabric,[x,.652,.016],[.157,.046,depth*.68],{radius:.012,rotation:[.15,0,0]});
  }
}

/** V Corpo71942: eight narrow leather channels, two seat/back rows, a slim
 * exposed frame and open crossed supports. The pad pattern is actual geometry. */
export function corpoSeat(k: Kit, chair = false): void {
  const width=chair ? .75 : 2.8, depth=chair ? .8 : 1, cols=chair?2:8, span=width-.31, step=span/cols, dz=depth;
  for(const x of [-(chair ? .23 : width/2-.22),chair ? .23 : width/2-.22]){
    k.rod(F.black,[x,.025,.38*dz],[x,.389,-.29*dz],.054);
    k.rod(F.black,[x,.025,-.37*dz],[x,.389,.29*dz],.054);
    softBox(k,F.black,[x,0,0],[.085,.035,.83*dz],{radius:.009});
  }
  softBox(k,F.black,[0,.355,.026],[span+.11,.060,.73*dz],{radius:.008});
  softBox(k,F.bronze,[0,.393,.024],[span+.09,.008,.71*dz],{radius:.003});
  softBox(k,F.black,[0,.495,-.366*dz],[span+.07,.374,.054*dz],{radius:.006,lean:.13});
  for(let i=0;i<cols;i++){
    const x=-span/2+step*(i+.5);
    for(const z of [-.125*dz,.207*dz]) softBox(k,REFERENCE_MATERIAL.leather,[x,.412,z],[step-.009,.078,.326*dz],{radius:.023,crown:.007,wrinkles:.0017,detail:20});
    for(const row of [0,1]) softBox(k,REFERENCE_MATERIAL.leather,[x,.493+row*.198,(-.272-row*.031)*dz],[step-.009,.193,.105*dz],{radius:.022,frontCrown:.014,crown:.004,lean:.155,wrinkles:.0016,detail:20});
  }
  for(const x of [-width/2+.082,width/2-.082]){
    softBox(k,F.bronze,[x,.541,0],[.16,.035,.71*dz],{radius:.006,rotation:[.23,0,0]});
    softBox(k,F.black,[x,.567,0],[.145,.022,.684*dz],{radius:.006,rotation:[.23,0,0]});
    k.rod(F.black,[x,.377,-.28*dz],[x,.651,-.33*dz],.033);
  }
  if(!chair)loosePillow(k,F.bronze,[-width/2+.48,.61,-.15],.36,.37,.11,-.08,1.25);
}

/** V Corpo71618/71614: low dark floating deck, pale split headboard, white fitted
 * sheet and a rumpled patterned cover folded diagonally away from half the bed. */
export function corpoBed(k: Kit): void {
  softBox(k,F.black,[0,0,0],[1.64,.11,1.94],{radius:.014});
  softBox(k,F.bronze,[0,.11,0],[1.99,.018,2.29],{radius:.004});
  softBox(k,F.black,[0,.128,0],[2,.055,2.30],{radius:.012});
  // Reference frame has a thin luminous front rim, not a thick wooden box base.
  k.cbox(F.lensWarm,[0,.115,1.149],[1.96,.014,.002]);
  softBox(k,REFERENCE_MATERIAL.linen,[0,.183,.018],[1.80,.297,2.075],{radius:.058,crown:.006});
  clothSurface(k,REFERENCE_MATERIAL.linen,(u,v)=>{
    let x=(u-.5)*1.79,z=-1.012+v*2.063;
    // The fitted sheet follows the foam's rolled shoulder; a flat cloth cap
    // would leave a dark unsupported thread-like edge above the mattress.
    const ix=Math.max(-.842,Math.min(.842,x)),iz=Math.max(-.9795,Math.min(.9795,z-.018));
    let dx=x-ix,dz=z-.018-iz,distance=Math.hypot(dx,dz);
    if(distance>.057){dx*=.057/distance;dz*=.057/distance;distance=.057;x=ix+dx;z=.018+iz+dz;}
    const drop=.058-Math.sqrt(Math.max(0,.058**2-distance**2));
    const crown=.006*(1-(1-(x/.90)**4)*(1-((z-.018)/1.0375)**4));
    const fade=Math.max(0,1-distance/.058);
    const wrinkle=(.0038*Math.sin(x*36+z*9)*Math.exp(-((Math.abs(x)-.70)**2)/.023)+.002*Math.sin(z*43-x*12))*fade;
    return[x,.486-drop-crown+wrinkle,z];
  },1.79,2.063,.006,48,64);
  // Diagonal fold line reveals white sheet on the right, with a raised returned hem.
  clothSurface(k,REFERENCE_MATERIAL.botanical,(u,v)=>{
    const x=(u-.5)*1.91,head=-.56+1.01*u+.09*Math.sin(u*6.3),z=head+(1.117-head)*v;
    const roll=(.032+.026*Math.sin(u*7+.4)**2)*Math.exp(-((v-(.04+.022*Math.sin(u*4)))**2)/.0017);
    const folds=.048*Math.exp(-((x-.22-.42*(z-.1))**2)/.0038)*Math.sin(v*Math.PI)**2
      +.024*Math.exp(-((x+.37+.15*Math.sin(z*4))**2)/.007)*Math.sin(v*Math.PI)
      +.021*Math.exp(-((x+.72)**2)/.014-((z-.4)**2)/.05)
      +.003*Math.sin(z*41+x*17)*Math.exp(-((Math.abs(x)-.86)**2)/.006)*Math.sin(v*Math.PI);
    const side=Math.max(0,(Math.abs(x)-.86)/.095),foot=Math.max(0,(z-1.015)/.102);
    const drop=.088*Math.min(1,side)**1.4+.081*Math.min(1,foot)**1.4;
    let y=.530+roll+folds-drop;
    if(Math.abs(x)<.90&&z<1.055)y=Math.max(y,.497);
    return[x,y,z];
  },1.91,1.85,.018,64,64);
  loosePillow(k,REFERENCE_MATERIAL.botanical,[-.46,.487,-.728],.74,.41,.125,-.10,0,[.25,.35]);
  loosePillow(k,REFERENCE_MATERIAL.botanical,[.43,.487,-.762],.73,.40,.13,.065,0,[1.05,1.05]);
  for(const x of [-.493,.493]) softBox(k,F.linen,[x,.265,-1.102],[.981,.672,.075],{radius:.009});
  // Bent double piping line at the foot of the pale headboard.
  for(const offset of [0,.012])tube(k,F.black,[[-.92,.48+offset,-1.0645],[-.84,.56+offset,-1.0645],[.84,.56+offset,-1.0645],[.92,.48+offset,-1.0645]],.0018,false,8);
}

export function corpoBedside(k: Kit):void{
  for(const x of[-.215,.215])for(const z of[-.21,.21])softBox(k,F.black,[x,0,z],[.022,.215,.022],{radius:.003});
  softBox(k,F.linen,[0,.215,0],[.535,.135,.58],{radius:.009});
  softBox(k,F.bronze,[0,.350,0],[.55,.009,.60],{radius:.003});
  softBox(k,F.black,[0,.359,0],[.548,.026,.598],{radius:.004});
  softBox(k,F.linen,[0,.229,.289],[.501,.108,.013],{radius:.006});
  softBox(k,F.black,[0,.265,.296],[.15,.022,.006],{radius:.008});
  // Book/tablet stays low and purposeful, without using a stretched coffee table.
  softBox(k,F.black,[.07,.387,-.05],[.25,.012,.18],{radius:.008});
}

export function mediaCredenza(k:Kit):void{
  softBox(k,F.black,[0,0,0],[2.65,.10,.36],{radius:.008});
  softBox(k,REFERENCE_MATERIAL.veneer,[0,.10,-.015],[3,.51,.415],{radius:.008});
  softBox(k,F.bronze,[0,.605,0],[3,.007,.45],{radius:.002});
  softBox(k,REFERENCE_MATERIAL.stone,[0,.612,0],[3,.038,.45],{radius:.005});
  for(let i=0;i<5;i++){
    const x=-1.2+i*.6;
    softBox(k,F.black,[x,.155,.205],[.583,.396,.008],{radius:.003});
    softBox(k,REFERENCE_MATERIAL.veneer,[x,.163,.212],[.568,.38,.010],{radius:.003});
    for(const xx of [x-.022,x+.022])tube(k,F.bronze,[[xx,.32,.220],[xx,.43,.220]],.0035,false,8);
  }
  k.cbox(F.black,[0,.044,.201],[2.74,.023,.026]);
  k.cbox(F.lensWarm,[0,.047,.217],[2.70,.012,.004]);
}

/** A hanging cloth garment with an actual shoulder/sleeve outline and closed
 * thickness, rather than a rectangular card with clothing painted on it. */
function hangingGarment(k:Kit,slot:string,cx:number,cz:number):void{
  let outline:[number,number][]=[[-.15,.85],[.15,.85],[.16,1.25],[.22,1.00],[.285,1.015],[.245,1.46],[.105,1.60],[.048,1.56],[-.048,1.56],[-.105,1.60],[-.245,1.46],[-.285,1.015],[-.22,1.00],[-.16,1.25]];
  if(outline.reduce((a,p,i)=>{const q=outline[(i+1)%outline.length]!;return a+p[0]*q[1]-q[0]*p[1];},0)<0)outline=outline.reverse();
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[],steps=12;
  const point=(x:number,y:number,side:number)=>{
    const vertical=Math.sin((y-.85)/.75*Math.PI),body=Math.max(0,1-Math.abs(x)/.30);
    const full=.013+.026*Math.max(0,vertical)*body;
    const fold=.010*Math.sin(x*57+y*17)*Math.max(0,vertical)*body+.004*Math.sin(y*43-x*21)*body;
    const bend=.023*Math.sin((y-.85)*5.3)*Math.sin(x*7+1.4);
    return[cx+x,y,cz+bend+side*(full+fold)];
  };
  const vertex=(x:number,y:number,side:number)=>{const i=positions.length/3;positions.push(...point(x,y,side));uvs.push(x+.3,y-.85);return i;};
  for(const side of[1,-1])for(const triangle of triangulate(outline)){
    const [a,b,c]=triangle.map(i=>outline[i]!) as [[number,number],[number,number],[number,number]],grid=new Map<string,number>();
    for(let i=0;i<=steps;i++)for(let j=0;j<=steps-i;j++)grid.set(`${i}/${j}`,vertex(a[0]+(b[0]-a[0])*i/steps+(c[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*i/steps+(c[1]-a[1])*j/steps,side));
    const tri=(a:number,b:number,c:number)=>indices.push(...(side>0?[a,b,c]:[a,c,b]));
    for(let i=0;i<steps;i++)for(let j=0;j<steps-i;j++){
      tri(grid.get(`${i}/${j}`)!,grid.get(`${i+1}/${j}`)!,grid.get(`${i}/${j+1}`)!);
      if(i+j<steps-1)tri(grid.get(`${i+1}/${j}`)!,grid.get(`${i+1}/${j+1}`)!,grid.get(`${i}/${j+1}`)!);
    }
  }
  for(let e=0;e<outline.length;e++)for(let i=0;i<steps;i++){
    const a=outline[e]!,b=outline[(e+1)%outline.length]!,sample=(t:number,s:number)=>vertex(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,s);
    const fa=sample(i/steps,1),ba=sample(i/steps,-1),bb=sample((i+1)/steps,-1),fb=sample((i+1)/steps,1);
    indices.push(fa,ba,bb,fa,bb,fb);
  }
  k.mesh.addSurface(slot,smoothSurface({positions,uvs,indices,normals:[]}));
  tube(k,R.steel,[[cx-.21,1.52,cz],[cx-.055,1.63,cz],[cx+.055,1.63,cz],[cx+.21,1.52,cz]],.003,false,8);
  tube(k,R.steel,[[cx,1.63,cz],[cx,1.68,(cz+.035)/2],[cx+.018,1.72,.035],[cx+.022,1.748,.035],[cx,1.755,.035],[cx-.012,1.737,.035]],.0026,false,8);
}

export const referenceFurnitureRecipes:RecipeSet=add=>{
  add('fit-sofa-corpo',k=>corpoSeat(k));add('fit-chair-corpo',k=>corpoSeat(k,true));
  add('fit-bedside-corpo',corpoBedside);add('fit-media-corpo',mediaCredenza);
  add('fit-wardrobe-corpo',k=>{
    softBox(k,F.black,[0,0,0],[1.52,.07,.57],{radius:.007});
    softBox(k,R.veneer,[0,.07,-.309],[1.60,1.93,.032],{radius:.005});
    for(const x of[-.78,.78])softBox(k,R.veneer,[x,.07,0],[.040,1.93,.65],{radius:.005});
    softBox(k,R.veneer,[0,.07,0],[1.52,.030,.62],{radius:.004});
    softBox(k,R.veneer,[0,1.975,0],[1.52,.025,.62],{radius:.004});
    softBox(k,R.veneer,[.22,.10,0],[.030,1.875,.61],{radius:.003});
    for(const y of[.52,.98,1.42,1.84])softBox(k,R.veneer,[.495,y,.005],[.52,.024,.59],{radius:.003});
    tube(k,R.steel,[[-.738,1.733,.035],[.203,1.733,.035]],.010,false,16);
    hangingGarment(k,'cyberpunk/meridian-upholstery/rich#charcoal',-.47,-.005);
    hangingGarment(k,R.linen,-.12,.090);
    for(const y of[.545,1.005,1.445])for(let i=0;i<3;i++)loosePillow(k,i%2?R.linen:'cyberpunk/meridian-upholstery/rich#charcoal',[.49,y+i*.032,.04],.40,.38,.030,0);
    for(const x of[-.751,.751])softBox(k,F.bronze,[x,.085,.315],[.005,1.88,.006],{radius:.002});
    k.cbox(F.black,[0,1.963,.275],[1.44,.012,.028]);k.cbox(F.lensWarm,[0,1.956,.275],[1.40,.008,.023]);
  });
  add('fit-fridge-corpo',k=>{
    softBox(k,F.black,[0,0,0],[.66,.08,.65],{radius:.009});
    softBox(k,REFERENCE_MATERIAL.veneer,[0,.08,-.015],[.70,1.72,.67],{radius:.010});
    for(const [y,h]of[[.095,.52],[.628,1.145]]){
      softBox(k,F.black,[0,y!,.332],[.650,h!,.009],{radius:.004});
      softBox(k,REFERENCE_MATERIAL.veneer,[0,y!+.009,.337],[.630,h!-.018,.012],{radius:.004});
      tube(k,F.bronze,[[.242,y!+.08,.342],[.242,y!+h!-.08,.342]],.007,false,12);
    }
    for(let i=0;i<9;i++)k.cbox(F.black,[-.24+i*.06,.022,.327],[.035,.030,.004]);
    k.cbox(F.bronze,[.18,1.61,.349],[.11,.023,.002]);
  });
  add('fit-pantry-corpo',k=>{
    softBox(k,F.black,[0,0,0],[1.72,.07,.46],{radius:.006});
    softBox(k,REFERENCE_MATERIAL.veneer,[0,.07,-.237],[1.8,1.93,.026],{radius:.004});
    for(const x of[-.882,.882])softBox(k,REFERENCE_MATERIAL.veneer,[x,.07,0],[.036,1.93,.5],{radius:.003});
    for(const y of[.08,.49,.95,1.41,1.96])softBox(k,REFERENCE_MATERIAL.veneer,[0,y,0],[1.73,.028,.49],{radius:.003});
    for(const z of[-.12,.10])for(const x of[-.60,-.37,-.14]){
      turned(k,F.ceramic,[x,.518,z],[[0,0],[.08,0],[.11,.012],[.113,.018],[.103,.024],[.085,.015],[0,.012]],32);
    }
    for(let i=0;i<5;i++){
      const x=-.66+i*.32;
      turned(k,F.glass,[x,.978,0],[[.001,0],[.055,0],[.056,.009],[.045,.014],[.014,.026],[.010,.11],[.055,.14],[.063,.22],[.050,.27],[.047,.269],[.060,.218],[.052,.143],[.006,.112],[.006,.024],[.001,.020]],32);
      turned(k,F.glass,[x,1.438,-.01],[[.001,0],[.040,0],[.046,.018],[.047,.19],[.039,.225],[.016,.247],[.015,.305],[.014,.313],[.010,.312],[.010,.25],[.035,.220],[.041,.188],[.039,.010],[.001,.010]],36);
      softBox(k,F.bronze,[x,1.75,-.01],[.029,.019,.029],{radius:.004});
    }
    for(const x of[-.73,.73])softBox(k,F.black,[x,1.89,.15],[.01,.07,.018],{radius:.002});
    k.cbox(F.black,[0,1.884,.15],[1.63,.016,.035]);k.cbox(F.lensWarm,[0,1.876,.15],[1.6,.008,.030]);
  });
};
