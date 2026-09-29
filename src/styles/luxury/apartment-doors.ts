import type { Point } from '../../core/geom.js';
import { roomFootprintContains } from '../../core/room-footprint.js';
import type { Room, RoomDoor } from '../../core/types.js';
import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';

/** Private entrance contract. These are NOT static floor placements: the dedicated
 * apartment-door consumer owns their moving assemblies and exact collision.
 * Coordinates use Interior's floor-local Y=0, metres and Three's rotationY convention.
 * Source study: the Apartment 1702 entrance: deep separate casing,
 * solid private leaf, tall contrasting numberplate beside (not over) the entrance. */
export interface ApartmentDoorPart {
  module: string;
  position: [number, number, number];
  rotationY: number;
  scale: [number, number, number];
}

export interface ApartmentEntrance {
  id: string;
  role: 'apartment';
  unit: string;
  slot: number;
  number: string;
  corridorRoom: string;
  privateRoom: string;
  connection: string;
  position: Point;
  inward: Point;
  width: number;
  height: number;
  leafDepth: number;
  motion: { kind: 'pocket'; maxTravel: number; leaves: { leaf: number; travelU: number }[] };
  /** Closed left edge at local origin; +X across opening; +Z into apartment. */
  leaves: ApartmentDoorPart[];
  /** Empty cassette volumes in the first leaf's closed frame. */
  pockets: { min: [number, number, number]; max: [number, number, number] }[];
  /** Static plate/digits and concealed overhead runner. Existing fitted jamb/header
   * modules remain reveal owners, with their central channel actually carved out. */
  fixed: ApartmentDoorPart[];
}

export type ApartmentSlots = Readonly<Record<string, number>>;
const COMMON = new Set(['corridor', 'elevator_lobby', 'concourse', 'reception', 'lounge']);
const DWELLING = new Set(['living', 'bedroom', 'studio_main']);

/** Unit IDs contain room-count offsets, so cannot identify a repeated bay: adding a
 * bathroom changes the next unit's ID. The allocated footprint's low corner survives
 * those subdivisions. Preserve the map when combining units; removed slots stay reserved. */
export function apartmentPositionKey(members: readonly Room[]): string {
  const [x, z] = unitBounds(members);
  return `bay:${x.toFixed(3)}:${z.toFixed(3)}`;
}

function unitBounds(members: readonly Room[]): [number, number, number, number] {
  const vertices = members.flatMap(room => room.polygon);
  return [Math.min(...vertices.map(p => p[0])), Math.min(...vertices.map(p => p[1])),
    Math.max(...vertices.map(p => p[0])), Math.max(...vertices.map(p => p[1]))];
}

/** Build once in ascending floor order. The first residential floor establishes
 * sequential positions; setbacks match those bays by overlap instead of inserting
 * their shifted corners between the original numbers. A saved map retains gaps. */
export function apartmentSlots(floors: readonly (readonly Room[])[], previous: ApartmentSlots = {}): Record<string, number> {
  const result = {...previous}, used = new Set<number>();
  for (const slot of Object.values(result)) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 99) fail('invalid position slot');
    used.add(slot); // Different floor footprints may alias the same stable position.
  }
  const canonical = new Map<number, ReturnType<typeof unitBounds>>();
  let next = 1;
  for (const rooms of floors) {
    const positions = new Map<string, ReturnType<typeof unitBounds>>();
    for (const members of dwellings(rooms).values()) positions.set(apartmentPositionKey(members), unitBounds(members));
    const bays = orderedBays(positions), occupied = new Set<number>(), assigned = new Set<string>();
    for (const [key, bounds] of bays) {
      const slot = result[key];
      if (slot === undefined) continue;
      if (occupied.has(slot)) fail(`two apartments share position ${slot} on one floor`);
      occupied.add(slot); assigned.add(key);
      if (!canonical.has(slot)) canonical.set(slot,bounds);
    }
    const matches = bays.filter(([key])=>!assigned.has(key)).flatMap(([key,bounds]) => [...canonical].flatMap(([slot,base]) => {
      if (occupied.has(slot)) return [];
      const overlap = Math.max(0,Math.min(bounds[2],base[2])-Math.max(bounds[0],base[0]))
        * Math.max(0,Math.min(bounds[3],base[3])-Math.max(bounds[1],base[1]));
      const area = (bounds[2]-bounds[0])*(bounds[3]-bounds[1]), baseArea = (base[2]-base[0])*(base[3]-base[1]);
      const coverage = overlap / Math.min(area,baseArea);
      if (coverage < .2) return [];
      // A merged bay keeps its first covered position, rather than the centre
      // of a newly enlarged rectangle silently replacing the earlier address.
      const merged = area > baseArea*1.25 && overlap/baseArea > .95;
      const distance = merged ? 0 : Math.hypot((bounds[0]+bounds[2]-base[0]-base[2])/2,(bounds[1]+bounds[3]-base[1]-base[3])/2);
      return [{key,slot,coverage,distance}];
    }));
    matches.sort((a,b)=>b.coverage-a.coverage || a.distance-b.distance || a.slot-b.slot || a.key.localeCompare(b.key));
    for (const match of matches) {
      if (assigned.has(match.key) || occupied.has(match.slot)) continue;
      result[match.key]=match.slot; assigned.add(match.key); occupied.add(match.slot);
    }
    for (const [key,bounds] of bays) {
      if (assigned.has(key)) continue;
      while (used.has(next)) next++;
      if (next>99) fail('more than 99 apartment positions');
      result[key]=next; canonical.set(next,bounds); occupied.add(next); used.add(next++);
    }
  }
  return result;
}

function orderedBays(positions: Map<string, ReturnType<typeof unitBounds>>): [string, ReturnType<typeof unitBounds>][] {
  // Recessed corners beside a core still belong to the same corridor-side row.
  const rows: {near:number;far:number;bays:[string,ReturnType<typeof unitBounds>][]}[]=[];
  for (const bay of [...positions].sort((a,b)=>a[1][1]-b[1][1] || a[1][0]-b[1][0])) {
    const [,bounds]=bay;
    let row=rows.find(row=>Math.min(row.far,bounds[3])-Math.max(row.near,bounds[1])>.5);
    if (!row) {row={near:bounds[1],far:bounds[3],bays:[]};rows.push(row);}
    row.near=Math.max(row.near,bounds[1]);row.far=Math.min(row.far,bounds[3]);row.bays.push(bay);
  }
  return rows.flatMap(row=>row.bays.sort((a,b)=>a[1][0]-b[1][0] || a[0].localeCompare(b[0])));
}

/** Call after final room topology. `displayFloor` is explicit: 1 produces 101 etc,
 * independent of whether a ground lobby occupies generator floor index zero.
 * A duplicated corridor entrance is a layout error, not silently discarded metadata.
 * Internal living/kitchen/bathroom connections receive neither a leaf nor a number. */
export function apartmentEntrances(rooms: readonly Room[], displayFloor: number, slots: ApartmentSlots,
  clearHeight = 2.5): ApartmentEntrance[] {
  if (!Number.isInteger(displayFloor) || displayFloor < 0 || displayFloor > 99) fail('invalid display floor');
  if (!Number.isFinite(clearHeight) || clearHeight < 2.1 || clearHeight > 3) fail('invalid clear height');
  const byId = new Map(rooms.map(room => [room.id, room]));
  const output: ApartmentEntrance[] = [], occupied = new Set<number>();
  for (const [unit, members] of dwellings(rooms)) {
    const entrances: { room: Room; common: Room; door: RoomDoor }[] = [];
    for (const room of members) for (const door of room.doors) {
      const common = byId.get(door.to);
      if (door.kind === 'openFront' || !common || common.unit !== undefined || !COMMON.has(common.kind)) continue;
      entrances.push({ room, common, door });
    }
    if (entrances.length !== 1) fail(`${unit} has ${entrances.length} corridor entrances; expected exactly one`);
    const { room, common, door } = entrances[0]!;
    if (door.leaves > 2 || door.width < 0.7 || door.width > 2.4) fail(`${unit} needs a supported apartment opening`);
    const slot = slots[apartmentPositionKey(members)];
    if (!slot || !Number.isInteger(slot) || slot > 99) fail(`missing stable position for ${unit}`);
    if (occupied.has(slot)) fail(`two apartment entrances share position ${slot}`);
    occupied.add(slot);
    const number = `${displayFloor}${String(slot).padStart(2, '0')}`;
    const radians = door.angleDeg * Math.PI / 180;
    let along: Point = [Math.cos(radians), Math.sin(radians)];
    let inward: Point = [-along[1], along[0]];
    const probe = (n: Point): Point => [door.position[0] + n[0] * 0.15, door.position[1] + n[1] * 0.15];
    if (!roomFootprintContains(room, probe(inward))) {
      along = [-along[0], -along[1]]; inward = [-inward[0], -inward[1]];
    }
    if (!roomFootprintContains(room, probe(inward))) fail(`${unit} entrance has no inward room face`);
    const hinge: Point = [door.position[0] - along[0] * door.width / 2, door.position[1] - along[1] * door.width / 2];
    const rotationY = -Math.atan2(along[1], along[0]);
    const part = (module: string, x: number, y: number, z: number): ApartmentDoorPart => ({
      module, position: [hinge[0] + along[0] * x + inward[0] * z, y, hinge[1] + along[1] * x + inward[1] * z],
      rotationY, scale: [1, 1, 1],
    });
    // Corridor face is -Z. Text is authored to read from that face, with its
    // horizontal direction reversed relative to +X seen from inside the apartment.
    const plateX = door.width + 0.235, plateY = 1.59;
    const fixed = [part('apartment-numberplate-luxury', plateX, plateY, -0.115)];
    for (const [i, digit] of [...number].entries()) fixed.push(part(`apartment-digit-${digit}-luxury`,
      plateX + ((number.length - 1) / 2 - i) * 0.049, plateY + 0.031, -0.1256));
    const half = door.width / 2, travel = half + 0.055;
    const left = {...part('apartment-pocket-leaf-luxury', 0, 0, 0), scale:[half / .9, clearHeight / 2.5, 1] as [number,number,number]};
    const right = {...part('apartment-pocket-leaf-luxury', door.width, 0, 0), rotationY:rotationY + Math.PI,
      scale:[half / .9, clearHeight / 2.5, 1] as [number,number,number]};
    fixed.push({...part('apartment-pocket-track-luxury', half, clearHeight + .008, 0),
      scale:[(door.width * 2 + .18) / .5,1,1]});
    for (const x of [-half-.083, door.width+half+.083]) fixed.push({
      ...part('apartment-pocket-end-stop-luxury', x, .003, 0), scale:[1,(clearHeight+.062)/.5,1],
    });
    output.push({
      id: `apartment:${unit}`, role: 'apartment', unit, slot, number,
      corridorRoom: common.id, privateRoom: room.id, connection: door.id,
      position: [...door.position], inward, width: door.width, height: clearHeight, leafDepth: 0.06,
      motion: { kind: 'pocket', maxTravel: travel, leaves:[{leaf:0,travelU:-travel},{leaf:1,travelU:travel}] },
      leaves:[left,right], pockets:[
        {min:[-half-.09,.003,-.04],max:[.001,clearHeight+.065,.04]},
        {min:[door.width-.001,.003,-.04],max:[door.width+half+.09,clearHeight+.065,.04]},
      ], fixed,
    });
  }
  return output.sort((a, b) => a.slot - b.slot);
}

function dwellings(rooms: readonly Room[]): Map<string, Room[]> {
  const groups = new Map<string, Room[]>();
  for (const room of rooms) if (room.unit !== undefined) {
    if (!groups.has(room.unit)) groups.set(room.unit, []);
    groups.get(room.unit)!.push(room);
  }
  for (const [unit, members] of groups) if (!members.some(room => DWELLING.has(room.kind))) groups.delete(unit);
  return groups;
}
function fail(message: string): never { throw new Error(`E_APARTMENT_ENTRANCE: ${message}`); }

/** Separately reusable meshes: the moving leaf is never in the static placement table.
 * Width 0.9 m / head 2.5 m are canonical, with a 4 mm perimeter reveal and 12 mm
 * floor undercut. Metal skins cover a 50 mm solid core; hardware projects 38 mm. */
export const apartmentDoorRecipes: RecipeSet = add => {
  add('apartment-pocket-leaf-luxury', k => {
    k.box(F.black, [0.004, 0.012, -0.025], [0.892, 2.482, 0.05]);
    for (const side of [-1, 1]) {
      const skin = side < 0 ? -0.03 : 0.025, trim = side < 0 ? -0.032 : 0.03;
      // Four real skin panels leave a 5 mm recessed finger cup. Nothing projects
      // beyond the 64 mm leaf envelope: no lever or hinge enters a pocket wall.
      k.box(F.timber, [.009, .018, skin], [.727, 2.470, .005]);
      k.box(F.timber, [.814, .018, skin], [.077, 2.470, .005]);
      k.box(F.timber, [.736, .018, skin], [.078, .967, .005]);
      k.box(F.timber, [.736, 1.175, skin], [.078, 1.313, .005]);
      for (const x of [.736, .808]) k.box(F.bronze, [x, .985, trim], [.006, .19, .002]);
      for (const y of [.985, 1.169]) k.box(F.bronze, [.742, y, trim], [.066, .006, .002]);
      k.box(F.bronze, [.862, .018, trim], [.024, 2.470, .002]);
      k.box(F.black, [.027, .035, trim], [.812, .17, .002]);
    }
  });
  add('apartment-pocket-track-luxury', k => {
    k.cbox(F.black, [0, .032, 0], [.5, .007, .09]);
    for (const z of [-.04, .04]) k.cbox(F.bronze, [0, 0, z], [.5, .032, .007]);
  });
  add('apartment-pocket-end-stop-luxury', k => {
    k.cbox(F.black, [0, 0, 0], [.014, .5, .14]);
  });
  add('apartment-leaf-luxury', k => {
    k.box(F.black, [0.004, 0.012, -0.025], [0.892, 2.482, 0.05]);
    for (const side of [-1, 1]) {
      k.box(F.timber, [0.009, 0.018, side < 0 ? -0.03 : 0.025], [0.882, 2.470, 0.005]);
      // Separate bronze latch stile and inset kick plate; visible seams are geometry.
      k.box(F.bronze, [0.862, 0.018, side < 0 ? -0.032 : 0.03], [0.024, 2.47, 0.002]);
      k.box(F.black, [0.027, 0.035, side < 0 ? -0.032 : 0.03], [0.812, 0.17, 0.002]);
      k.box(F.bronze, [0.749, 0.975, side < 0 ? -0.035 : 0.031], [0.05, 0.10, 0.004]);
      k.rod(F.bronze, [0.775, 1.037, side * 0.035], [0.775, 1.037, side * 0.065], 0.015);
      k.rod(F.bronze, [0.675, 1.037, side * 0.065], [0.78, 1.037, side * 0.065], 0.015);
      // Flush escutcheon and cylinder; no luminous cartoon status slab.
      k.box(F.black, [0.767, 0.987, side < 0 ? -0.040 : 0.035], [0.016, 0.022, 0.005]);
    }
    for (const y of [0.22, 1.16, 2.18]) k.cylinder(F.bronze, [0.004, y, 0], 0.009, 0.09, 20);
  });
  add('apartment-numberplate-luxury', k => {
    k.cbox(F.black, [0, 0, 0], [0.31, 0.14, 0.012]);
    k.cbox(F.bronze, [0, 0.004, -0.008], [0.30, 0.132, 0.004]);
    for (const x of [-0.139, 0.139]) k.cbox(F.black, [x, 0.064, -0.0105], [0.004, 0.004, 0.001]);
  });
  for (let digit = 0; digit <= 9; digit++) add(`apartment-digit-${digit}-luxury`, k => drawDigit(k, digit));
};

// Narrow physical lettering, dark on bronze. The
// segments are solid raised strokes, not emissive digital display components.
const DIGITS = ['abcedf', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd'];
function drawDigit(k: Kit, digit: number): void {
  const bars: Record<string, [number, number, number, number]> = {
    a: [0, 0.073, 0.034, 0.007], g: [0, 0.038, 0.034, 0.007], d: [0, 0.003, 0.034, 0.007],
    f: [0.017, 0.042, 0.006, 0.031], b: [-0.017, 0.042, 0.006, 0.031],
    e: [0.017, 0.007, 0.006, 0.031], c: [-0.017, 0.007, 0.006, 0.031],
  };
  for (const key of DIGITS[digit]!) {
    const [x, y, w, h] = bars[key]!;
    k.cbox(F.black, [x, y, 0], [w, h, 0.0012]);
  }
}
