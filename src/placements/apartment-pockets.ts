import { roomFootprintContains } from '../core/room-footprint.js';
import type { Room } from '../core/types.js';
import type { ModuleRecipe } from '../modules/recipes.js';
import { placementRecipe } from './builder.js';
import type { Placement } from './types.js';

type V3 = [number, number, number];
export interface PocketBox { min: V3; max: V3 }
interface PocketEntrance {
  id: string; unit: string; corridorRoom: string; width: number; height: number;
  leaves: {position: V3; rotationY: number}[];
  pockets: PocketBox[];
}
/** Explicit compatible architectural solids. Loft skins stand beyond the
 * cassette; its separate central backing still needs the physical cutout. */
const pocketWall = (id: string): boolean => /^(?:wall-(?:field|panel|meridian)|loft1702-wall-)/.test(id);

/** A cassette is a real void through the partition and jamb backing, bounded by
 * two opaque wall skins. Cuboid subtraction preserves the published renderer and
 * FloorBoxes contract: each remaining solid is still an ordinary scaled module.
 * No consumer exception, hidden full-wall collider or visible wall-running leaf.
 * An entrance whose pockets would leave that wall (a corner, another apartment, glass
 * or a second opening) is not carved: it stays a framed passage and its ID is left out
 * of the returned set, so the building keeps every other entrance. */
export function carveApartmentPockets(entrances: readonly PocketEntrance[], placements: Placement[], rooms: readonly Room[]): Set<string> {
  let result = placements;
  const carved = new Set<string>();
  for (const door of entrances) {
    const root = door.leaves[0]!, c = Math.cos(root.rotationY), s = Math.sin(root.rotationY);
    const point = (x: number, z: number): [number, number] => [root.position[0] + x*c + z*s, root.position[2] - x*s + z*c];
    const common = rooms.find(room => room.id === door.corridorRoom)!;
    const privateRooms = rooms.filter(room => room.unit === door.unit);
    // Enough common/private wall on both sides of the real door opening, and opaque
    // wall over every point the leaves retract through.
    const walled = door.pockets.every(pocket => [pocket.min[0]+.10, (pocket.min[0]+pocket.max[0])/2, pocket.max[0]-.10].every(x => {
      if (!roomFootprintContains(common, point(x,-.16)) || !privateRooms.some(room => roomFootprintContains(room,point(x,.16)))) return false;
      const probe = point(x,0);
      return result.some(part => pocketWall(part.module ?? '') && !/glass|mirror/.test(part.module!)
        && ownsPoint(part,placementRecipe(part.module!)!,[probe[0],1.2,probe[1]]));
    }));
    if (!walled) continue;
    carved.add(door.id);
    // The continuous overhead runner connects both chambers across the opening.
    const cuts = [...door.pockets, {min:[door.pockets[0]!.min[0],door.height,-.04] as V3,
      max:[door.pockets[1]!.max[0],door.height+.065,.04] as V3}];
    for (const [cutIndex, cut] of cuts.entries()) {
      const next: Placement[] = [];
      for (const part of result) {
        if (!part.module || !(pocketWall(part.module)
          || /^door-(jamb|header)(?:-(luxury|capsule|damaged|industrial))?$/.test(part.module))) { next.push(part); continue; }
        const model = placementRecipe(part.module);
        if (!model) throw new Error(`unknown pocket wall module ${part.module}`);
        const local = cutterInPart(cut,root,part);
        const whole = {min:model.origin.map(v=>-v) as V3,max:model.size.map((v,i)=>v-model.origin[i]!) as V3};
        const fragments = subtract(whole,local);
        if (fragments.length===1 && fragments[0]===whole) { next.push(part); continue; }
        for (const [index,box] of fragments.entries()) next.push(fragment(part,model,box,`${part.id}/pocket-${door.id}-${cutIndex}-${index}`));
        // A framed capsule wall has a thin decorative infill at its centre plane.
        // Move that infill onto a real cassette skin, within the existing 95mm
        // frame depth, instead of deleting it and exposing the retracting leaf.
        if (part.module.startsWith('wall-panel-field-') && !/glass|mirror/.test(part.module)
          && model.size[2] * part.scale[2] < .041) {
          const skin = {min:whole.min.map((v,i)=>Math.max(v,local.min[i]!)) as V3,
            max:whole.max.map((v,i)=>Math.min(v,local.max[i]!)) as V3};
          skin.min[2] = .045 / part.scale[2];
          skin.max[2] = skin.min[2] + model.size[2];
          next.push(fragment(part,model,skin,`${part.id}/pocket-${door.id}-${cutIndex}-skin`));
        }
      }
      result = next;
    }
  }
  placements.splice(0,placements.length,...result);
  return carved;
}

function ownsPoint(part: Placement, model: ModuleRecipe, p: V3): boolean {
  if (!model) return false;
  const c=Math.cos(part.rotationY),s=Math.sin(part.rotationY),dx=p[0]-part.position[0],dz=p[2]-part.position[2];
  const local=[(dx*c-dz*s)/part.scale[0],(p[1]-part.position[1])/part.scale[1],(dx*s+dz*c)/part.scale[2]];
  return local.every((value,i)=>value>=-model.origin[i]!-1e-5&&value<=model.size[i]!-model.origin[i]!+1e-5);
}
function cutterInPart(box: PocketBox, root: PocketEntrance['leaves'][number], part: Placement): PocketBox {
  const rc=Math.cos(root.rotationY),rs=Math.sin(root.rotationY),pc=Math.cos(part.rotationY),ps=Math.sin(part.rotationY);
  const points: V3[]=[];
  for(const x of [box.min[0],box.max[0]])for(const y of [box.min[1],box.max[1]])for(const z of [box.min[2],box.max[2]]){
    const dx=root.position[0]+x*rc+z*rs-part.position[0],dz=root.position[2]-x*rs+z*rc-part.position[2];
    points.push([(dx*pc-dz*ps)/part.scale[0],(root.position[1]+y-part.position[1])/part.scale[1],(dx*ps+dz*pc)/part.scale[2]]);
  }
  return {min:[0,1,2].map(i=>Math.min(...points.map(p=>p[i]!))) as V3,max:[0,1,2].map(i=>Math.max(...points.map(p=>p[i]!))) as V3};
}
function subtract(box: PocketBox, cut: PocketBox): PocketBox[] {
  const lo=box.min.map((v,i)=>Math.max(v,cut.min[i]!)) as V3,hi=box.max.map((v,i)=>Math.min(v,cut.max[i]!)) as V3;
  if(lo.some((v,i)=>hi[i]!-v<=1e-7))return [box];
  const out: PocketBox[]=[],middle={min:[...box.min] as V3,max:[...box.max] as V3};
  for(let axis=0;axis<3;axis++){
    if(lo[axis]!-middle.min[axis]!>1e-7){const piece={min:[...middle.min] as V3,max:[...middle.max] as V3};piece.max[axis]=lo[axis]!;out.push(piece);}
    if(middle.max[axis]!-hi[axis]!>1e-7){const piece={min:[...middle.min] as V3,max:[...middle.max] as V3};piece.min[axis]=hi[axis]!;out.push(piece);}
    middle.min[axis]=lo[axis]!;middle.max[axis]=hi[axis]!;
  }
  return out;
}
function fragment(part: Placement, model: ModuleRecipe, box: PocketBox, id: string): Placement {
  const ratio=box.max.map((v,i)=>(v-box.min[i]!)/model.size[i]!) as V3;
  const offset=box.min.map((v,i)=>(v+model.origin[i]!*ratio[i]!)*part.scale[i]!) as V3;
  const c=Math.cos(part.rotationY),s=Math.sin(part.rotationY),scale=part.scale.map((v,i)=>v*ratio[i]!) as V3;
  return {...part,id,scale,position:[part.position[0]+offset[0]*c+offset[2]*s,part.position[1]+offset[1],part.position[2]-offset[0]*s+offset[2]*c],
    uvRepeat:[scale[0],scale[1]]};
}
