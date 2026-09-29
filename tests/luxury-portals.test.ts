import {beforeAll,expect,it} from 'vitest';
import {Mesh,MeshBasicMaterial,FrontSide,Raycaster,Vector3} from 'three';
import {buildModules} from '../src/modules/index.js';
import {PlacementBuilder} from '../src/placements/builder.js';
import {makeFrame,worldToUv} from '../src/layout/uv.js';
import {thresholds} from '../src/placements/thresholds.js';
import {placeLuxuryPortal,PUBLIC_PORTAL} from '../src/styles/luxury/portals.js';
import {generate,makePlacementFixture} from '../src/index.js';
const engine=(p:string)=>new URL(`../../engine/src/game/${p}`,import.meta.url).href;
let built:Awaited<ReturnType<typeof buildModules>>;
beforeAll(async()=>{built=await buildModules({theme:null});},30000);
async function assembly(width:number,height:number,axis:'H'|'V'='H',angle=0):Promise<{objects:Mesh[];builder:PlacementBuilder}>{
 const {cityGltfLoader}=await import(engine('data/CityGltfLoader.js'));
 const {bake}=await import(engine('city/GeometryBake.js'));
 const builder=new PlacementBuilder();placeLuxuryPortal(builder,'public',axis,0,0,width,height,makeFrame(angle));
 const objects:Mesh[]=[];
 for(const p of builder.placements){const {scene}=await cityGltfLoader().parseAsync(new Uint8Array(built.files.get(`${p.module}.glb`)!).buffer,'');scene.updateMatrixWorld(true);
  scene.traverse((node:Mesh)=>{if(!node.isMesh)return;const mesh=new Mesh(bake(node),new MeshBasicMaterial({side:FrontSide}));mesh.position.fromArray(p.position);mesh.scale.fromArray(p.scale);mesh.rotation.y=p.rotationY;mesh.updateMatrixWorld(true);objects.push(mesh);});}
 return{objects,builder};
}
it.each([1.2,2.4,4.5])('keeps a %sm public aperture clear with closed constant-radius corner returns in the actual exported assembly',async width=>{
 const height=2.5,{objects,builder}=await assembly(width,height),{radius,band}=PUBLIC_PORTAL;
 try{
  expect(builder.placements.filter(p=>p.module?.endsWith('-corner')).every(p=>p.scale.every(s=>s===1))).toBe(true);
  for(const mesh of objects){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++){const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);expect(Math.abs(v.x)>=width/2-.00002||v.y>=height-.00002,`aperture vertex ${v.toArray()}`).toBe(true);}}
  let probes=0;
  for(const side of [-1,1])for(let y=.043;y<height+radius+band;y+=.073)for(let x=-width/2-band+.027;x<width/2+band;x+=.071){
   const d=y-height;const clearHalf=d<=0?width/2:d<radius?width/2-radius+Math.sqrt(radius*radius-d*d):-1;
   const hits=new Raycaster(new Vector3(x,y,side),new Vector3(0,0,-side),0,2).intersectObjects(objects,false);
   expect(hits.length>0,`${width} closure x${x} y${y} side${side}`).toBe(Math.abs(x)>clearHalf);probes++;
  }
  expect(probes).toBeGreaterThan(1000);
  const slot=new Raycaster(new Vector3(width/2+.155,PUBLIC_PORTAL.slotBase+.6,1),new Vector3(0,0,-1),0,2).intersectObjects(objects,false)[0]!;
  const face=new Raycaster(new Vector3(width/2+.11,PUBLIC_PORTAL.slotBase+.6,1),new Vector3(0,0,-1),0,2).intersectObjects(objects,false)[0]!;
  expect(slot.point.z).toBeCloseTo(.14,3);expect(face.point.z).toBeCloseTo(.17,3);
 }finally{for(const m of objects){m.geometry.dispose();(m.material as MeshBasicMaterial).dispose();}}
});
it('routes deep public portals while retaining ordinary private entry casings and room-specific finishes',async()=>{
 const request=makePlacementFixture({width:40,depth:40,floors:3,type:'residential',tier:'high_rich',seed:'portal-reference'});
 request.blueprint.assembly={architecture:'balcony-grid'};
 const result=await generate(request);
 expect(result.layouts.ground!.placements.some(p=>p.module==='door-header-luxury-public')).toBe(true);
 expect(result.layouts.middle!.placements.some(p=>p.module==='door-header-luxury')).toBe(true);
 expect(result.layouts.middle!.placements.some(p=>p.module==='wall-field-meridian-walnut')).toBe(true);
 expect(result.layouts.middle!.placements.some(p=>p.module==='floor-finish-luxury-polished')).toBe(true);
},30000);

it('preserves the aperture after rotated V-axis placement and supports its full doorway width',async()=>{
 const width=2.4,height=2.5,frame=makeFrame(37),{objects,builder}=await assembly(width,height,'V',37);
 try{
  for(const mesh of objects){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++){
   const v=new Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld),uv=worldToUv([v.x,v.z],frame);
   expect(Math.abs(uv[1])>=width/2-.00002||v.y>=height-.00002).toBe(true);
  }}
  thresholds(builder,frame,()=> 'floor-slab-meridian-stone');
  const floor=builder.placements.find(p=>p.module==='floor-slab-meridian-stone')!;
  expect(floor.scale[0]*.5).toBeCloseTo(.2,6);
  expect(floor.scale[2]*.5).toBeCloseTo(width,6);
 }finally{for(const m of objects){m.geometry.dispose();(m.material as MeshBasicMaterial).dispose();}}
});
