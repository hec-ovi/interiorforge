import { expect, it } from 'vitest';
import type { Room } from '../src/core/types.js';
import { apartmentEntrances, apartmentPositionKey, apartmentSlots } from '../src/styles/luxury/apartment-doors.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { fitApartmentNumberplates } from '../src/placements/apartment-doors.js';
import { doorZone } from '../src/layout/clearance.js';
import { generate, makePlacementFixture } from '../src/index.js';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { carveApartmentPockets } from '../src/placements/apartment-pockets.js';
import type { Placement } from '../src/placements/types.js';
import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';

function floor(index: number): Room[] {
  const rooms: Room[] = [{ id: 'corridor', kind: 'corridor', polygon: [[0, 4], [16, 4], [16, 6], [0, 6]], doors: [] }];
  for (const [position, x, z] of [[0, 0, 0], [1, 8, 0], [2, 0, 6], [3, 8, 6]]) {
    const unit = `f${index}-position-${position}`;
    const id = `${unit}-living`, edge = z === 0 ? 4 : 6;
    rooms.push({ id, kind: 'living', unit, polygon: [[x!, z!], [x! + 7, z!], [x! + 7, z! + 4], [x!, z! + 4]],
      doors: [{ id: `${id}-entry`, to: 'corridor', width: 0.9, leaves: 1, position: [x! + 3, edge], angleDeg: 0 },
        { id: `${id}-bath`, to: `${unit}-bath`, width: 0.9, leaves: 1, position: [x! + 1, z! + 2], angleDeg: 90 }] });
    rooms.push({ id: `${unit}-bath`, kind: 'bathroom', unit, polygon: [[x!, z!], [x! + 2, z!], [x! + 2, z! + 2], [x!, z! + 2]], doors: [] });
  }
  return rooms;
}

it('numbers one corridor entrance per private apartment and keeps unit positions across floor and room ordering', () => {
  const one = floor(1), two = floor(2).reverse();
  const slots = apartmentSlots([two, one]);
  const entrances = apartmentEntrances(one, 1, slots);
  expect(entrances.map(door => door.number)).toEqual(['101', '102', '103', '104']);
  expect(apartmentEntrances(two, 2, slots).map(door => door.number)).toEqual(['201', '202', '203', '204']);
  expect(entrances.every(door => door.corridorRoom === 'corridor' && door.privateRoom.endsWith('living'))).toBe(true);
  expect(entrances.every(door => door.role === 'apartment' && door.connection.endsWith('entry'))).toBe(true);
  expect(entrances.map(door => door.inward[1])).toEqual([-1, -1, 1, 1]);
  // The fixed plate and letters stay beyond the latch jamb, never across the passage.
  for (const door of entrances) for (const part of door.fixed.filter(part => !part.module.includes("track"))) {
    expect(Math.hypot(part.position[0] - door.position[0], part.position[2] - door.position[1])).toBeGreaterThan(door.width / 2);
  }
});

it('retains reserved numbers when a unit is combined or omitted on another floor', () => {
  const one = floor(1), slots = apartmentSlots([one]);
  const fewer = one.filter(room => room.unit !== 'f1-position-1');
  const next = apartmentSlots([fewer], slots);
  expect(next).toEqual(slots);
  expect(apartmentEntrances(fewer, 1, next).map(door => door.number)).toEqual(['101', '103', '104']);
});

it('keeps a typical floor sequential when a setback crown shifts and removes apartments', () => {
  const room = (unit: string, [x0,z0,x1,z1]: number[]): Room => ({id:unit,unit,kind:'living',doors:[],
    polygon:[[x0!,z0!],[x1!,z0!],[x1!,z1!],[x0!,z1!]]});
  // Real40m megablock footprints: four northern, two eastern and two southern bays.
  const base = [[3.265,1,10.5,11.5],[10.5,1,20,9],[20,1,27.5,11],[27.5,1,36.735,9],
    [29,10.24,39,17.675],[31.5,17.675,39,27.435],[20,31,29.5,39],[29.5,28.5,36.735,39]]
    .map((bounds,i)=>room(`f1-home-${i}`,bounds));
  const crown = [[5.89,1.5,13.175,11.5],[13.175,1.5,20,11.5],[20,1.5,27.285,11.5],
    [27.285,1.5,34.11,11.5],[17.725,28.5,24.78,38.5]].map((bounds,i)=>room(`f5-home-${i}`,bounds));
  const slots=apartmentSlots([base,crown]);
  expect(base.map(room=>slots[apartmentPositionKey([room])])).toEqual([1,2,3,4,5,6,7,8]);
  expect(crown.map(room=>slots[apartmentPositionKey([room])])).toEqual([1,2,3,4,7]);
  expect(apartmentSlots([base,crown],slots)).toEqual(slots);
});

it('keeps numbers when crown room counts change generated unit IDs and a corner is recessed beside the core', () => {
  const one = floor(1), crown = floor(5);
  for (const room of crown) if (room.unit) room.unit = room.unit.replace('position-', 'different-room-offset-');
  // Both high-Z apartments still belong to the same corridor row, despite the
  // last one's reserved core corner starting 0.5 m nearer the corridor.
  for (const room of [...one, ...crown]) if (room.unit?.endsWith('-3')) room.polygon = room.polygon.map(([x, z]) => [x, z === 6 ? 5.5 : z]);
  const slots = apartmentSlots([crown, one]);
  expect(Object.keys(slots)).toHaveLength(4);
  expect(apartmentEntrances(one, 1, slots).map(door => door.number)).toEqual(['101', '102', '103', '104']);
  expect(apartmentEntrances(crown, 5, slots).map(door => door.number)).toEqual(['501', '502', '503', '504']);
});

it('rejects two public entrances into the same apartment rather than silently leaving an unclosable private boundary', () => {
  const rooms = floor(1), slots = apartmentSlots([rooms]);
  rooms[1]!.doors.push({ ...rooms[1]!.doors[0]!, id: 'second-public-entry' });
  expect(() => apartmentEntrances(rooms, 1, slots)).toThrow('2 corridor entrances');
});

it('authors thick sliding leaves with recessed pulls and a separate physical numberplate', () => {
  const models = new Map(moduleRecipes().map(model => [model.id, model]));
  const leaf = models.get('apartment-pocket-leaf-luxury')!;
  expect(leaf.size[0]).toBeGreaterThan(0.89);
  expect(leaf.size[1]).toBeCloseTo(2.482);
  expect(leaf.size[2]).toBeCloseTo(0.064);
  // A solid core actually occupies the centre, with skins on both sides.
  expect(leaf.mesh.materials().length).toBe(3);
  const wood = leaf.mesh.getGroup('cyberpunk/interior-luxury-timber/rich#field')!;
  expect(Math.min(...wood.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(-0.03);
  expect(Math.max(...wood.positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(0.03);
  expect(models.has('apartment-numberplate-luxury')).toBe(true);
  for (let digit = 0; digit < 10; digit++) expect(models.get(`apartment-digit-${digit}-luxury`)!.size[2]).toBeCloseTo(0.0012);
});

it.each(['wall-field-meridian-mineral','wall-panel-field-charcoal'])('cuts real channels and retains opaque pocket faces in %s', fieldModule => {
  const rooms = floor(1), door = apartmentEntrances(rooms,1,apartmentSlots([rooms]))[0]!;
  const parts: Placement[] = [];
  const add=(module:string,room:string,position:[number,number,number],scale:[number,number,number],rotationY=0)=>parts.push({id:`p${parts.length}`,module,room,position,scale,rotationY});
  for (const [room,yaw] of [['corridor',0],[door.privateRoom,Math.PI]] as const) {
    const fields = room === 'corridor' && fieldModule.includes('panel') ? [fieldModule]
      : ['wall-field-meridian-mineral','wall-field-meridian-backing'];
    for(const module of fields) {
      add(module,room,[1.235,0,4],[2.47/.5,3/.5,1],yaw);
      add(module,room,[5.265,0,4],[3.47/.5,3/.5,1],yaw);
    }
  }
  for(const x of [2.51,3.49])add('door-jamb-luxury','corridor',[x,0,4],[1,5,1]);
  add('door-header-luxury','corridor',[3,2.5,4],[1.06/.5,1,1]);
  carveApartmentPockets([door],parts,rooms);
  const models=new Map(moduleRecipes().map(model=>[model.id,model]));
  const extent=(part:{module:string;position:number[];scale:number[];rotationY:number})=>{
    const model=models.get(part.module)!,c=Math.cos(part.rotationY),s=Math.sin(part.rotationY),points:number[][]=[];
    for(const x of [-model.origin[0],model.size[0]-model.origin[0]])for(const y of [-model.origin[1],model.size[1]-model.origin[1]])for(const z of [-model.origin[2],model.size[2]-model.origin[2]]){
      points.push([part.position[0]!+c*x*part.scale[0]!+s*z*part.scale[2]!,part.position[1]!+y*part.scale[1]!,part.position[2]!-s*x*part.scale[0]!+c*z*part.scale[2]!]);
    }
    return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]!))),max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i]!)))};
  };
  const solids=parts.map(part=>extent(part as Required<Placement>));
  for(const fraction of [0,.25,.5,.75,1])for(const [i,part] of door.leaves.entries()){
    const travel=door.motion.leaves[i]!.travelU*fraction,angle=door.leaves[0]!.rotationY;
    const leaf=extent({...part,position:[part.position[0]+Math.cos(angle)*travel,part.position[1],part.position[2]-Math.sin(angle)*travel]});
    expect(solids.some(box=>[0,1,2].every(axis=>Math.min(box.max[axis]!,leaf.max[axis]!)-Math.max(box.min[axis]!,leaf.min[axis]!)>1e-5)),`leaf ${i} at ${fraction} must not intersect a static backing or jamb`).toBe(false);
  }
  expect(parts.some(part=>part.scale[2]<.8)).toBe(true);
  expect(solids.some(box=>box.min[2]!<3.91)).toBe(true);
  expect(solids.some(box=>box.max[2]!>4.09)).toBe(true);
  const meshes: Mesh[] = [], material = new MeshBasicMaterial();
  for (const part of parts) for (const slot of models.get(part.module!)!.mesh.materials()) {
    const surface=models.get(part.module!)!.mesh.getGroup(slot)!;
    const geometry=new BufferGeometry().setAttribute('position',new Float32BufferAttribute(surface.positions,3));
    geometry.setIndex(Array.from(surface.indices));
    const mesh=new Mesh(geometry,material);mesh.position.fromArray(part.position);mesh.scale.fromArray(part.scale);mesh.rotation.y=part.rotationY;mesh.updateMatrixWorld();meshes.push(mesh);
  }
  try {
    // This ray aims exactly where a fully retracted leaf sits. The opaque skin
    // must be in front of its 64 mm envelope, including thin capsule infill walls.
    const hit=new Raycaster(new Vector3(3.9,1.2,5),new Vector3(0,0,-1),0,2).intersectObjects(meshes,false)[0];
    expect(hit).toBeDefined();
    expect(hit!.point.z).toBeGreaterThan(4.05);
  } finally { for(const mesh of meshes)mesh.geometry.dispose();material.dispose(); }
});


it('mounts the full plate on opaque wall and uses the opposite jamb when a corner consumes its preferred span', () => {
  const rooms = floor(1), doors = apartmentEntrances(rooms, 1, apartmentSlots([rooms]));
  const door = doors[2]!; // +Z is inward, hinge X is 2.55
  const wall = { id: 'actual-wall', module: 'wall-field-meridian-mineral', room: 'corridor',
    position: [2.1, 0, 6] as [number, number, number], rotationY: Math.PI, scale: [1.4, 5, 1] as [number, number, number] };
  fitApartmentNumberplates([door], [wall]);
  expect(door.fixed[0]!.position[0]).toBeLessThan(door.leaves[0]!.position[0]);
  const model = moduleRecipes().find(model => model.id === wall.module)!;
  const actualWallFront = 6 - (model.size[2] - model.origin[2]);
  expect(door.fixed[0]!.position[2] + 0.006).toBeCloseTo(actualWallFront - 0.0005, 5);
  expect(() => fitApartmentNumberplates([door], [{ ...wall, module: 'wall-panel-field-glass' }])).toThrow('no opaque wall span');
});

it('preserves unobstructed arrival clearance around private openings', () => {
  for (const width of [0.7, 0.9, 1.2]) {
    const room = { id: 'living', kind: 'living' as const, unit: 'unit', rect: {u:0,v:0,lu:5,lv:5}, doors: [] };
    const zone = doorZone({ id: 'entrance', to: 'corridor', edge: 'v0', at: 2, width, leaves: 1 }, room);
    expect(zone.lv / 2).toBeGreaterThanOrEqual(width);
    expect(zone.lu).toBeGreaterThan(width);
  }
});

it.each(['mid','poor'] as const)('publishes numbered paired pocket entrances for %s residential homes', async tier => {
  const request=makePlacementFixture({width:40,depth:40,floors:4,type:'residential',tier,
    seed:tier==='mid'?'capsule-reference':'worn-proof'});
  const result=await generate(request,{models:new Set()});
  const doors=result.building.floors.find(entry=>entry.apartmentEntrances?.length)!.apartmentEntrances!;
  expect(doors.length).toBeGreaterThan(0);
  const suffix=tier==='mid'?'capsule':'damaged';
  expect(doors[0]!.number).toBe('101');
  for(const door of doors){
    expect(door.motion.kind).toBe('pocket');
    expect(door.leaves).toHaveLength(2);
    expect(door.leaves.every(part=>part.module.endsWith(suffix))).toBe(true);
    expect(door.fixed.every(part=>part.module.endsWith(suffix))).toBe(true);
  }
},60000);

it('publishes distinct floor numbers and supported plates on the actual six-storey balcony-grid exterior', async () => {
  const { generate: exterior } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
  const { blueprint } = await exterior({ buildingId: 'p0', theme: 'cyberpunk', seed: 'luxury-reference-review',
    parcel: { footprint: [[81.5,34],[121.5,34],[121.5,74],[81.5,74]], accessPoint: [101.5,34], maxHeight: 31.5,
      buildingGrid: {origin:[81.5,34],angle:0,spacing:0.5}, streetAccess:{edgeId:'e0',path:[[21.6,21.6],[183.1,21.6]]} },
    building: { type: 'residential', tier: 'high_rich', floors: 6 },
    options: { architecture: 'balcony-grid', glb: 'merged' },
  }, { textures: {mode:'keys'} });
  const result = await generate({ seed: 'luxury-reference-review', building: {id:'p0',type:'residential',tier:'high_rich'},
    blueprint, materialTheme:'cyberpunk' }, {models:new Set()});
  const validator = new Ajv2020({strict:false});
  for (const name of ['floor','npc','blueprint','modules','floor-placement','building']) {
    validator.addSchema(JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url),'utf8')),
      `https://urbe.dev/interior/${name}.schema.json`);
  }
  const valid = validator.getSchema('https://urbe.dev/interior/building.schema.json')!;
  expect(valid(result.building), JSON.stringify(valid.errors)).toBe(true);
  const occupied = result.building.floors.filter(entry => entry.apartmentEntrances?.length);
  expect(occupied).toHaveLength(5);
  const suffixes = occupied[0]!.apartmentEntrances!.map(door => door.number.slice(-2));
  for (const entry of occupied) {
    const doors = entry.apartmentEntrances!;
    expect(doors.map(door => door.number)).toEqual(suffixes.map(suffix => `${entry.index}${suffix}`));
    expect(doors.every(door => door.privateRoom !== door.corridorRoom)).toBe(true);
    expect(result.layouts[entry.layout]!.placements.some(part => part.module?.startsWith('apartment-'))).toBe(false);
  }
}, 180_000);
