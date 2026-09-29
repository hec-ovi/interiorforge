import {expect,it} from 'vitest';
import {BufferGeometry,Float32BufferAttribute,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {Kit} from '../src/modules/kit.js';
import type {Placement} from '../src/placements/types.js';
import type {RoomFinish} from '../src/placements/finish.js';
import type {Vec3} from '../src/glb/mesh-builder.js';
import {makeFrame,worldToUv} from '../src/layout/uv.js';
import {LOFT1702_FINISH as L,loft1702Finish,loft1702FinishRecipes,placeLoft1702Wall,placeLoft1702Ceiling,placeLoft1702GalleryFascia} from '../src/styles/luxury/loft-finish.js';

class Recorder{
 placements:Placement[]=[];
 module(module:string,room:string,position:Vec3,scale:Vec3=[1,1,1],rotationY=0):Placement{
  const p:Placement={id:`proof-${this.placements.length}`,module,room,position,scale,rotationY};this.placements.push(p);return p;
 }
}
const templates=new Map<string,Kit>();loft1702FinishRecipes((id,draw)=>{const k=new Kit(()=>[1,1]);draw(k);templates.set(id,k);});
function points(p:Placement):Vec3[]{
 const result:Vec3[]=[],c=Math.cos(p.rotationY),s=Math.sin(p.rotationY),k=templates.get(p.module!)!;
 for(const slot of k.mesh.materials())for(let i=0;i<k.mesh.getGroup(slot)!.positions.length;i+=3){const v=k.mesh.getGroup(slot)!.positions,x=v[i]!*p.scale[0],y=v[i+1]!*p.scale[1],z=v[i+2]!*p.scale[2];result.push([p.position[0]+x*c+z*s,p.position[1]+y,p.position[2]+z*c-x*s]);}
 return result;
}
const base:RoomFinish={family:'luxury',field:'public-wall',floor:'public-floor',ceiling:'public-ceiling',cove:'public-cove',spot:'public-spot'};

it('gates the1702finish to private rooms and respects timber/gallery versus wet flooring',()=>{
 for(const room of['reception','lounge','corridor','bedroom']as const)expect(loft1702Finish(room,base,{privateRoom:false})).toBe(base);
 for(const room of['bedroom','corridor','office_private','storage']as const)expect(loft1702Finish(room,base,{privateRoom:true}).floor).toBe(L.timberFloor);
 expect(loft1702Finish('living',base,{privateRoom:true}).floor).toBe(L.floor);
 expect(loft1702Finish('bathroom',base,{privateRoom:true})).toMatchObject({field:L.wetWall,floor:'floor-slab-luxury-polished',ceiling:L.wetCeiling});
});

it('keeps50mmflute pitch and cross-section fixed as wall widths/heights/rotation vary',()=>{
 for(const width of[1.07,3.3,8.17])for(const height of[2.3,6.3]){
  const r=new Recorder(),angle=.645,at:Vec3=[7,0,11],phase=.17;
  placeLoft1702Wall(r,'loft',at,width,height,angle,{phase,mode:'fluted'});
  const ribs=r.placements.filter(p=>p.module==='loft1702-wall-rib');expect(ribs.length).toBeGreaterThan(10);
  const coordinates=ribs.map(p=>(p.position[0]-at[0])*Math.cos(angle)-(p.position[2]-at[2])*Math.sin(angle)+phase+width/2);
  for(let i=1;i<coordinates.length;i++)expect(coordinates[i]!-coordinates[i-1]!).toBeCloseTo(.05,8);
  for(const p of ribs){expect(p.scale[0]).toBe(1);expect(p.scale[2]).toBe(1);}
  for(const p of r.placements)for(const v of points(p)){
   const x=(v[0]-at[0])*Math.cos(angle)-(v[2]-at[2])*Math.sin(angle),z=(v[0]-at[0])*Math.sin(angle)+(v[2]-at[2])*Math.cos(angle);
   expect(Math.abs(x)).toBeLessThanOrEqual(width/2+1e-6);expect(z).toBeGreaterThanOrEqual(-1e-6);expect(z).toBeLessThanOrEqual(.095+1e-6);
  }
 }
});

it('respects aperture-cut spans and does not put a baseboard on negativeYair-seam faces',()=>{
 const r=new Recorder();
 placeLoft1702Wall(r,'loft',[-1.9,0,0],2.2,3.2,0,{phase:0});
 placeLoft1702Wall(r,'loft',[1.9,0,0],2.2,3.2,0,{phase:3.8});
 placeLoft1702Wall(r,'loft',[0,2.4,0],1.6,.8,0,{phase:2.2});
 for(const p of r.placements){const ps=points(p),xs=ps.map(v=>v[0]),ys=ps.map(v=>v[1]);const overlaps=Math.max(...xs)>-.799&&Math.min(...xs)<.799&&Math.min(...ys)<2.399;expect(overlaps,p.module).toBe(false);}
 const seam=new Recorder();placeLoft1702Wall(seam,'air',[0,-.2,0],3,3.4,0,{mode:'fluted'});
 expect(seam.placements.some(p=>p.module==='loft1702-wall-skirt')).toBe(false);
 expect(seam.placements.filter(p=>p.module==='loft1702-wall-rib').every(p=>p.position[1]===-.2)).toBe(true);
 const wet=new Recorder();placeLoft1702Wall(wet,'bath',[0,0,0],2,3,0,{wet:true});
 expect(wet.placements.map(p=>p.module)).toEqual([L.wetWall]);
});

it('keeps ceiling grain and board spacing stable across cut rectangles without covering the lounge void',()=>{
 const r=new Recorder(),frame=makeFrame(37),rects=[{u:0,v:0,lu:6,lv:2},{u:0,v:2,lu:2,lv:4}];
 for(const rect of rects)placeLoft1702Ceiling(r,'loft',rect,3.2,frame);
 for(const p of r.placements){
  expect(p.rotationY).toBeCloseTo(-37*Math.PI/180,8);
  const ps=points(p).map(v=>worldToUv([v[0],v[2]],frame)),minU=Math.min(...ps.map(v=>v[0])),maxU=Math.max(...ps.map(v=>v[0])),minV=Math.min(...ps.map(v=>v[1])),maxV=Math.max(...ps.map(v=>v[1]));
  expect(minU).toBeGreaterThanOrEqual(-1e-6);expect(minV).toBeGreaterThanOrEqual(-1e-6);
  expect(maxU>2.001&&maxV>2.001&&minU<5.999&&minV<5.999,p.module).toBe(false);
  if(p.module==='loft1702-ceiling-board')expect(maxU-minU).toBeLessThanOrEqual(.25+1e-6);
 }
});

it('places deep gallery fascia below the floor with fixed500mminlay panels and a housedred emitter',()=>{
 for(const length of[2.37,6.12]){
  const r=new Recorder(),lights=placeLoft1702GalleryFascia(r,'gallery',[0,0],[length,0],0,makeFrame(0),{normal:[0,1],height:.35,elevation:3.4});
  const inlays=r.placements.filter(p=>p.module==='loft1702-gallery-inlay');expect(inlays).toHaveLength(Math.floor(length/.5));
  expect(inlays.every(p=>p.scale[0]===1&&p.scale[1]===1&&p.scale[2]===1)).toBe(true);
  for(const p of r.placements)for(const v of points(p))expect(v[1]).toBeLessThanOrEqual(1e-6);
  expect(lights[0]!.position[1]).toBeCloseTo(3.4-.35-.001,6);expect(lights[0]!.color).toEqual(L.coveColor);
  expect(lights[0]!.intensity).toBe(length*25);
 }
});

it('uses a genuinely dark closed stair underside and separate flush floor skins',()=>{
 const stair=templates.get(L.stair)!;
 expect(stair.mesh.materials().some(slot=>slot.includes('concrete'))).toBe(false);
 const support=points({id:'a',module:L.floorSupport,room:'loft',position:[0,0,0],scale:[1,1,1],rotationY:0});
 const skin=points({id:'b',module:L.timberSkin,room:'loft',position:[0,0,0],scale:[1,1,1],rotationY:0});
 expect(Math.max(...support.map(v=>v[1]))).toBeCloseTo(-.015,6);expect(Math.min(...skin.map(v=>v[1]))).toBeCloseTo(-.015,6);expect(Math.max(...skin.map(v=>v[1]))).toBe(0);
});


it('exposes the housed red optic to room-side eye-height rays without changing its datum',()=>{
 const kit=templates.get(L.cove)!,meshes:Mesh[]=[];
 for(const slot of kit.mesh.materials()){
  const g=kit.mesh.getGroup(slot)!,geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(g.positions,3));geometry.setIndex(Array.from(g.indices));
  const material=new MeshBasicMaterial();material.name=slot;meshes.push(new Mesh(geometry,material));
 }
 try{
  for(const at of[[0,-1,3],[0,-2,1],[.17,-3,1]]){
   const origin=new Vector3(...at),target=new Vector3(at[0],0,0),hit=new Raycaster(origin,target.clone().sub(origin).normalize()).intersectObjects(meshes,false)[0]!;
   expect(hit,'the fascia lip must not conceal the red lens').toBeDefined();
   expect(((hit.object as Mesh).material as MeshBasicMaterial).name).toContain('#loft-red');
   expect(hit.point.y).toBeCloseTo(0,5);expect(hit.point.z).toBeCloseTo(0,5);
  }
 }finally{for(const mesh of meshes){mesh.geometry.dispose();(mesh.material as MeshBasicMaterial).dispose();}}
 const inlay=templates.get('loft1702-gallery-inlay')!;
 expect(inlay.mesh.materials().reduce((n,m)=>n+inlay.mesh.getGroup(m)!.indices.length/3,0)).toBeLessThanOrEqual(544);
});
