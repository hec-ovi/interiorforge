import { describe, expect, it } from 'vitest';
import { Kit } from '../src/modules/kit.js';
import { industrialRecipes, INDUSTRIAL_FITS, industrialFinish } from '../src/styles/industrial/index.js';
import { loadTheme } from '../src/materials/load.js';
const theme = loadTheme('cyberpunk')!;
import { expectBuildingLevels } from './building-levels.js';

const recipes = new Map<string, Kit>();
industrialRecipes((id, draw) => { const kit = new Kit(() => [1, 1]); draw(kit); recipes.set(id, kit); });

describe('industrial factory fittings', () => {
  it('every fitting stays inside the actual reserved width, depth and height', () => {
    for (const [kind, fit] of Object.entries(INDUSTRIAL_FITS)) {
      const kit = recipes.get(fit.module)!;
      expect(kit, kind).toBeDefined();
      for (const material of kit.mesh.materials()) {
        const points = kit.mesh.getGroup(material)!.positions;
        for (let i = 0; i < points.length; i += 3) {
          expect(Math.abs(points[i]!), `${kind} x`).toBeLessThanOrEqual(fit.size[0] / 2 + 1e-6);
          expect(points[i + 1]!, `${kind} below floor`).toBeGreaterThanOrEqual(-1e-6);
          expect(points[i + 1]!, `${kind} height`).toBeLessThanOrEqual(fit.size[2] + 1e-6);
          expect(Math.abs(points[i + 2]!), `${kind} z`).toBeLessThanOrEqual(fit.size[1] / 2 + 1e-6);
        }
      }
    }
  });
  it('publishes only existing finishes and inexpensive reusable geometry', () => {
    for (const [name, kit] of recipes) {
      let triangles = 0;
      for (const material of kit.mesh.materials()) {
        const [key, variant] = material.split('#');
        expect(theme.library.entry(key!)?.variants.some(v => v.id === variant), `${name}: ${material}`).toBe(true);
        triangles += kit.mesh.getGroup(material)!.indices.length / 3;
      }
      expect(triangles, name).toBeLessThan(12000);
    }
  });
  it('keeps service runs visible below the soffit without a low head obstruction', () => {
    const points = recipes.get('ceiling-services-industrial')!.mesh.materials().flatMap(material =>
      Array.from(recipes.get('ceiling-services-industrial')!.mesh.getGroup(material)!.positions));
    const y = points.filter((_, i) => i % 3 === 1);
    expect(Math.min(...y)).toBeGreaterThanOrEqual(-.27);
    expect(Math.min(...y)).toBeLessThan(-.2);
    expect(Math.max(...y)).toBeLessThanOrEqual(.045);
    expect(industrialFinish('mechanical_room', 'mechanical').services).toBe('ceiling-services-industrial');
    expect(industrialFinish('toilets', 'mechanical').services).toBeUndefined();
    expect(industrialFinish('reception', 'lobby').services).toBeUndefined();
  });
});

import { generate, makePlacementFixture } from '../src/index.js';

it.each([40, 60])('keeps the %im factory entrance usable with catalog-independent workshop fittings', async width => {
  const request = makePlacementFixture({ seed: 'industrial-reference', width, depth: width, floors: 3, type: 'factory', tier: 'poor' });
  const result = await generate(request, { models: new Set() });
  const ground = result.layouts.ground!;
  expect(ground).toBeDefined();
  expect(ground.placements.some(p => p.module === 'fit-industrial-tool-counter')).toBe(true);
  expect(ground.placements.some(p => p.module === 'fit-industrial-storage-rack')).toBe(true);
  for (const layout of Object.values(result.layouts)) {
    expect(layout.placements.some(p => p.module === 'floor-slab-industrial')).toBe(true);
    expect(layout.placements.some(p => p.module === 'ceiling-services-industrial' || p.module === 'ceiling-services-industrial-bank')).toBe(true);
    const ids = new Set(layout.placements.map(p => p.id));
    for (const item of layout.floor.furniture) expect(ids.has(item.id), item.id).toBe(true);
    const receiving = layout.floor.rooms.filter(room => room.kind === 'mechanical_room' && room.doors.some(door => door.to === 'outside'));
    for (const room of receiving) {
      for(const item of layout.floor.furniture.filter(item => item.room === room.id && item.kind === 'desk')) {
        const door=room.doors.find(d=>d.to==='outside')!;
        expect(Math.hypot(item.position[0]-door.position[0],item.position[1]-door.position[1])).toBeGreaterThan(6);
      }
    }
  }
}, 180_000);

it.each(['industrial-framed', 'industrial-solid', 'service-storage'].flatMap(family => [40, 60].map(width => ({family,width}))))('fits the actual $family $width m exterior with its own openings', async ({family,width}) => {
  const { readFile } = await import('node:fs/promises');
  const exteriorRequest=JSON.parse(await readFile(new URL(`../src/styles/industrial/sets/${family}-${width}.json`,import.meta.url),'utf8'));
  const { generate: generateExterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = await generateExterior(exteriorRequest, { textures: { mode: 'keys' } });
  const result = await generate({ seed: exteriorRequest.seed, building: { id: exteriorRequest.buildingId, type: 'factory', tier: 'poor' }, blueprint, materialTheme: 'cyberpunk' }, { models: new Set() });
  expect(result.layouts.ground!.placements.some(p => p.module === 'fit-industrial-storage-rack')).toBe(true);
  expect(result.layouts.ground!.placements.some(p => p.module === 'fit-industrial-drive-bank')).toBe(true);
  expect(result.layouts.ground!.placements.some(p => p.module === 'ceiling-services-industrial-feed-drop')).toBe(true);
  expect(result.layouts.ground!.floor.furniture.filter(f=>f.kind==='desk').length).toBeGreaterThanOrEqual(4);
  expect(result.layouts.ground!.floor.furniture.filter(f=>f.kind==='shelf').length).toBeGreaterThan(10);
  const ground=result.layouts.ground!, {findPath}=await import('../src/nav.js');
  const entrance=ground.floor.rooms.flatMap(r=>r.doors).find(d=>d.to==='outside')!;
  const inward=ground.floor.openingReservations.find(r=>r.opening===entrance.id)?.inward??[0,1];
  const from={floor:ground.sourceFloor,x:entrance.position[0]+inward[0]!*1.2,z:entrance.position[1]+inward[1]!*1.2};
  const goals=[...result.building.connectors.map(c=>c.entryByFloor[String(ground.sourceFloor)]),...ground.npc.anchors.filter(a=>a.kind==='work_spot').map(a=>a.position)].filter((p):p is [number,number]=>!!p);
  expect(result.building.connectors.filter(c=>c.entryByFloor[String(ground.sourceFloor)]).length).toBeGreaterThanOrEqual(2);
  expect(goals.length).toBeGreaterThan(6);
  for(const [x,z]of goals)expect(findPath({nav:ground.npc.nav,from,to:{floor:ground.sourceFloor,x,z}})).not.toHaveProperty('error');

  expect(result.building.floors.filter(f => result.layouts[f.layout]?.floor.kind !== 'roof')).toHaveLength(exteriorRequest.building.floors);
  expect(result.building.floors.filter(f => result.layouts[f.layout]?.floor.kind === 'roof')).toHaveLength(1);
}, 180_000);

it('connects both branch directions to the main pipe and stays inside rotated dynamic rooms', async () => {
  const { PlacementBuilder } = await import('../src/placements/builder.js');
  const { placeIndustrialServices } = await import('../src/styles/industrial/services.js');
  const { makeFrame, worldToUv } = await import('../src/layout/uv.js');
  for (const angle of [0,37,90]) {
    const b=new PlacementBuilder(), frame=makeFrame(angle), rect={u:-4,v:-3,lu:8,lv:6};
    placeIndustrialServices(b,'proof',rect,2.4,frame);
    const branches=b.placements.filter(p=>p.module==='ceiling-services-industrial-branch');
    expect(branches.length).toBeGreaterThan(0);
    for(const p of branches){
      const half=p.scale[0]*.25;
      const start=worldToUv([p.position[0]-Math.cos(p.rotationY)*half,p.position[2]+Math.sin(p.rotationY)*half],frame);
      expect(start[1]).toBeCloseTo(-.2,6);
    }
    for(const slot of b.mesh.materials()){
      const points=b.mesh.getGroup(slot)!.positions;
      for(let i=0;i<points.length;i+=3){
        const [u,v]=worldToUv([points[i]!,points[i+2]!],frame);
        expect(u).toBeGreaterThanOrEqual(-4-1e-6);expect(u).toBeLessThanOrEqual(4+1e-6);
        expect(v).toBeGreaterThanOrEqual(-3-1e-6);expect(v).toBeLessThanOrEqual(3+1e-6);
        expect(points[i+1]).toBeGreaterThan(2.1);
      }
    }
  }
});

it('connects equipment to its own real tray and refuses feeds across excluded room holes or low ceilings', async () => {
  const { PlacementBuilder } = await import('../src/placements/builder.js');
  const { placeIndustrialEquipmentFeeds } = await import('../src/styles/industrial/feeds.js');
  const fixture=(y:number)=>{
    const b=new PlacementBuilder();
    b.module('ceiling-services-industrial-bank','plant',[0,y,0],[12,1,1]);
    b.module('fit-industrial-drive-bank','plant',[-2.5,0,-2.5]);
    return b;
  };
  const room={id:'plant',kind:'mechanical_room' as const,polygon:[[-4,-4],[4,-4],[4,4],[-4,4]] as [number,number][],doors:[]};
  const valid=fixture(3.6);placeIndustrialEquipmentFeeds(valid,{rooms:[room]});
  expect(valid.placements.filter(p=>p.module==='ceiling-services-industrial-feed-drop')).toHaveLength(1);
  const horizontal=valid.placements.find(p=>p.module==='ceiling-services-industrial-feed-run')!;
  expect(horizontal.position[1]).toBeGreaterThanOrEqual(2.4);
  const half=horizontal.scale[0]*.25;
  expect(horizontal.position[2]-Math.sin(horizontal.rotationY)*half).toBeCloseTo(.27,6);
  const cut=fixture(3.6);placeIndustrialEquipmentFeeds(cut,{rooms:[{...room,holes:[[[-3,-1],[-3,1],[-2,1],[-2,-1]]]}]});
  expect(cut.placements.filter(p=>p.module?.startsWith('ceiling-services-industrial-feed-'))).toHaveLength(0);
  const low=fixture(2.5);placeIndustrialEquipmentFeeds(low,{rooms:[room]});
  expect(low.placements.filter(p=>p.module?.startsWith('ceiling-services-industrial-feed-'))).toHaveLength(0);
});

it('paints only a clear route to the real core portal, never across equipment', async () => {
  const { PlacementBuilder }=await import('../src/placements/builder.js');
  const { markIndustrialRoutes }=await import('../src/styles/industrial/wayfinding.js');
  const room={id:'plant',kind:'mechanical_room' as const,polygon:[[-4,-1],[4,-1],[4,13],[-4,13]] as [number,number][],doors:[
    {id:'entry',to:'outside',position:[0,0] as [number,number],angleDeg:0,width:2,leaves:2 as const},
    {id:'core',to:'hall',position:[0,12] as [number,number],angleDeg:0,width:1.8,leaves:2 as const},
  ]};
  const free=new PlacementBuilder();markIndustrialRoutes(free,{rooms:[room]});
  expect(free.placements).toHaveLength(2);
  for(const slot of free.mesh.materials()){
    const p=free.mesh.getGroup(slot)!.positions;
    for(let i=1;i<p.length;i+=3)expect(p[i]).toBeLessThan(.004);
  }
  const occupied=new PlacementBuilder();markIndustrialRoutes(occupied,{rooms:[room],furniture:[{id:'equipment',kind:'counter',room:'plant',position:[0,6],rotationDeg:0,size:[4,1,1]}]});
  expect(occupied.placements).toHaveLength(0);
});
