import type { PlacementBuilder } from '../../placements/builder.js';
import { uvToWorld, type Frame, type UvRect } from '../../layout/uv.js';

/** Broad demountable 1.2 x 2.4 m service panels. Six-millimetre physical joints stay
 * constant at every room size; the uninterrupted backing closes their cavities. */
export function placeCorporateCeiling(builder: PlacementBuilder, room: string, rect: UvRect, y: number,
  frame: Frame, field = 'ceiling-field-corporate-mineral'): void {
  const rotation = -frame.angleDeg * Math.PI / 180;
  const put = (module: string, r: UvRect) => {
    const [x, z] = uvToWorld([r.u + r.lu / 2, r.v + r.lv / 2], frame);
    builder.module(module, room, [x, y, z], [r.lu / .5, 1, r.lv / .5], rotation);
  };
  put('ceiling-corporate-backing', rect);
  const columns = Math.max(1, Math.ceil(rect.lu / 1.2)), rows = Math.max(1, Math.ceil(rect.lv / 2.4));
  const w = rect.lu / columns, d = rect.lv / rows, gap = Math.min(.006, w / 8, d / 8);
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
    put(field, { u: rect.u + i * w + gap / 2, v: rect.v + j * d + gap / 2, lu: w - gap, lv: d - gap });
  }
  if (rect.lu >= 3 && rect.lv >= 3) {
    const [x, z] = uvToWorld([rect.u + .7, rect.v + .7], frame);
    builder.module('ceiling-luxury-vent', room, [x, y, z], [1, 1, 1], rotation);
  }
}
