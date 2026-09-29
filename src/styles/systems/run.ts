import type { Placement } from '../../placements/types.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import type { RunSpec } from './types.js';

/** A straight built-in run of `length` centred at `origin` along local x (AS: fixed ends,
 *  stretched middle, fixed-pitch repeats, filler for the leftover).
 *  Stub until package AS lands: nothing. */
export function placeRun(_builder: PlacementBuilder, _room: string, _origin: [number, number, number], _rotation: number, _length: number,
    _spec: RunSpec): Placement[] {
    return [];
}
