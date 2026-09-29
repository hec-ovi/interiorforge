import type { FloorInterior, Furniture, LightFixture } from '../../core/types.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { itemFrame, lensRecord, moduleSize } from './built-ins.js';
import { placeKitchenWall } from './kitchen-wall.js';
import { placePlanter } from './planter.js';
import { placeRun } from './run.js';
import type { AssemblySpec, RunSpec } from './types.js';

/** One built-in furniture record as its assembly, in the item's local frame (x across, +z
 *  front, origin at the record centre). Returns the light records of its lenses, each
 *  carrying `furniture: item.id`. The record is a reservation: the assembly fills its width
 *  with fixed parts and stretches only fillers, so nothing is scaled per axis. */
export function placeAssembly(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, spec: AssemblySpec, floorCeilingY: number): LightFixture[] {
  // A room whose finished ceiling hangs lower (a template's ceilingDrop) bounds its built-ins.
  const ceilingY = floorCeilingY - (floor.rooms.find(room => room.id === item.room)?.ceilingDrop ?? 0);
  switch (spec.type) {
    case 'kitchen': return placeKitchenWall(builder, floor, item, spec.spec, ceilingY);
    case 'planter': return placePlanter(builder, floor, item, spec.spec, ceilingY);
    case 'custom': return spec.place(builder, floor, item, ceilingY);
    case 'run': {
      // A run stands with its back on the record's back edge.
      const frame = itemFrame(item);
      placeRun(builder, item.room, frame.origin, frame.rotation, item.size[0], spec.spec, { z: -item.size[1] / 2 });
      return [];
    }
  }
}

/** A run to the ceiling: fixed bays (wardrobe fronts, library bays) with a bulkhead
 *  stretched from their top to the ceiling, and an optional lit line along the run (the E1
 *  wardrobe's red floor line) recorded for the item. */
export interface TallRunSpec {
  run: RunSpec;
  /** one cell long and tall, stretched along the run and up to the ceiling */
  bulkhead?: string;
  line?: { module: string; y: number; z: number; lumensPerMetre: number; kelvin: number; color?: [number, number, number]; facing: 'up' | 'down' };
}

export function placeTallRun(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, spec: TallRunSpec,
  ceilingY: number): LightFixture[] {
  const frame = itemFrame(item), back = -item.size[1] / 2, w = item.size[0], room = item.room;
  const ceiling = ceilingY - (item.elevation ?? 0);
  placeRun(builder, room, frame.origin, frame.rotation, w, spec.run, { z: back });
  if (spec.bulkhead && ceiling - spec.run.height > .01) {
    const bulkhead: RunSpec = { mid: spec.bulkhead, filler: spec.bulkhead, height: ceiling - spec.run.height, depth: spec.run.depth };
    placeRun(builder, room, frame.origin, frame.rotation, w, bulkhead, { z: back, y: spec.run.height, height: ceiling - spec.run.height });
  }
  if (!spec.line) return [];
  const line = spec.line, length = w - .04;
  frame.place(builder, line.module, room, 0, line.y, back + line.z, [length / moduleSize(line.module)[0], 1, 1]);
  return [lensRecord(frame, room, `${item.id}-lens-0`, 0, line.y, back + line.z, length, floor.elevation,
    { lumensPerMetre: line.lumensPerMetre, kelvin: line.kelvin, color: line.color, facing: line.facing, beamDeg: 140, range: 1.5 },
    { furniture: item.id })];
}

/** A kitchen island or bar block: a top slab over the whole record, a recessed base (the E1
 *  caustic glass block, a walnut pedestal) and a plinth, with a glow record per long side. */
export interface IslandSpec {
  /** one cell square in plan, stretched x and z; its height is the slab */
  top: string;
  /** one cell square in plan, stretched x and z; its height is the base */
  base: string;
  plinth?: string;
  /** how far the top overhangs the base on every side */
  overhang: number;
  glow?: { lumensPerMetre: number; kelvin: number; color?: [number, number, number] };
}

export function placeIsland(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, spec: IslandSpec,
  _ceilingY: number): LightFixture[] {
  const frame = itemFrame(item), room = item.room, [w, d] = item.size;
  const top = moduleSize(spec.top), base = moduleSize(spec.base);
  const bw = Math.max(.2, w - 2 * spec.overhang), bd = Math.max(.2, d - 2 * spec.overhang);
  if (spec.plinth) {
    const plinth = moduleSize(spec.plinth);
    frame.place(builder, spec.plinth, room, 0, 0, 0, [(bw - .04) / plinth[0], 1, (bd - .04) / plinth[2]]);
  }
  frame.place(builder, spec.base, room, 0, 0, 0, [bw / base[0], 1, bd / base[2]]);
  frame.place(builder, spec.top, room, 0, base[1], 0, [w / top[0], 1, d / top[2]]);
  if (!spec.glow) return [];
  return [1, -1].map((side, i) => lensRecord(frame, room, `${item.id}-lens-${i}`, 0, base[1] / 2, side * bd / 2, bw, floor.elevation,
    { lumensPerMetre: spec.glow!.lumensPerMetre, kelvin: spec.glow!.kelvin, color: spec.glow!.color, facing: 'down', beamDeg: 160, range: 1.2 },
    { furniture: item.id }, [0, -1, 0]));
}
