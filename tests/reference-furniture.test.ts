import { expect, it } from 'vitest';
import { moduleRecipes } from '../src/modules/recipes.js';
import { luxuryRoomFit, placeLuxuryPlants } from '../src/styles/luxury/catalog-fits.js';
import { PlacementBuilder } from '../src/placements/builder.js';
import type { Furniture } from '../src/core/types.js';

const sizes:Record<string,[number,number,number]>={
 'fit-sofa-corpo':[2.8,1,.9],'fit-chair-corpo':[.75,.8,.9],
 'fit-wardrobe-corpo':[1.6,.65,2],
 'fit-bedside-corpo':[.55,.6,.4],'fit-media-corpo':[3,.45,.65],
 'fit-fridge-corpo':[.7,.7,1.8],'fit-pantry-corpo':[1.8,.5,2],
 'fit-bamboo-screen-corpo':[2.5,.5,2],'fit-bamboo-wall-corpo':[3,.5,2],
 'fit-botanical-display-biotechnica':[3,.75,2.7],'fit-botanical-screen-biotechnica':[3,.55,2.7],
};

it('keeps every reference-specific fitting in its exact metric reservation',()=>{
 for(const recipe of moduleRecipes().filter(recipe=>recipe.id in sizes)){
  const [w,d,h]=sizes[recipe.id]!,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const slot of recipe.mesh.materials()){
   const group=recipe.mesh.getGroup(slot)!;
   for(let i=0;i<group.positions.length;i++){const v=group.positions[i]!;if(!Number.isFinite(v))throw Error(`${recipe.id}: nonfiniteposition`);min[i%3]=Math.min(min[i%3]!,v);max[i%3]=Math.max(max[i%3]!,v);}
  }
  expect(min[0],recipe.id).toBeGreaterThanOrEqual(-w/2-1e-6);expect(max[0],recipe.id).toBeLessThanOrEqual(w/2+1e-6);
  expect(min[2],recipe.id).toBeGreaterThanOrEqual(-d/2-1e-6);expect(max[2],recipe.id).toBeLessThanOrEqual(d/2+1e-6);
  expect(min[1],recipe.id).toBeCloseTo(0,5);expect(max[1],recipe.id).toBeLessThanOrEqual(h+1e-6);
 }
});

it('selects private Corpo seating, bedside drawers and media storage without changing public seating',()=>{
 for(const room of ['living','studio_main'] as const){
  expect(luxuryRoomFit('sofa',room)?.module).toBe('fit-sofa-corpo');
  expect(luxuryRoomFit('chair',room)?.module).toBe('fit-chair-corpo');
  expect(luxuryRoomFit('counter',room)?.module).toBe('fit-media-corpo');
 }
 expect(luxuryRoomFit('sofa','lounge')).toBeNull();
 expect(luxuryRoomFit('low_table','bedroom',[.55,.6,.4])?.module).toBe('fit-bedside-corpo');
 expect(luxuryRoomFit('low_table','bedroom',[1.6,.9,.4])).toBeNull();
 expect(luxuryRoomFit('shelf','kitchen')?.module).toBe('fit-pantry-corpo');
});

it('uses full-height public botanical cases and compact private bamboo without external-model dependencies',()=>{
 for(const [kind,size,module]of[
  ['ornament_wall',[3,.75,2.7],'fit-botanical-display-biotechnica'],
  ['room_divider',[3,.55,2.7],'fit-botanical-screen-biotechnica'],
  ['room_divider',[2.4,.5,2],'fit-bamboo-screen-corpo'],
 ] as const){
  const item: Furniture={id:'plant',kind,room:'lounge',position:[2,3],rotationDeg:37,size:[...size]},builder=new PlacementBuilder();
  expect(placeLuxuryPlants(builder,item,{present:new Set(),missing:new Set()})).toBe(true);
  expect(builder.placements).toHaveLength(1);expect(builder.placements[0]!.module).toBe(module);
  expect(builder.placements[0]!.id).toBe(item.id);
 }
});
