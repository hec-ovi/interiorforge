import type { PlacementBuilder } from '../../placements/builder.js';
import type { Placement } from '../../placements/types.js';
import { LocalFrame, moduleSize, type V3 } from './built-ins.js';
import type { RunSpec } from './types.js';

/** A straight built-in run (shelving, wardrobe fronts, niches, stall rows, bulkheads):
 *  fixed start and end pieces, fixed-pitch repeated bays, one filler for what the bays
 *  leave, and a continuous middle piece behind them all. Only the middle and the filler
 *  stretch, and only along the run (plus y when the run is told to reach a height), so a
 *  bay, a handle or a grille keeps its authored size at any length. */

export interface RunOptions {
  /** base height of every piece above the origin */
  y?: number;
  /** offset of every piece along local z (front) */
  z?: number;
  /** stretch the middle and the filler to this height (a bulkhead, a panel to the ceiling) */
  height?: number;
  /** where the bays start: 'start' packs them from local -x (the filler ends the run),
   *  'centre' leaves equal fillers at both ends */
  align?: 'start' | 'centre';
}

/** Where each piece of a run of `length` goes, along local x from the run centre. */
export interface RunLayout {
  start?: [number, number];
  end?: [number, number];
  /** the stretch behind the bays */
  mid: [number, number];
  bays: [number, number][];
  fillers: [number, number][];
}

export function runLayout(spec: RunSpec, length: number, align: RunOptions['align'] = 'start'): RunLayout {
  const half = length / 2;
  let startW = spec.start ? moduleSize(spec.start)[0] : 0, endW = spec.end ? moduleSize(spec.end)[0] : 0;
  // Too short for its ends: the run is its middle alone.
  if (startW + endW > length - 1e-6) startW = endW = 0;
  const a = -half + startW, b = half - endW, inner = b - a;
  const layout: RunLayout = {
    ...(startW ? { start: [-half, a] as [number, number] } : {}),
    ...(endW ? { end: [b, half] as [number, number] } : {}),
    mid: [a, b], bays: [], fillers: [],
  };
  if (!spec.repeat) return layout;
  const pitch = spec.repeat.pitch, n = Math.floor(inner / pitch + 1e-9), rest = inner - n * pitch;
  const first = align === 'centre' ? a + rest / 2 : a;
  for (let i = 0; i < n; i++) layout.bays.push([first + i * pitch, first + (i + 1) * pitch]);
  if (rest > .005) {
    if (align === 'centre') layout.fillers.push([a, first], [first + n * pitch, b]);
    else layout.fillers.push([first + n * pitch, b]);
  }
  return layout;
}

/** Places a run of `length` centred at `origin` along local x (rotation about +Y as a
 *  furniture record turns). Returns its placements, in order. */
export function placeRun(builder: PlacementBuilder, room: string, origin: [number, number, number], rotation: number,
  length: number, spec: RunSpec, options: RunOptions = {}): Placement[] {
  const frame = new LocalFrame(origin, rotation), y = options.y ?? 0, z = options.z ?? 0, out: Placement[] = [];
  const layout = runLayout(spec, length, options.align);
  const stretchY = (module: string) => options.height === undefined ? 1 : options.height / moduleSize(module)[1];
  const piece = (module: string, [x0, x1]: [number, number], stretch: boolean) => {
    const width = moduleSize(module)[0];
    if (x1 - x0 < 1e-6) return;
    const scale: V3 = stretch ? [(x1 - x0) / width, stretchY(module), 1] : [1, 1, 1];
    out.push(frame.place(builder, module, room, (x0 + x1) / 2, y, z, scale));
  };
  piece(spec.mid, layout.mid, true);
  if (layout.start) piece(spec.start!, layout.start, false);
  for (const bay of layout.bays) piece(spec.repeat!.module, bay, false);
  for (const fill of layout.fillers) piece(spec.filler, fill, true);
  if (layout.end) piece(spec.end!, layout.end, false);
  return out;
}
