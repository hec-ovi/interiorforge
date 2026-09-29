import { describe, expect, it } from 'vitest';
import { moduleRecipes } from '../src/modules/recipes.js';
import { Kit } from '../src/modules/kit.js';
import { corporateRecipes, corporateRoomFinish, corporateRoomFit, CORPORATE_FITS, isCorporate } from '../src/styles/corporate/index.js';
import { furnishCorporate, type CorporatePlacer } from '../src/styles/corporate/furnish.js';
import type { PlanRoom } from '../src/layout/plan-types.js';
import { furnitureLights } from '../src/layout/furniture-lights.js';
import { makeFrame } from '../src/layout/uv.js';
import { LUXURY_REFERENCE_FITS, LUXURY_REFERENCE_LIGHTS } from '../src/styles/luxury/profile.js';
import { readFile } from 'node:fs/promises';
import { generate } from '../src/index.js';

describe('corporate architectural programme', () => {
  it('puts inherited washroom lights on the real luxury lenses and leaves corporate joinery unlit', () => {
    const sink = { id: 'basin', kind: 'sink' as const, room: 'washroom', at: [0, 0] as [number, number], rotationDeg: 0 as const,
      size: LUXURY_REFERENCE_FITS.sink!.size };
    const lights = furnitureLights([sink], makeFrame(0), 0, 'mid', 'corporate');
    expect(lights.map(light => light.position)).toEqual(LUXURY_REFERENCE_LIGHTS.sink!.lenses.map(lens => lens.at));
    expect(lights.every(light => light.colorTemperatureK === 2700 && !light.color)).toBe(true);
    for (const kind of ['reception_desk', 'counter', 'shelf', 'wall_shelf'] as const) {
      expect(furnitureLights([{ ...sink, kind, size: CORPORATE_FITS[kind]!.size }], makeFrame(0), 0, 'rich', 'corporate')).toEqual([]);
    }
  });
  it('selects offices independently of luxury residential tiers', () => {
    expect(isCorporate('offices', 'mid')).toBe(true);
    expect(isCorporate('corpo', 'high_rich')).toBe(true);
    expect(isCorporate('residential', 'high_rich')).toBe(false);
    expect(isCorporate('offices', 'poor')).toBe(false);
    expect(corporateRoomFinish('office_open', 'office').floor).toContain('carpet');
    expect(corporateRoomFinish('executive_office', 'corpo_office').floor).toBe('floor-slab-corporate-wood');
    expect(corporateRoomFinish('reception', 'lobby').field).toContain('graphite');
  });

  it('supplies workstation support before filling desk rows and keeps circulation wall-only', () => {
    const calls: string[] = [];
    const p: CorporatePlacer = {
      anyEdge: kind => { calls.push(kind); return null; },
      center: kind => { calls.push(kind); return null; },
      wallPiece: kind => { calls.push(`wall:${kind}`); return null; },
      grid: (kind, aisle) => { calls.push(`${kind}:${aisle}`); return []; },
      seatAt: () => {}, seatsAround: () => {},
    };
    const room = { kind: 'office_open', rect: { u: 0, v: 0, lu: 12, lv: 10 }, doors: [] } as unknown as PlanRoom;
    expect(furnishCorporate(room, 'office', p)).toBe(true);
    expect(calls.slice(0, 4)).toEqual(['counter', 'shelf', 'plant', 'desk:1.8']);
    calls.length = 0;
    expect(furnishCorporate({ ...room, kind: 'corridor' }, 'office', p)).toBe(true);
    expect(calls).toEqual(['wall:wall_art']);
  });

  it('keeps models within reservations with finite smooth normals and physical UVs', () => {
    const modules = new Map<string, Kit>();
    corporateRecipes((id, draw) => { const k = new Kit(() => [1, 1]); draw(k); modules.set(id, k); });
    for (const [kind, fit] of [...Object.entries(CORPORATE_FITS), ['executive-desk', corporateRoomFit('desk','executive_office')!], ['private-art', corporateRoomFit('wall_art','executive_office')!], ['private-library', corporateRoomFit('shelf','executive_office')!]] as [string, {module:string,size:[number,number,number]}][]) {
      const k = modules.get(fit.module);
      if(!k){const shared=moduleRecipes().find(r=>r.id===fit.module)!;expect(shared,kind).toBeDefined();expect(shared.size[0]).toBeLessThanOrEqual(fit.size[0]+.001);expect(shared.size[1]).toBeLessThanOrEqual(fit.size[2]+.001);expect(shared.size[2]).toBeLessThanOrEqual(fit.size[1]+.001);continue;}
      const [w, d, h] = fit.size;
      for (const slot of k.mesh.materials()) {
        const g = k.mesh.getGroup(slot)!;
        expect([...g.positions, ...g.normals, ...g.uvs].every(Number.isFinite)).toBe(true);
        for (let i = 0; i < g.positions.length; i += 3) {
          expect(Math.abs(g.positions[i]!), kind).toBeLessThanOrEqual(w / 2 + .001);
          expect(Math.abs(g.positions[i + 2]!), kind).toBeLessThanOrEqual(d / 2 + .001);
          expect(g.positions[i + 1]!, kind).toBeGreaterThanOrEqual(-.001);
          expect(g.positions[i + 1]!, kind).toBeLessThanOrEqual(h + .001);
          expect(Math.hypot(...g.normals.slice(i, i + 3)), `${kind} ${slot}`).toBeCloseTo(1, 5);
        }
      }
    }
  });
});

it.each(['corporate-sectors-56', 'white-grid-40', 'mirror-frame-64'])('fits and furnishes the actual paired %s office shell', async name => {
  const exteriorRequest = JSON.parse(await readFile(new URL(`../fixtures/corporate/${name}.exterior-request.json`, import.meta.url), 'utf8'));
  const program = JSON.parse(await readFile(new URL(`../fixtures/corporate/${name}.interior-program.json`, import.meta.url), 'utf8'));
  const { generate: generateExterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = await generateExterior(exteriorRequest, { textures: { mode: 'keys' } });
  const result = await generate({ ...program, blueprint });
  const occupied = result.building.floors.filter(floor => result.layouts[floor.layout]?.floor.kind !== 'roof');
  expect(occupied).toHaveLength(exteriorRequest.building.floors);
  expect(result.layouts.ground!.placements.some(p => p.module === 'fit-corporate-security-desk')).toBe(true);
  expect(result.layouts.ground!.placements.some(p=>p.module==='ceiling-spot-corporate-panel')).toBe(true);
  const {findPath}=await import('../src/nav.js');
  for(const layout of Object.values(result.layouts).filter(l=>['lobby','office','corpo_office'].includes(l.floor.kind))){
    const point=result.building.connectors.find(c=>c.entryByFloor[String(layout.sourceFloor)])!.entryByFloor[String(layout.sourceFloor)]!;
    for(const anchor of layout.npc.anchors.filter(a=>a.kind==='work_spot'||a.kind==='counter_spot'))expect(findPath({nav:layout.npc.nav,from:{floor:layout.sourceFloor,x:point[0],z:point[1]},to:{floor:layout.sourceFloor,x:anchor.position[0],z:anchor.position[1]}})).not.toHaveProperty('error');
    for(const art of layout.placements.filter(p=>p.module==='wall-corporate-art'))expect(layout.floor.lights.some(l=>l.furniture===art.id)).toBe(true);
  }

  const office = Object.values(result.layouts).find(layout => ['office', 'corpo_office'].includes(layout.floor.kind))!;
  expect(office.placements.some(p => p.prop === 'sketchfab-elegant-black-office-desk')).toBe(true);
  expect(office.placements.some(p => p.prop === 'sketchfab-office-chair')).toBe(true);
  for(const room of office.floor.rooms.filter(r=>r.kind==='executive_office'))expect(office.placements.some(p=>p.room===room.id&&p.module==='fit-corporate-executive-desk')).toBe(true);
  expect(office.placements.some(p => p.module === 'wall-panel-field-glass')).toBe(true);
  expect(office.placements.some(p => p.module === 'ceiling-corporate-backing')).toBe(true);
  expect(office.placements.some(p => p.module === 'fit-corporate-boardroom-table')).toBe(true);
  const meeting = office.floor.rooms.find(room => room.kind === 'meeting')!;
  expect(office.floor.furniture.filter(item => item.room === meeting.id && item.kind === 'office_chair').length).toBeGreaterThanOrEqual(4);
  const mechanical = result.layouts.crown!;
  expect(mechanical.placements.some(p => p.module === 'floor-slab-industrial')).toBe(true);
  expect(mechanical.placements.some(p => p.module === 'fit-service-shelf-luxury')).toBe(true);
}, 180_000);

it('uses published fine PBR variants and preserves the artwork as an exact non-emissive image', async () => {
  const {loadTheme}=await import('../src/materials/load.js');const theme=loadTheme('cyberpunk')!;
  corporateRecipes((id,draw)=>{const k=new Kit(()=>[1,1]);draw(k);for(const slot of k.mesh.materials()){
    const [key,variant]=slot.split('#');expect(theme.library.entry(key!)?.variants.some(v=>v.id===variant),`${id} ${slot}`).toBe(true);
    expect(slot).not.toBe('cyberpunk/interior-luxury-timber/rich#field');
  }});
  const entry=theme.library.entry('cyberpunk/gutierrez-art/rich')!;
  expect(entry.alignment).toBe('exact');expect(entry.physical?.metallicFactor).toBe(0);
  expect(entry.variants.find(v=>v.id==='teal-copper')!.maps).not.toHaveProperty('emission');
});

it('keeps broad-panel joints off door headers and places real lamp records on picture hoods', async () => {
  const {PlacementBuilder}=await import('../src/placements/builder.js');
  const {dressCorporateWalls}=await import('../src/styles/corporate/walls.js');
  const b=new PlacementBuilder();
  b.module('wall-field-corporate-graphite','office',[-2,0,0],[6,6,1]);
  b.module('wall-field-corporate-graphite','office',[2,0,0],[6,6,1]);
  b.module('wall-field-corporate-graphite','office',[0,2.2,0],[2,1.6,1]);
  const art=b.module('wall-corporate-art','office',[-2,1,.3],[1,1,1],Math.PI/2,{id:'art'});
  const floor={elevation:7,rooms:[{id:'office',kind:'executive_office'}],lights:[]} as unknown as import('../src/core/types.js').FloorInterior;
  dressCorporateWalls(b,floor);
  for(const p of b.placements.filter(p=>p.module==='wall-corporate-inlay'))expect(Math.abs(p.position[0])).toBeGreaterThan(.5);
  expect(b.placements.filter(p=>p.module==='wall-corporate-base')).toHaveLength(2);
  const lamp=floor.lights.find(l=>l.furniture===art.id)!;
  for(const [i,value]of [-1.944,8.775,.3].entries())expect(lamp.position[i]).toBeCloseTo(value,8);expect(lamp.length).toBe(.92);expect(lamp.colorTemperatureK).toBe(2700);
});

it('leaves the public diffuser face physically open below its metal frame', () => {
  const k=new Kit(()=>[1,1]);corporateRecipes((id,draw)=>{if(id==='ceiling-spot-corporate-panel')draw(k);});
  const crossings:{slot:string,y:number}[]=[];
  for(const slot of k.mesh.materials()){
    const g=k.mesh.getGroup(slot)!;
    for(let i=0;i<g.indices.length;i+=3){
      const p=Array.from(g.indices.slice(i,i+3)).map(j=>Array.from(g.positions.slice(j*3,j*3+3)));
      if(!p.every(v=>Math.abs(v[1]!-p[0]![1]!)<1e-8))continue;
      const sign=(a:number[],b:number[])=>a[0]!*b[2]!-b[0]!*a[2]!;
      const s=[sign(p[0]!,p[1]!),sign(p[1]!,p[2]!),sign(p[2]!,p[0]!)];
      if(s.every(v=>v>=-1e-10)||s.every(v=>v<=1e-10))crossings.push({slot,y:p[0]![1]!});
    }
  }
  const first=crossings.sort((a,b)=>a.y-b.y)[0]!;
  expect(first.slot).toBe('cyberpunk/light-fixture/rich#strip');expect(first.y).toBe(0);
});
