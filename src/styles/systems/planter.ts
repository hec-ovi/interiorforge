import type { FloorInterior, Furniture, LightFixture } from '../../core/types.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { itemFrame, lensRecord, moduleSize, round, type LocalFrame } from './built-ins.js';
import type { PlanterSpec } from './types.js';

/** Built-in planting: a trough under a window (E1), and a planted glass enclosure (the E1
 *  bamboo box to the ceiling with its flush LED frame, the B3 bamboo planter).
 *  Troughs: two end caps at scale 1, a constant-section body and soil stretched along x,
 *  planted 1 m bays at scale 1 (tufts baked in, never one placement per plant).
 *  Module conventions: back at local z = 0 facing +z, centred in x, standing on y = 0; the
 *  end cap is symmetric in x (it closes either end); soil carries its own height. */

/** Planted bays that fit `inner` metres: whole 1 m bays centred, or a single bay when the
 *  trough is at least 0.6 m long. */
export function plantedBays(inner: number, pitch = 1): number[] {
  const n = inner >= pitch - 1e-9 ? Math.floor(inner / pitch + 1e-9) : inner >= .6 ? 1 : 0;
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pitch);
}

/** A trough along local x of `frame`, `length` long, its back at z = `back`. */
export function placeTrough(builder: PlacementBuilder, room: string, frame: LocalFrame, length: number, back: number,
  spec: PlanterSpec): void {
  const cap = moduleSize(spec.end)[0], inner = length - 2 * cap;
  if (inner <= .01) {
    frame.place(builder, spec.body, room, 0, 0, back, [length / moduleSize(spec.body)[0], 1, 1]);
    return;
  }
  for (const x of [-length / 2 + cap / 2, length / 2 - cap / 2]) frame.place(builder, spec.end, room, x, 0, back);
  frame.place(builder, spec.body, room, 0, 0, back, [inner / moduleSize(spec.body)[0], 1, 1]);
  frame.place(builder, spec.soil, room, 0, 0, back, [inner / moduleSize(spec.soil)[0], 1, 1]);
  for (const x of plantedBays(inner)) frame.place(builder, spec.bay, room, x, 0, back);
}

/** A planter trough over the item's reservation: its back on the record's back edge. */
export function placePlanter(builder: PlacementBuilder, _floor: FloorInterior, item: Furniture, spec: PlanterSpec,
  _ceilingY: number): LightFixture[] {
  placeTrough(builder, item.room, itemFrame(item), item.size[0], -item.size[1] / 2, spec);
  return [];
}

/** A planted glass enclosure: a planter base over the whole footprint, planted rows, glass
 *  panes on the four sides with corner posts, and optionally a flush LED frame at the top. */
export interface GlassPlanterSpec {
  /** base box, one cell square in plan, stretched x and z; its authored height is the base */
  base: string;
  /** soil over the base, one cell square, stretched x and z */
  soil: string;
  /** planted 1 m bay standing on the base top (culms or tufts baked) */
  bay: string;
  /** glass pane one cell wide and tall, centred on z = 0, stretched x and y */
  pane: string;
  /** corner post one cell tall, stretched y */
  post: string;
  /** glass top: to the ceiling, or this height above the floor */
  glass: 'ceiling' | number;
  /** flush lens one cell long stretched x (`ceiling-cove-<sid>-*`), one record per side */
  frame?: { lens: string; lumensPerMetre: number; kelvin: number; color?: [number, number, number] };
  /** plant rows across the depth */
  rowPitch: number;
}

export function placeGlassPlanter(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, spec: GlassPlanterSpec,
  ceilingY: number): LightFixture[] {
  const frame = itemFrame(item), room = item.room, [w, d] = item.size, floorY = item.elevation ?? 0;
  const cell = moduleSize(spec.base), baseH = cell[1];
  frame.place(builder, spec.base, room, 0, 0, 0, [w / cell[0], 1, d / cell[2]]);
  const soil = moduleSize(spec.soil);
  frame.place(builder, spec.soil, room, 0, 0, 0, [(w - .04) / soil[0], 1, (d - .04) / soil[2]]);
  const rows = Math.max(1, Math.round((d - .1) / spec.rowPitch));
  const top = spec.glass === 'ceiling' ? ceilingY - floorY - .005 : spec.glass;
  const bay = moduleSize(spec.bay), room3 = top - baseH - .05;
  const stretch = Math.min(1.3, Math.max(.4, room3 / bay[1]));
  for (let r = 0; r < rows; r++) {
    const z = -d / 2 + (r + .5) * d / rows;
    for (const x of plantedBays(w - .1)) frame.place(builder, spec.bay, room, x, baseH, z, [1, stretch, 1]);
  }
  // Glass on the base top, a pane per side, posts at the corners.
  const pane = moduleSize(spec.pane), post = moduleSize(spec.post), h = top - baseH, inset = post[0] / 2;
  const sides: { frame: LocalFrame; length: number; offset: number }[] = [
    { frame, length: w, offset: d / 2 - inset }, { frame: frame.reversed, length: w, offset: d / 2 - inset },
    { frame: frame.turned(Math.PI / 2), length: d, offset: w / 2 - inset },
    { frame: frame.turned(-Math.PI / 2), length: d, offset: w / 2 - inset },
  ];
  for (const side of sides)
    side.frame.place(builder, spec.pane, room, 0, baseH, side.offset, [(side.length - 2 * post[0]) / pane[0], h / pane[1], 1]);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const)
    frame.place(builder, spec.post, room, x * (w / 2 - inset), baseH, z * (d / 2 - inset), [1, h / post[1], 1]);
  const lights: LightFixture[] = [];
  if (spec.frame && spec.glass === 'ceiling') {
    const lens = moduleSize(spec.frame.lens), y = top;
    for (const side of sides) {
      // The frame runs over the glass, inside the footprint.
      const offset = side.offset + inset - lens[2] / 2, length = side.length - lens[2];
      const placed = side.frame.place(builder, spec.frame.lens, room, 0, y, offset, [length / lens[0], 1, 1]);
      lights.push(lensRecord(side.frame, room, placed.id, 0, y, offset, round(length), floor.elevation,
        { kind: 'strip', lumensPerMetre: spec.frame.lumensPerMetre, kelvin: spec.frame.kelvin, color: spec.frame.color, facing: 'down', beamDeg: 140, range: 2.2 }));
    }
  }
  return lights;
}
