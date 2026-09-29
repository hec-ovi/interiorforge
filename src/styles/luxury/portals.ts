import type { Point } from '../../core/geom.js';
import { triangulate } from '../../core/triangulate.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { FINISH as F } from '../../modules/finishes.js';
import { MERIDIAN_IVORY } from './surfaces.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { Frame } from '../../layout/uv.js';
import { uvToWorld } from '../../layout/uv.js';

/** Biotechnica 62652/63022/63027: broad formed casing, rounded returns,
 * separate recessed outer plate and real vertical service slots. Corners never stretch. */
export const PUBLIC_PORTAL = { radius: .24, band: .30, slotHeight: 1.2, slotBase: .65 } as const;
const CELL = .5;
type Band = {a: number; b: number; da: number; db: number; slot: string};
const bands: Band[] = [
  {a: 0, b: .022, da: .114, db: .114, slot: F.black},
  ...Array.from({length: 12}, (_,i) => {
    const a=i/12, b=(i+1)/12;
    return {a:.022+.048*a,b:.022+.048*b,da:.114+.056*Math.sin(a*Math.PI/2),db:.114+.056*Math.sin(b*Math.PI/2),slot:MERIDIAN_IVORY};
  }),
  {a:.07,b:.24,da:.17,db:.17,slot:MERIDIAN_IVORY},
  {a:.24,b:.248,da:.116,db:.116,slot:F.black},
  {a:.248,b:.282,da:.149,db:.149,slot:MERIDIAN_IVORY},
  {a:.282,b:.30,da:.149,db:.095,slot:MERIDIAN_IVORY},
];

/** Closed prism through z, with a real concave outline where a slot removes skin. */
function xyPrism(k: Kit, slot: string, polygon: Point[], z0: number, z1: number): void {
  const area=polygon.reduce((s,p,i)=>{const q=polygon[(i+1)%polygon.length]!;return s+p[0]*q[1]-q[0]*p[1];},0);
  const p=area<0?[...polygon].reverse():polygon;
  const triangles=triangulate(p);
  for(const [z,n] of [[z0,-1],[z1,1]] as const){
    const positions=p.flatMap(([x,y])=>[x,y,z]),normals=p.flatMap(()=>[0,0,n]);
    const indices=triangles.flatMap(([a,b,c])=>n>0?[a,b,c]:[a,c,b]);
    k.mesh.addSurface(slot,{positions,normals,uvs:p.flatMap(([x,y])=>[x,-y]),indices});
  }
  for(let i=0;i<p.length;i++){const a=p[i]!,b=p[(i+1)%p.length]!;
    k.mesh.addQuad(slot,[[a[0],a[1],z0],[b[0],b[1],z0],[b[0],b[1],z1],[a[0],a[1],z1]]);
  }
}
function slope(r:number,a:number,b:number,da:number,db:number):number {
  return a>=.022-1e-7&&b<=.07+1e-7 ? .056/.048*Math.PI/2*Math.cos((r-.022)/.048*Math.PI/2) : (db-da)/(b-a);
}
function shaded(k:Kit,slot:string,p:[number,number,number][],normal:(p:[number,number,number])=>[number,number,number]):void{
  k.mesh.addSurface(slot,{positions:p.flat(),normals:p.flatMap(v=>{const n=normal(v),l=Math.hypot(...n);return n.map(x=>x/l);}),
    uvs:p.flatMap(([x,y])=>[x,-y]),indices:[0,1,2,0,2,3]});
}
function profileBox(k:Kit, slot:string, x0:number,x1:number,y0:number,y1:number,d0:number,d1:number,axis:'x'|'y'):void{
  const d=(x:number,y:number)=>axis==='x'?(x===x0?d0:d1):(y===y0?d0:d1);
  const p=(x:number,y:number,s:number):[number,number,number]=>[x,y,s*d(x,y)];
  const round=slot===MERIDIAN_IVORY;
  const normal=(v:[number,number,number]):[number,number,number]=>{
    const a=axis==='x'?Math.min(Math.abs(x0),Math.abs(x1)):y0,b=axis==='x'?Math.max(Math.abs(x0),Math.abs(x1)):y1;
    const direction=axis==='x'&&x1<=0?-1:1;
    const g=round?slope(axis==='x'?Math.abs(v[0]):v[1],a,b,direction>0?d0:d1,direction>0?d1:d0):(d1-d0)/(axis==='x'?x1-x0:y1-y0);
    return[axis==='x'?-g*direction:0,axis==='y'?-g:0,v[2]>0?1:-1];
  };
  shaded(k,slot,[p(x0,y0,1),p(x1,y0,1),p(x1,y1,1),p(x0,y1,1)],normal);
  shaded(k,slot,[p(x1,y0,-1),p(x0,y0,-1),p(x0,y1,-1),p(x1,y1,-1)],normal);
  k.mesh.addQuad(slot,[p(x0,y1,-1),p(x0,y1,1),p(x1,y1,1),p(x1,y1,-1)]);
  k.mesh.addQuad(slot,[p(x0,y0,1),p(x0,y0,-1),p(x1,y0,-1),p(x1,y0,1)]);
  k.mesh.addQuad(slot,[p(x0,y0,-1),p(x0,y0,1),p(x0,y1,1),p(x0,y1,-1)]);
  k.mesh.addQuad(slot,[p(x1,y0,1),p(x1,y0,-1),p(x1,y1,-1),p(x1,y1,1)]);
}
function slottedBand(k:Kit,sign:number):void{
  const x0=.07,x1=.24,cx=.155,r=.012,lo=.12,hi=1.08;
  const transform=(p:Point[])=>p.map(([x,y])=>[sign*x,y] as Point);
  xyPrism(k,F.black,transform([[x0,0],[x1,0],[x1,1.2],[x0,1.2]]),-.14,.14);
  const strips:Point[][]=[[[x0,0],[cx-r,0],[cx-r,1.2],[x0,1.2]],[[cx+r,0],[x1,0],[x1,1.2],[cx+r,1.2]]];
  const bottom:Point[]=[[cx-r,0],[cx+r,0],[cx+r,lo+r]];
  for(let i=1;i<=24;i++){const a=-Math.PI*i/24;bottom.push([cx+r*Math.cos(a),lo+r+r*Math.sin(a)]);}
  strips.push(bottom);
  const top:Point[]=[[cx+r,1.2],[cx-r,1.2],[cx-r,hi-r]];
  for(let i=1;i<=24;i++){const a=Math.PI-Math.PI*i/24;top.push([cx+r*Math.cos(a),hi-r+r*Math.sin(a)]);}
  strips.push(top);
  for(const p of strips)for(const side of [-1,1])xyPrism(k,MERIDIAN_IVORY,transform(p),side>0?.14:-.17,side>0?.17:-.14);
}
function corner(k:Kit,sign:number):void{
  const radius=PUBLIC_PORTAL.radius;
  for(const b of bands){
    const r0=radius+b.a,r1=radius+b.b;
    const p=(r:number,a:number,z:number):[number,number,number]=>[sign*r*Math.cos(a),r*Math.sin(a),z];
    for(let i=0;i<32;i++){
      const a=i*Math.PI/64, c=(i+1)*Math.PI/64;
      const quad=(v:[number,number,number][])=>k.mesh.addQuad(b.slot,(sign>0?v:[...v].reverse()) as [[number,number,number],[number,number,number],[number,number,number],[number,number,number]]);
      const skin=(v:[number,number,number][])=>shaded(k,b.slot,sign>0?v:[...v].reverse(),point=>{const r=Math.hypot(point[0],point[1]),g=slope(r-radius,b.a,b.b,b.da,b.db);return[-g*point[0]/r,-g*point[1]/r,point[2]>0?1:-1];});
      skin([p(r0,a,b.da),p(r1,a,b.db),p(r1,c,b.db),p(r0,c,b.da)]);
      skin([p(r1,a,-b.db),p(r0,a,-b.da),p(r0,c,-b.da),p(r1,c,-b.db)]);
      quad([p(r0,a,-b.da),p(r0,a,b.da),p(r0,c,b.da),p(r0,c,-b.da)]);
      quad([p(r1,a,b.db),p(r1,a,-b.db),p(r1,c,-b.db),p(r1,c,b.db)]);
      if(i===0)quad([p(r0,a,-b.da),p(r1,a,-b.db),p(r1,a,b.db),p(r0,a,b.da)]);
      if(i===31)quad([p(r0,c,b.da),p(r1,c,b.db),p(r1,c,-b.db),p(r0,c,-b.da)]);
    }
  }
  // Rectangular outer filler closes the full wall cut behind the rounded surround.
  const outer=radius+PUBLIC_PORTAL.band, polygon:Point[]=[[sign*outer,outer],[0,outer]];
  for(let i=1;i<=32;i++){const a=Math.PI/2-i*Math.PI/64;polygon.push([sign*outer*Math.cos(a),outer*Math.sin(a)]);}
  xyPrism(k,MERIDIAN_IVORY,polygon,-.095,.095);
}
export const luxuryPortalRecipes:RecipeSet=add=>{
  for(const [name,sign]of[['left',-1],['right',1]]as const){
    for(const slotted of [false,true])add(`wall-portal-luxury-${name}-${slotted?'slot':'jamb'}`,k=>{
      for(const b of bands){if(slotted&&b.a===.07){slottedBand(k,sign);continue;}
        const a=sign*b.a,c=sign*b.b;
        profileBox(k,b.slot,Math.min(a,c),Math.max(a,c),0,slotted?1.2:CELL,sign>0?b.da:b.db,sign>0?b.db:b.da,'x');}
    });
    add(`wall-portal-luxury-${name}-corner`,k=>corner(k,sign));
  }
  add('door-header-luxury-public',k=>{for(const b of bands)profileBox(k,b.slot,-CELL/2,CELL/2,b.a,b.b,b.da,b.db,'y');});
};

/** Minimum rectangular passage remains empty; upper arcs rise above its height. */
export function placeLuxuryPortal(builder:PlacementBuilder,room:string,axis:'H'|'V',c:number,at:number,width:number,height:number,frame:Frame):void{
  const rotation=-frame.angleDeg*Math.PI/180+(axis==='V'?-Math.PI/2:0);
  const world=(along:number,y:number):[number,number,number]=>{const [x,z]=uvToWorld(axis==='H'?[along,c]:[c,along],frame);return[x,y,z];};
  const put=(id:string,along:number,y:number,scale:[number,number,number]=[1,1,1])=>builder.module(id,room,world(along,y),scale,rotation);
  for(const [name,side]of[['left',-1],['right',1]]as const){
    const t=at+side*width/2;
    put(`wall-portal-luxury-${name}-jamb`,t,0,[1,PUBLIC_PORTAL.slotBase/CELL,1]);
    put(`wall-portal-luxury-${name}-slot`,t,PUBLIC_PORTAL.slotBase);
    const top=PUBLIC_PORTAL.slotBase+PUBLIC_PORTAL.slotHeight;
    put(`wall-portal-luxury-${name}-jamb`,t,top,[1,(height-top)/CELL,1]);
    put(`wall-portal-luxury-${name}-corner`,at+side*(width/2-PUBLIC_PORTAL.radius),height);
  }
  put('door-header-luxury-public',at,height+PUBLIC_PORTAL.radius,[(width-2*PUBLIC_PORTAL.radius)/CELL,1,1]);
}
