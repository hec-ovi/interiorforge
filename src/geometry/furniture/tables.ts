import { deskware } from "./clutter.js";
import type { Placer } from "./placer.js";

const TOP = 0.06;

/** Table on four legs: a top slab with clear space under it. */
export function diningTable(p: Placer): void {
  const top = p.height;
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, top - TOP, top);
  p.legs("metal", 0.06, 0.08, top - TOP);
  const draw = p.variant(6);
  if (draw > 0.35) {
    p.box("glass", -0.05, 0.05, -0.05, 0.05, top, top + 0.1 + draw * 0.08);
    if (draw > 0.7) p.box("tile", 0.12, 0.26, -0.07, 0.07, top, top + 0.06);
  }
}

export function lowTable(p: Placer): void {
  const top = p.height;
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, top - 0.04, top);
  p.legs("metal", 0.05, 0.06, top - 0.04);
}

/** Long table on two pedestals, so chairs pull in anywhere along it. */
export function meetingTable(p: Placer): void {
  const top = p.height;
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, top - TOP, top);
  for (const sx of [-1, 1]) {
    const x = sx * (p.hw - 0.5);
    p.box("metal", x - 0.06, x + 0.06, -p.hd + 0.15, p.hd - 0.15, 0, top - TOP);
    p.box("metal", x - 0.3, x + 0.3, -p.hd + 0.1, p.hd - 0.1, 0, 0.05);
  }
}

/** Desk with a modesty panel at the back and side panels: a knee space at the front. */
export function desk(p: Placer): void {
  const top = p.height;
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, top - TOP, top);
  p.box("metal", -p.hw + 0.02, -p.hw + 0.07, -p.hd + 0.03, p.hd - 0.03, 0, top - TOP);
  p.box("metal", p.hw - 0.07, p.hw - 0.02, -p.hd + 0.03, p.hd - 0.03, 0, top - TOP);
  p.box("metal", -p.hw + 0.07, p.hw - 0.07, -p.hd + 0.03, -p.hd + 0.07, 0.2, top - TOP);
  // a drawer block on one side, seeded so a row of desks is not identical
  if (p.variant(3) > 0.45) {
    const sx = p.variant(4) > 0.5 ? 1 : -1;
    const x = sx * (p.hw - 0.45);
    p.box("metal", x - 0.2, x + 0.2, -p.hd + 0.08, p.hd - 0.12, 0.05, top - TOP - 0.02);
  }
  deskware(p, top, 9);
}
