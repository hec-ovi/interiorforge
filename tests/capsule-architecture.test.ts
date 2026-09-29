import {expect,it} from 'vitest';
import {buildModules} from '../src/modules/index.js';
import {Mesh,MeshBasicMaterial,FrontSide,Raycaster,Vector3} from 'three';
import {PlacementBuilder} from '../src/placements/builder.js';
import {dressCapsuleArchitecture} from '../src/styles/capsule/architecture.js';
import {moduleRecipes} from '../src/modules/recipes.js';
import {assertDoorwaysClear} from '../src/geometry/door-clear.js';
import type {FloorInterior} from '../src/core/types.js';

it('adds capsule ceiling/service depth while preserving existing dry-room door and tall cabinet clearances',()=>{
 const builder=new PlacementBuilder();
 builder.module('wall-field-capsule-domestic','living',[-2,0,0],[4,6,1]);
 builder.module('wall-field-capsule-domestic','living',[2,0,0],[4,6,1]);
 builder.module('wall-field-capsule-domestic','living',[0,2.58,0],[4,.84,1]);
 builder.module('ceiling-field-capsule','living',[0,3,2.5],[12,1,10]);
 builder.module('door-header-capsule','living',[0,2.5,0],[4,1,1]);
 const floor={elevation:0,ceilingElevation:3,rooms:[
  {id:'living',kind:'living',unit:'one',doors:[{id:'internal',to:'bedroom',position:[0,0],angleDeg:0,width:1.84}]},
  {id:'bedroom',kind:'bedroom',unit:'one',doors:[]}],
 furniture:[{id:'cupboard',room:'living',kind:'wardrobe',position:[-2,.32],rotationDeg:0,size:[1.2,.5,2.8]}]} as unknown as FloorInterior;
 dressCapsuleArchitecture(builder,floor,'h10');
 expect(builder.placements.some(p=>p.module==='ceiling-capsule-dark-cassette')).toBe(true);
 expect(builder.placements.filter(p=>p.module?.endsWith('-corner'))).toHaveLength(4);
 expect(builder.placements.filter(p=>p.module?.endsWith('-corner')).every(p=>p.scale.every(n=>n===1))).toBe(true);
 for(const p of builder.placements.filter(p=>p.module==='wall-capsule-service-beam')){
  expect(p.position[1]-.28).toBeGreaterThan(2.1);
  expect(p.position[0]+p.scale[0]*.25<=-2.6-.03||p.position[0]-p.scale[0]*.25>=-1.4+.03).toBe(true);
 }
 expect(()=>assertDoorwaysClear(builder.mesh,[{id:'dry passage',center:[0,1.25,0],along:[1,0],half:[.90,1.23,.30]}],0)).not.toThrow();
});
it('uses closed nonemissive manufactured architecture and excludes main apartment pocket entries',()=>{
 const b=new PlacementBuilder();b.module('door-header-capsule','hall',[0,2.5,0],[2.16,1,1]);
 const f={elevation:0,ceilingElevation:3,rooms:[{id:'hall',kind:'corridor',doors:[]},{id:'home',kind:'living',unit:'one',doors:[{to:'hall',position:[0,0],angleDeg:0,width:.92}]}],furniture:[]} as unknown as FloorInterior;
 dressCapsuleArchitecture(b,f,'japantown');expect(b.placements).toHaveLength(1);
 const modules=moduleRecipes().filter(r=>/^wall-capsule-(service|return|field|low)|^ceiling-capsule-dark/.test(r.id));
 expect(modules.length).toBeGreaterThan(8);
 for(const m of modules){expect(m.size.every(n=>n>0)).toBe(true);expect(m.mesh.materials().some(s=>/light-fixture|led|meridian|luxury/.test(s))).toBe(false);}
 const beam=modules.find(r=>r.id==='wall-capsule-service-beam')!;
 expect(beam.size).toEqual([.5,.28,.3]);
});

it('keeps the rounded capsule return aperture empty after actual Engine GLB decoding',async()=>{
 const built=await buildModules({theme:null}),url=(file:string)=>new URL(`../../engine/src/game/${file}`,import.meta.url).href;
 const {cityGltfLoader}=await import(url('data/CityGltfLoader.js')),{bake}=await import(url('city/GeometryBake.js'));
 const b=new PlacementBuilder();b.module('door-header-capsule','living',[0,2.5,0],[2.16,1,1]);
 const f={elevation:0,ceilingElevation:3,rooms:[{id:'living',kind:'living',unit:'one',doors:[{to:'bedroom',position:[0,0],angleDeg:0,width:.92}]},{id:'bedroom',kind:'bedroom',unit:'one',doors:[]}],furniture:[]} as unknown as FloorInterior;
 dressCapsuleArchitecture(b,f);
 const objects:Mesh[]=[];
 for(const p of b.placements){const {scene}=await cityGltfLoader().parseAsync(new Uint8Array(built.files.get(`${p.module}.glb`)!).buffer,'');scene.updateMatrixWorld(true);scene.traverse((node:Mesh)=>{if(!node.isMesh)return;const m=new Mesh(bake(node),new MeshBasicMaterial({side:FrontSide}));m.position.fromArray(p.position);m.rotation.y=p.rotationY;m.scale.fromArray(p.scale);m.updateMatrixWorld(true);objects.push(m);});}
 try{for(const x of[-.42,-.2,.02,.2,.42])for(const y of[.2,1.4,2.44])for(const side of[-1,1]){
  expect(new Raycaster(new Vector3(x,y,side*.6),new Vector3(0,0,-side),0,1.2).intersectObjects(objects,false)).toHaveLength(0);
 }
 for(const side of[-1,1])expect(new Raycaster(new Vector3(.58,1.4,side*.6),new Vector3(0,0,-side),0,1.2).intersectObjects(objects,false).length).toBeGreaterThan(0);
 }finally{for(const m of objects){m.geometry.dispose();(m.material as MeshBasicMaterial).dispose();}}
},30000);

it('stops the projecting lower course before the real H10 perpendicular bathroom doorway',()=>{
 const b=new PlacementBuilder();b.module('wall-field-capsule-domestic','f1-r0',[5.3,0,7.75],[5,8.3,1],Math.PI/2);
 const floor={elevation:4.5,ceilingElevation:8.65,rooms:[{id:'f1-r0',kind:'living',unit:'one',doors:[]},
  {id:'f1-r1',kind:'bathroom',unit:'one',doors:[{id:'f1-d0',to:'f1-r0',position:[6,9],width:1.2,angleDeg:0}]}],furniture:[]} as unknown as FloorInterior;
 dressCapsuleArchitecture(b,floor,'h10');
 expect(()=>assertDoorwaysClear(b.mesh,[{id:'f1-r1/f1-d0',center:[6,1.05,9],along:[1,0],half:[.58,1.03,.1]}],1)).not.toThrow();
 const course=b.placements.find(p=>p.module==='wall-capsule-low-course')!;
 expect(course.position[2]+course.scale[0]*.25).toBeLessThan(8.87);
});
