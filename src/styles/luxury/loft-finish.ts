import type { Point } from '../../core/geom.js';
import type { LightFixture, RoomKind } from '../../core/types.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { RoomFinish } from '../../placements/finish.js';
import { uvToWorld, type Frame, type UvRect } from '../../layout/uv.js';

/** Apartment1702 originals175418/175432/175531/175623/175638/175840:
 * timber soffits, fluted dark bays, fine metal joints and an inlaid gallery fascia.
 * These are private duplex finishes; selecting the building style alone must not
 * change its public Biotechnica lobby or shared circulation. */
export const LOFT1702_FINISH = {
  wall: 'wall-field-loft1702-ribbed', wetWall: 'wall-field-loft1702-wet',
  ceiling: 'ceiling-field-loft1702-timber', wetCeiling: 'ceiling-field-loft1702-dark',
  floor: 'floor-slab-loft1702-stone', timberFloor:'floor-slab-loft1702-timber',
  floorSupport:'floor-slab-loft1702-support',stoneSkin:'floor-finish-loft1702-stone',timberSkin:'floor-finish-loft1702-timber', stair: 'floor-slab-loft1702-stair',
  rug: 'floor-rug-loft1702-red', cove: 'ceiling-cove-loft1702-red',warmCove:'ceiling-cove-loft1702-warm',
  ribPitch: .05, panelPitch: 1.5, boardPitch: .25, boardLength: 2.4,
  wallDepth: .095, coveColor: [1,.035,.022] as [number,number,number],
  coveLumensPerMetre: 45,
} as const;

const M={
  timber:'cyberpunk/corpo-plaza-veneer/rich#walnut',
  darkTimber:'cyberpunk/corpo-plaza-veneer/rich#smoked',
  panel:'cyberpunk/corporate-panel/mid#native',
  black:'cyberpunk/paired-cladding-metal/mid#obsidian',
  bronze:'cyberpunk/interior-bronze/rich#plain',
  paleStone:'cyberpunk/loft1702-stone/rich#pale',
  darkStone:'cyberpunk/corpo-plaza-stone/rich#polished',
  red:'cyberpunk/light-fixture/rich#loft-red',warm:'cyberpunk/light-fixture/rich#corpo-amber',
  rug:'cyberpunk/loft1702-rug/rich#red',
} as const;
const CELL=.5,JOINT=.004;
/** Pieces narrower than this are not placed (their scale would round to zero). */
const MIN_PIECE=.001;
type Sink=Pick<PlacementBuilder,'module'>;
export type Loft1702WallMode='bays'|'fluted'|'panel'|'pattern';

export function loft1702Finish(room:RoomKind,base:RoomFinish,options:{privateRoom:boolean}):RoomFinish{
  if(!options.privateRoom)return base;
  const wet=room==='bathroom'||room==='toilets'||room==='locker_room';
  const timber=room==='bedroom'||room==='corridor'||room==='office_private'||room==='storage';
  return{...base,family:'luxury',frame:undefined,band:undefined,services:undefined,
    field:wet?LOFT1702_FINISH.wetWall:LOFT1702_FINISH.wall,
    floor:wet?'floor-slab-luxury-polished':timber?LOFT1702_FINISH.timberFloor:LOFT1702_FINISH.floor,
    ceiling:wet?LOFT1702_FINISH.wetCeiling:LOFT1702_FINISH.ceiling,
    cove:room==='living'||room==='corridor'?LOFT1702_FINISH.cove:LOFT1702_FINISH.warmCove,spot:'ceiling-spot'};
}
export const isLoft1702Wall=(module:string):boolean=>module===LOFT1702_FINISH.wall||module===LOFT1702_FINISH.wetWall;
export const isLoft1702Ceiling=(module:string):boolean=>module===LOFT1702_FINISH.ceiling||module===LOFT1702_FINISH.wetCeiling;

/** Only the linear accent source becomes restrained red. Task/downlights stay warm white. */
export function loft1702AccentLight(light:LightFixture):LightFixture{
  if(light.kind!=='cove')return light;
  return{...light,color:[...LOFT1702_FINISH.coveColor],colorTemperatureK:2700,
    intensity:Math.min(light.intensity,Math.max(.1,light.length)*LOFT1702_FINISH.coveLumensPerMetre),range:2.5};
}

function field(k:Kit,slot:string,depth=.076):void{k.cbox(slot,[0,0,depth/2],[CELL,CELL,depth]);}
function floor(k:Kit,slot:string):void{
  k.cbox(M.black,[0,-.15,0],[CELL,.14,CELL]);
  k.cbox(slot,[0,-.01,0],[CELL,.01,CELL]);
}
function cove(k:Kit,lens:string=M.red):void{
  // A room-facing optic sits in a narrow slot, with a real tray/back and
  // upper/lower lips. The old upward-only optic vanished behind its tall lip.
  // The visible emitting face remains at the light record's local[0,0,0].
  k.cbox(M.darkTimber,[0,-.080,-.064],[CELL,.320,.018]);
  k.cbox(M.black,[0,-.036,-.040],[CELL,.014,.073]);
  k.cbox(M.darkTimber,[0,-.080,-.008],[CELL,.055,.020]);
  k.cbox(M.darkTimber,[0,.016,-.020],[CELL,.224,.040]);
  for(const y of[-.022,.016])k.cbox(M.bronze,[0,y,0],[CELL,.003,.004]);
  k.cbox(lens,[0,-.007,-.001],[CELL,.014,.002]);
}
function wave(k:Kit):void{
  // Closed flat metal ribbons rather than hundreds of individual square rods.
  // Eight stations per 500mm wave keep chord error below0.31mm.
  const steps=8,half=.00075,back=.057,front=.059;
  for(let row=0;row<8;row++){
    const points=Array.from({length:steps+1},(_,i)=>{
      const t=i/steps,x=-.249+t*.498,y=-.192+row*.024+.004*Math.sin(t*Math.PI*2+row*.36);
      const dy=.004*2*Math.PI*Math.cos(t*Math.PI*2+row*.36),length=Math.hypot(.498,dy);
      return{left:[x-dy/length*half,y+.498/length*half]as Point,right:[x+dy/length*half,y-.498/length*half]as Point};
    });
    const at=(p:Point,z:number):Vec3=>[p[0],p[1],z];
    for(let i=0;i<steps;i++){
      const a=points[i]!,b=points[i+1]!;
      k.mesh.addQuad(M.bronze,[at(a.left,front),at(a.right,front),at(b.right,front),at(b.left,front)]);
      k.mesh.addQuad(M.bronze,[at(a.right,back),at(a.left,back),at(b.left,back),at(b.right,back)]);
      k.mesh.addQuad(M.bronze,[at(a.left,back),at(a.left,front),at(b.left,front),at(b.left,back)]);
      k.mesh.addQuad(M.bronze,[at(a.right,front),at(a.right,back),at(b.right,back),at(b.right,front)]);
    }
    const a=points[0]!,b=points.at(-1)!;
    k.mesh.addQuad(M.bronze,[at(a.left,back),at(a.right,back),at(a.right,front),at(a.left,front)]);
    k.mesh.addQuad(M.bronze,[at(b.right,back),at(b.left,back),at(b.left,front),at(b.right,front)]);
  }
}
function feature(k:Kit):void{
  field(k,M.black,.071);
  // Nested angular inlay: a separate shallow metal detail on a continuous panel.
  for(let row=0;row<7;row++){
    const y=.023+row*.065;
    const p:Vec3[]=[[-.235,y,.075],[-.080,y+.052,.075],[.070,y+.009,.075],[.235,y+.056,.075]];
    for(let i=0;i+1<p.length;i++)k.rod(M.bronze,p[i]!,p[i+1]!,.0022);
  }
}

export const loft1702FinishRecipes:RecipeSet=add=>{
  // Marker modules provide closed fallback fields; the placement helpers below
  // assemble the actual ribs/boards without scaling their cross sections.
  add(LOFT1702_FINISH.wall,k=>field(k,M.panel));
  add(LOFT1702_FINISH.wetWall,k=>field(k,M.paleStone));
  add('loft1702-wall-backing',k=>field(k,M.black,.04));
  add('loft1702-wall-panel',k=>k.cbox(M.panel,[0,0,.058],[CELL,CELL,.032]));
  add('loft1702-wall-flute-backing',k=>k.cbox(M.darkTimber,[0,0,.051],[CELL,CELL,.018]));
  add('loft1702-wall-rib',k=>k.mesh.addPrism(M.darkTimber,[[-.015,.060],[.015,.060],[.015,.077],[.010,.085],[-.010,.085],[-.015,.077]],0,CELL));
  add('loft1702-wall-joint',k=>k.cbox(M.bronze,[0,0,.080],[.004,CELL,.004]));
  add('loft1702-wall-skirt',k=>{
    k.cbox(M.black,[0,0,.047],[CELL,.082,.094]);
    k.cbox(M.bronze,[0,.080,.087],[CELL,.003,.006]);
  });
  add('loft1702-wall-feature',feature);
  add(LOFT1702_FINISH.ceiling,k=>k.cbox(M.timber,[0,0,0],[CELL,.047,CELL]));
  add(LOFT1702_FINISH.wetCeiling,k=>k.cbox(M.panel,[0,0,0],[CELL,.047,CELL]));
  add('loft1702-ceiling-backing',k=>k.cbox(M.black,[0,.035,0],[CELL,.030,CELL]));
  add('loft1702-ceiling-board',k=>k.cbox(M.timber,[0,0,0],[CELL,.036,CELL]));
  add('loft1702-ceiling-dark-panel',k=>k.cbox(M.panel,[0,0,0],[CELL,.036,CELL]));
  add('loft1702-soffit-edge',k=>{
    k.cbox(M.darkTimber,[0,-.040,0],[CELL,.108,.055]);
    k.cbox(M.bronze,[0,-.042,.029],[CELL,.004,.005]);
  });
  add(LOFT1702_FINISH.floor,k=>floor(k,M.paleStone));
  add(LOFT1702_FINISH.timberFloor,k=>floor(k,M.timber));
  add(LOFT1702_FINISH.floorSupport,k=>k.cbox(M.black,[0,-.15,0],[CELL,.135,CELL]));
  add(LOFT1702_FINISH.stoneSkin,k=>k.cbox(M.paleStone,[0,-.015,0],[CELL,.015,CELL]));
  add(LOFT1702_FINISH.timberSkin,k=>k.cbox(M.timber,[0,-.015,0],[CELL,.015,CELL]));
  add(LOFT1702_FINISH.stair,k=>floor(k,M.timber));
  add(LOFT1702_FINISH.rug,k=>k.cbox(M.rug,[0,0,0],[CELL,.009,CELL]));
  add(LOFT1702_FINISH.cove,k=>cove(k));
  add(LOFT1702_FINISH.warmCove,k=>cove(k,M.warm));
  add('loft1702-gallery-backing',k=>k.cbox(M.darkTimber,[0,-.32,-.12],[CELL,.32,.30]));
  add('loft1702-gallery-front',k=>k.cbox(M.black,[0,-.298,.047],[CELL,.270,.020]));
  add('loft1702-gallery-inlay',wave);
  add('loft1702-gallery-rail',k=>k.cbox(M.bronze,[0,0,.060],[CELL,.010,.014]));
  add('loft1702-gallery-channel',k=>{
    k.cbox(M.black,[0,-.017,.038],[CELL,.041,.036]);
    for(const y of[-.020,.010])k.cbox(M.darkTimber,[0,y,.064],[CELL,.008,.018]);
    k.cbox(M.red,[0,-.004,.058],[CELL,.006,.004]);
  });
};

/** Fixed lattice intervals clipped only at the containing face, never redistributed. */
export function loft1702Intervals(start:number,end:number,pitch:number,phase=0):[number,number][]{
  if(!(end>start)||!(pitch>0))return[];
  const points=[start];
  // a lattice line within rounding of either face cuts no piece
  for(let n=Math.floor((start-phase)/pitch)+1;phase+n*pitch<end-1e-8;n++)if(phase+n*pitch>start+1e-8)points.push(phase+n*pitch);
  points.push(end);return points.slice(0,-1).map((a,i)=>[a,points[i+1]!]);
}

/** Input is an already aperture-cut face: midpoint on its back plane, local +Z
 * toward its room. phase is the wall-axis coordinate of the fragment's left end. */
export function placeLoft1702Wall(builder:Sink,room:string,at:Vec3,width:number,height:number,rotationY:number,
  options:{phase?:number;mode?:Loft1702WallMode;wet?:boolean}={}):void{
  if(width<=1e-5||height<=1e-5)return;
  const phase=options.phase??0,mode=options.mode??'bays',c=Math.cos(rotationY),s=Math.sin(rotationY);
  // A piece under a millimetre (a lattice interval clipped at the face end) is left out:
  // it would publish a zero scale.
  const place=(id:string,x:number,y:number,w:number,h:number)=>{if(w>=MIN_PIECE&&h>=MIN_PIECE)builder.module(id,room,[at[0]+x*c,at[1]+y,at[2]-x*s],[w/CELL,h/CELL,1],rotationY);};
  if(options.wet){place(LOFT1702_FINISH.wetWall,0,0,width,height);return;}
  place('loft1702-wall-backing',0,0,width,height);
  const skirt=at[1]>=-1e-6&&at[1]<.001&&height>.12;
  for(const[a,b]of loft1702Intervals(phase,phase+width,LOFT1702_FINISH.panelPitch)){
    const lo=a-phase-width/2,hi=b-phase-width/2,fluted=mode==='fluted'||mode==='bays'&&Math.floor((a+1e-6)/1.5)%2===0;
    const inset=Math.min(JOINT/2,(hi-lo)/8),bottom=skirt ? .084 : 0;
    place(fluted?'loft1702-wall-flute-backing':'loft1702-wall-panel',(lo+hi)/2,bottom,hi-lo-inset*2,height-bottom);
    if(fluted){
      for(let n=Math.ceil((a+.015-.025)/LOFT1702_FINISH.ribPitch);.025+n*LOFT1702_FINISH.ribPitch<=b-.015+1e-8;n++){
        const x=.025+n*LOFT1702_FINISH.ribPitch-phase-width/2;
        // Rib X/Z are never scaled: only its vertical length follows the opening cut.
        builder.module('loft1702-wall-rib',room,[at[0]+x*c,at[1]+bottom,at[2]-x*s],[1,(height-bottom)/CELL,1],rotationY);
      }
    }else if(mode==='pattern'){
      for(const[x0,x1]of loft1702Intervals(a,b,CELL))for(const[y0,y1]of loft1702Intervals(bottom,height,CELL)){
        if(x1-x0<CELL-1e-6||y1-y0<CELL-1e-6)continue;
        place('loft1702-wall-feature',(x0+x1)/2-phase-width/2,y0,CELL,CELL);
      }
    }
    if(a>phase+1e-7)builder.module('loft1702-wall-joint',room,[at[0]+lo*c,at[1],at[2]-lo*s],[1,height/CELL,1],rotationY);
  }
  if(skirt)place('loft1702-wall-skirt',0,0,width,CELL);
}

/** Receives only ceiling rectangles already cut around the true duplex openings.
 * No automatic perimeter LEDs are added to fragment edges: planned cove fixtures
 * use ceiling-cove-loft1702-red at the actual room boundaries. */
export function placeLoft1702Ceiling(builder:Sink,room:string,rect:UvRect,y:number,frame:Frame,
  options:{dark?:boolean;phase?:Point;grainAxis?:'u'|'v';edges?:('u0'|'u1'|'v0'|'v1')[]}={}):void{
  const rotation=-frame.angleDeg*Math.PI/180,phase=options.phase??[0,0];
  const place=(id:string,r:UvRect)=>{if(r.lu<MIN_PIECE||r.lv<MIN_PIECE)return;const[x,z]=uvToWorld([r.u+r.lu/2,r.v+r.lv/2],frame);builder.module(id,room,[x,y,z],[r.lu/CELL,1,r.lv/CELL],rotation);};
  place('loft1702-ceiling-backing',rect);
  const longV=options.grainAxis!=='u';
  const us=loft1702Intervals(rect.u,rect.u+rect.lu,options.dark ? 1.5 : longV ? .25 : 2.4,phase[0]);
  const vs=loft1702Intervals(rect.v,rect.v+rect.lv,options.dark ? 2.4 : longV ? 2.4 : .25,phase[1]);
  for(const[u0,u1]of us)for(const[v0,v1]of vs){
    const w=u1-u0,d=v1-v0,gapU=Math.min(.002,w/4),gapV=Math.min(.002,d/4);
    const left=u0>rect.u+1e-8?gapU/2:0,right=u1<rect.u+rect.lu-1e-8?gapU/2:0;
    const back=v0>rect.v+1e-8?gapV/2:0,front=v1<rect.v+rect.lv-1e-8?gapV/2:0;
    const r={u:u0+left,v:v0+back,lu:w-left-right,lv:d-back-front};
    if(longV||options.dark)place(options.dark?'loft1702-ceiling-dark-panel':'loft1702-ceiling-board',r);
    else if(r.lu>=MIN_PIECE&&r.lv>=MIN_PIECE){const[x,z]=uvToWorld([r.u+r.lu/2,r.v+r.lv/2],frame);builder.module('loft1702-ceiling-board',room,[x,y,z],[r.lv/CELL,1,r.lu/CELL],rotation+Math.PI/2);}
  }
  for(const edge of options.edges??[]){
    const horizontal=edge[0]==='v',length=horizontal?rect.lu:rect.lv;
    const point:Point=horizontal?[rect.u+rect.lu/2,edge==='v0'?rect.v+.028:rect.v+rect.lv-.028]:[edge==='u0'?rect.u+.028:rect.u+rect.lu-.028,rect.v+rect.lv/2];
    const[x,z]=uvToWorld(point,frame);
    builder.module('loft1702-soffit-edge',room,[x,y,z],[length/CELL,1,1],rotation+(horizontal?0:Math.PI/2));
  }
}

/** Gallery edge endpoints are core-frame UV, already cut around the stair arrival.
 * normal points into the void; body/soffit return remain on its occupied side.
 * Returned light positions include options.elevation (default0 for proof scenes). */
export function placeLoft1702GalleryFascia(builder:Sink,room:string,a:Point,b:Point,y:number,frame:Frame,
  options:{height?:number;normal?:Point;elevation?:number;id?:string}={}):LightFixture[]{
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.01)return[];
  const tangent:Point=[(b[0]-a[0])/length,(b[1]-a[1])/length],normal=options.normal??[-tangent[1],tangent[0]];
  const worldNormal:Point=[normal[0]*frame.cos-normal[1]*frame.sin,normal[0]*frame.sin+normal[1]*frame.cos];
  const rotation=Math.atan2(worldNormal[0],worldNormal[1]),center:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2],height=options.height??.32;
  const[x,z]=uvToWorld(center,frame),place=(id:string,offset:number,yy:number,w:number,sy=1)=>{
    const px=x+Math.cos(rotation)*offset,pz=z-Math.sin(rotation)*offset;
    builder.module(id,room,[px,y+yy,pz],[w/CELL,sy,1],rotation);
  };
  place('loft1702-gallery-backing',0,0,length,height/.32);
  place('loft1702-gallery-front',0,0,length,height/.32);
  for(let i=0;i<Math.floor(length/CELL);i++)place('loft1702-gallery-inlay',-length/2+CELL*(i+.5),-(height-.20)/2,CELL);
  place('loft1702-gallery-rail',0,-.025,length);place('loft1702-gallery-rail',0,-height+.006,length);
  place('loft1702-gallery-channel',0,-height,length);
  const id=options.id??`loft1702-fascia-${room}-${a[0].toFixed(3)}-${a[1].toFixed(3)}`;
  return[{id,kind:'cove',room,position:[x+worldNormal[0]*.060,y-height-.001+(options.elevation??0),z+worldNormal[1]*.060],
    length,axis:[Math.cos(rotation),0,-Math.sin(rotation)],direction:[worldNormal[0]/Math.hypot(1,.35),-.35/Math.hypot(1,.35),worldNormal[1]/Math.hypot(1,.35)],angleDeg:(-rotation*180/Math.PI+360)%360,
    intensity:length*25,color:[...LOFT1702_FINISH.coveColor],colorTemperatureK:2700,range:2,beamDeg:150,diffuse:.85,facing:'down'}];
}
