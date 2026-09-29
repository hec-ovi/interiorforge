import type { FloorInterior, RoomKind } from '../../core/types.js';
import type { Point } from '../../core/geom.js';
import { triangulate } from '../../core/triangulate.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { FINISH as F } from '../../modules/finishes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { Placement } from '../../placements/types.js';
import type { CapsuleProfile } from './profile.js';

/** H10 72404/72402 and Japantown 80104_2/80107_2: a dark continuous ceiling,
 * broad pale manufactured panels, deep upper service beams and rolled returns.
 * Furniture/niche construction and all original door apertures remain owners. */
const ENAMEL='cyberpunk/interior-capsule-enamel/mid#ivory';
const DARK='cyberpunk/paired-cladding-metal/mid#obsidian';
const CELL=.5, RADIUS=.22;
const DRY=new Set<RoomKind>(['living','studio_main','bedroom','kitchen']);
type V3=[number,number,number];

/** Closed extrusion along X; the curved lower nose has its own true metre radius. */
function beam(k:Kit):void{
 const p:Point[]=[[0,0],[0,.30],[-.22,.30]];
 for(let i=1;i<=24;i++){const a=i*Math.PI/48;p.push([-.22-.06*Math.sin(a),.24+.06*Math.cos(a)]);}
 p.push([-.28,0]);
 const triangles=triangulate(p);
 for(const [x,sign]of[[-.25,-1],[.25,1]]as const)k.mesh.addSurface(ENAMEL,{positions:p.flatMap(([y,z])=>[x,y,z]),normals:p.flatMap(()=>[sign,0,0]),uvs:p.flat(),indices:triangles.flatMap(([a,b,c])=>sign>0?[a,b,c]:[a,c,b])});
 for(let i=0;i<p.length;i++){const a=p[i]!,b=p[(i+1)%p.length]!;k.mesh.addQuad(ENAMEL,[[-.25,a[0],a[1]],[-.25,b[0],b[1]],[.25,b[0],b[1]],[.25,a[0],a[1]]]);}
}
function prism(k:Kit,slot:string,p:Point[],z0:number,z1:number):void{
 const area=p.reduce((s,a,i)=>{const b=p[(i+1)%p.length]!;return s+a[0]*b[1]-b[0]*a[1];},0);if(area<0)p=[...p].reverse();
 const triangles=triangulate(p);
 for(const[z,n]of[[z0,-1],[z1,1]]as const)k.mesh.addSurface(slot,{positions:p.flatMap(([x,y])=>[x,y,z]),normals:p.flatMap(()=>[0,0,n]),uvs:p.flatMap(([x,y])=>[x,-y]),indices:triangles.flatMap(([a,b,c])=>n>0?[a,b,c]:[a,c,b])});
 for(let i=0;i<p.length;i++){const a=p[i]!,b=p[(i+1)%p.length]!;k.mesh.addQuad(slot,[[a[0],a[1],z0],[b[0],b[1],z0],[b[0],b[1],z1],[a[0],a[1],z1]]);}
}

export const capsuleArchitecturalRecipes:RecipeSet=add=>{
 add('ceiling-capsule-dark-backing',k=>k.cbox(F.black,[0,.005,0],[CELL,.018,CELL]));
 add('ceiling-capsule-dark-cassette',k=>k.cbox(DARK,[0,-.012,0],[CELL,.015,CELL]));
 add('wall-capsule-service-beam',beam);
 add('wall-capsule-service-vent',k=>{
  k.cbox(F.black,[0,-.449,.035],[CELL,.159,.07]);
  for(const y of[-.424,-.399,-.374,-.349,-.324])k.cbox(F.steel,[0,y,.082],[CELL,.012,.018]);
  k.cbox(ENAMEL,[0,-.465,.046],[CELL,.016,.092]);
 });
 add('wall-capsule-field-joint',k=>k.cbox(F.steel,[0,0,.002],[.006,CELL,.004]));
 add('wall-capsule-low-course',k=>{
  k.cbox(F.black,[0,0,.008],[CELL,.028,.016]);
  k.cbox(ENAMEL,[0,.028,.012],[CELL,.085,.024]);
 });
 for(const [side,sign]of[['left',-1],['right',1]]as const){
  add(`wall-capsule-return-${side}`,k=>{
   // All layers sit outside the existing casing face: no coplanar painted skins.
   prism(k,F.black,[[0,0],[sign*.024,0],[sign*.024,CELL],[0,CELL]],.103,.148);
   const points:Point[]=[[sign*.024,.104],[sign*RADIUS,.104],[sign*RADIUS,.206],[sign*.066,.206]];
   for(let i=1;i<=16;i++){const a=i*Math.PI/32;points.push([sign*(.066-.042*Math.sin(a)),.164+.042*Math.cos(a)]);}
   // Cross-section coordinates are X/Z; this is a straight constant-profile jamb.
   const area=points.reduce((sum,a,i)=>{const b=points[(i+1)%points.length]!;return sum+a[0]*b[1]-b[0]*a[1];},0);
   k.mesh.addPrism(ENAMEL,area<0?[...points].reverse():points,0,CELL,'world','both');
  });
  add(`wall-capsule-return-${side}-corner`,k=>{
   const points:Point[]=[[0,0],[sign*RADIUS,0]];
   for(let i=1;i<=40;i++){const a=i*Math.PI/80;points.push([sign*RADIUS*Math.cos(a),RADIUS*Math.sin(a)]);}
   prism(k,ENAMEL,points,.103,.206);
  });
 }
 add('wall-capsule-return-header',k=>{
  k.cbox(F.black,[0,0,.1255],[CELL,.024,.045]);
  k.cbox(ENAMEL,[0,.024,.1545],[CELL,RADIUS-.024,.103]);
 });
};

function at(p:Placement,x:number,y:number,z:number):V3{
 const c=Math.cos(p.rotationY),s=Math.sin(p.rotationY);
 return[p.position[0]+x*c+z*s,p.position[1]+y,p.position[2]-x*s+z*c];
}
function intervals(base:[number,number],cuts:[number,number][]):[number,number][]{
 let runs:[number,number][]=[base];for(const [a,b]of cuts)runs=runs.flatMap(([lo,hi])=>b<=lo||a>=hi?[[lo,hi] as[number,number]]:[[lo,Math.max(lo,a)] as[number,number],[Math.min(hi,b),hi] as[number,number]].filter(([x,y])=>y-x>.12));return runs;
}

/** Call after walls/furniture and before doorway/shell validation. Uses only actual
 * opaque manufactured spans and ceiling rectangles; never stretches a corner radius.
 * Profile is explicit to keep H10/Japantown selection out of shared wall generation. */
export function dressCapsuleArchitecture(builder:PlacementBuilder,floor:FloorInterior,profile:CapsuleProfile='h10'):void{
 const kinds=new Map(floor.rooms.map(r=>[r.id,r.kind])),source=[...builder.placements];
 const ceilingY=floor.ceilingElevation-floor.elevation;
 const eligible=(room:string)=>DRY.has(kinds.get(room)!);
 const doorCuts=(p:Placement,z0:number,z1:number):[number,number][]=>floor.rooms.flatMap(room=>room.doors.flatMap(door=>{
  const a=door.angleDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),xs:number[]=[],zs:number[]=[];
  for(const t of[-door.width/2,door.width/2])for(const d of[-.13,.13]){
   const dx=door.position[0]+t*c-d*s-p.position[0],dz=door.position[1]+t*s+d*c-p.position[2];
   xs.push(dx*Math.cos(p.rotationY)-dz*Math.sin(p.rotationY));zs.push(dx*Math.sin(p.rotationY)+dz*Math.cos(p.rotationY));
  }
  return Math.min(...zs)<=z1+.001&&Math.max(...zs)>=z0-.001?[[Math.min(...xs)-.006,Math.max(...xs)+.006] as[number,number]]:[];
 }));
 for(const p of source.filter(p=>p.module==='ceiling-field-capsule'&&eligible(p.room))){
  const width=p.scale[0]*CELL,depth=p.scale[2]*CELL;
  builder.module('ceiling-capsule-dark-backing',p.room,[...p.position],[p.scale[0],1,p.scale[2]],p.rotationY);
  const cols=Math.max(1,Math.ceil(width/2.4)),rows=Math.max(1,Math.ceil(depth/1.8)),w=width/cols,d=depth/rows;
  const gap=Math.min(.004,w*.1,d*.1);
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)builder.module('ceiling-capsule-dark-cassette',p.room,
   at(p,-width/2+(i+.5)*w,0,-depth/2+(j+.5)*d),[(w-gap)/CELL,1,(d-gap)/CELL],p.rotationY);
 }
 for(const p of source.filter(p=>p.module==='wall-field-capsule-domestic'&&eligible(p.room))){
  const width=p.scale[0]*CELL,height=p.scale[1]*CELL,top=p.position[1]+height;
  if(width<.2)continue;
  // Fine manufactured plate joints are nonemissive metal inlays on the opaque face.
  if(p.position[1]<.01&&height>.6){
   // Perpendicular doors can begin immediately beside a wall face. Stop the
   // projecting plinth before their full published route, not just our own door cuts.
   for(const[a,b]of intervals([-width/2,width/2],doorCuts(p,.097,.121)))
    builder.module('wall-capsule-low-course',p.room,at(p,(a+b)/2,0,.097),[(b-a)/CELL,1,1],p.rotationY);
   const count=Math.max(1,Math.ceil(width/(profile==='h10'?1.6:1.35)));
   for(let i=1;i<count;i++)builder.module('wall-capsule-field-joint',p.room,at(p,-width/2+width*i/count,.115,.097),[1,Math.max(.05,Math.min(height,ceilingY-.47)-.115)/CELL,1],p.rotationY);
  }
  if(Math.abs(top-ceilingY)>.015||ceilingY<2.85||height<.48)continue;
  // Tall cupboards/niche roofs keep their existing reservation; split beams around
  // their actual occupied upper envelope rather than clipping through the furniture.
  const cuts:[number,number][]=[];
  for(const item of floor.furniture.filter(item=>item.room===p.room&&(item.elevation??0)+item.size[2]>ceilingY-.49)){
   const a=item.rotationDeg*Math.PI/180,c=Math.cos(a),s=Math.sin(a),xs:number[]=[],zs:number[]=[];
   for(const x of[-item.size[0]/2,item.size[0]/2])for(const z of[-item.size[1]/2,item.size[1]/2]){
    const dx=item.position[0]+x*c+z*s-p.position[0],dz=item.position[1]-x*s+z*c-p.position[2];
    xs.push(dx*Math.cos(p.rotationY)-dz*Math.sin(p.rotationY));zs.push(dx*Math.sin(p.rotationY)+dz*Math.cos(p.rotationY));
   }
   if(Math.min(...zs)<.43&&Math.max(...zs)>.095)cuts.push([Math.min(...xs)-.035,Math.max(...xs)+.035]);
  }
  // One orthogonal run owns each corner. The crossing run stops at its front
  // face, so two ceiling beams never publish coplanar lower faces in the corner.
  const secondAxis=Math.abs(Math.round(p.rotationY/(Math.PI/2)))%2===1;
  const cornerInset=(side:number,depth:number):number=>{
   if(!secondAxis)return .006;
   const point=at(p,side*width/2,0,0);
   const crosses=source.some(q=>{
    if(q===p||q.room!==p.room||q.module!=='wall-field-capsule-domestic'
      ||Math.abs(q.position[1]+q.scale[1]*CELL-ceilingY)>.015||Math.abs(Math.cos(q.rotationY-p.rotationY))>.02)return false;
    const dx=point[0]-q.position[0],dz=point[2]-q.position[2];
    return Math.abs(dx*Math.sin(q.rotationY)+dz*Math.cos(q.rotationY))<.02
      &&Math.abs(dx*Math.cos(q.rotationY)-dz*Math.sin(q.rotationY))<=q.scale[0]*CELL/2+.02;
   });
   return crosses?depth+.099:.006;
  };
  for(const [module,depth]of[['wall-capsule-service-beam',.30],['wall-capsule-service-vent',.092]]as const)
   for(const[a,b]of intervals([-width/2+cornerInset(-1,depth),width/2-cornerInset(1,depth)],cuts)){
    if(b-a<.12)continue;
    builder.module(module,p.room,at(p,(a+b)/2,ceilingY-p.position[1],.097),[(b-a)/CELL,1,1],p.rotationY);
   }
 }
 // Independent room-to-room returns: apartment pocket entries, wet rooms, cores and
 // exterior openings remain their existing owners, with no added obstruction.
 for(const header of source.filter(p=>p.module==='door-header-capsule')){
  const pairs=floor.rooms.flatMap(room=>room.doors.filter(d=>Math.hypot(d.position[0]-header.position[0],d.position[1]-header.position[2])<.04).map(d=>[room,floor.rooms.find(r=>r.id===d.to)] as const));
  if(!pairs.some(([a,b])=>a.unit&&a.unit===b?.unit&&eligible(a.id)&&eligible(b.id)))continue;
  const width=header.scale[0]*CELL-.16,height=header.position[1];
  if(width<.7||height+RADIUS>ceilingY-.05)continue;
  // Each side is a separate thin return mounted beyond the original 100 mm casing.
  for(const face of[-1,1]){
   const rotation=header.rotationY+(face<0?Math.PI:0);
   const transform={...header,rotationY:rotation};
   for(const[name,sign]of[['left',-1],['right',1]]as const){
    builder.module(`wall-capsule-return-${name}`,header.room,at(transform,sign*width/2,-height,0),[1,height/CELL,1],rotation);
    builder.module(`wall-capsule-return-${name}-corner`,header.room,at(transform,sign*width/2,0,0),[1,1,1],rotation);
   }
   builder.module('wall-capsule-return-header',header.room,[...header.position],[width/CELL,1,1],rotation);
  }
 }
}
