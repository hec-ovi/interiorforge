import type { Placer } from "./placer.js";

/** The small things that make a room look used: bottles and glasses on a counter, a cup and
 *  papers on a desk, stock in a back room. Seeded from each piece's own id, so a row of
 *  desks is never identical and the same building always draws the same clutter. */

/** Bottles and glasses along a bar or service top. */
export function topware(p: Placer, y: number, x0: number, x1: number, z: number, salt: number): void {
  const slots = Math.max(1, Math.min(5, Math.floor((x1 - x0) / 0.5)));
  for (let i = 0; i < slots; i++) {
    const draw = p.variant(salt * 71 + i);
    if (draw < 0.25) continue;
    const cx = x0 + ((x1 - x0) * (i + 0.5)) / slots;
    if (draw > 0.62) {
      // bottle: body and neck
      p.box("glass", cx - 0.045, cx + 0.045, z - 0.045, z + 0.045, y, y + 0.2);
      p.box("glass", cx - 0.018, cx + 0.018, z - 0.018, z + 0.018, y + 0.2, y + 0.3);
    } else {
      p.box("glass", cx - 0.035, cx + 0.035, z - 0.035, z + 0.035, y, y + 0.11);
    }
  }
}

/** A cup and a stack of papers on a work surface. */
export function deskware(p: Placer, y: number, salt: number): void {
  const draw = p.variant(salt);
  const side = draw > 0.5 ? 1 : -1;
  const cx = side * (p.hw - 0.22);
  p.box("tile", cx - 0.04, cx + 0.04, -0.04, 0.04, y, y + 0.09);
  if (draw > 0.3) {
    const px = -side * (p.hw - 0.34);
    p.box("plaster", px - 0.14, px + 0.14, -0.11, 0.11, y, y + 0.02 + draw * 0.03);
  }
  if (draw > 0.66) p.box("metal", -0.1, 0.16, -p.hd + 0.14, -p.hd + 0.32, y, y + 0.3);
}

/** A stacked crate or two beside a piece; back rooms are never empty. */
export function crate(p: Placer): void {
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, 0, p.height);
  p.box("metal", -p.hw, p.hw, -p.hd, p.hd, p.height - 0.04, p.height);
  const draw = p.variant(5);
  if (draw > 0.55) {
    const w = p.hw * (0.6 + draw * 0.25);
    p.box("wood", -w, w, -w, w, p.height, p.height + 0.34);
    p.box("metal", -w, w, -w, w, p.height + 0.3, p.height + 0.34);
  }
}
