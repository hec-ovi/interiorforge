import { topware } from "./clutter.js";
import type { Placer } from "./placer.js";
import { cabinetBays, cabinetFront } from "./cabinet-bays.js";

const KICK = 0.09; // recess under the front panel, so a counter does not read as a slab

/** Service counter: panelled front facing the customer, worktop with an overhang, and a
 *  kick recess at the floor. */
function serviceCounter(p: Placer, top: number, panel: "accent" | "wood"): void {
  const front = p.hd;
  cabinetFront(p, KICK, top - .05, panel);
  p.box("metal", -p.hw + 0.06, p.hw - 0.06, -p.hd + 0.06, front - 0.08, 0, KICK);
  p.box("metal", -p.hw, p.hw, -p.hd, front - 0.05, KICK, top - 0.05);
  p.box("wood", -p.hw, p.hw, -p.hd, front, top - 0.05, top);
}

export function counter(p: Placer): void {
  serviceCounter(p, p.height, "accent");
  topware(p, p.height, -p.hw + 0.15, p.hw - 0.15, -p.hd + 0.22, 2);
}

/** Bar counter: taller, with a footrail on the customer side and a raised drink ledge. */
export function barCounter(p: Placer): void {
  const body = p.height - 0.06;
  serviceCounter(p, body, "accent");
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd + 0.03, body, p.height);
  p.box("metal", -p.hw + 0.1, p.hw - 0.1, p.hd - 0.02, p.hd + 0.03, 0.22, 0.26);
  topware(p, p.height, -p.hw + 0.2, p.hw - 0.2, -p.hd + 0.2, 4);
}

/** Reception desk: a low work top behind a raised transaction counter. */
export function receptionDesk(p: Placer): void {
  const work = 0.75;
  cabinetFront(p, KICK, p.height - .05, "accent");
  p.box("metal", -p.hw, p.hw, -p.hd, p.hd - 0.06, KICK, work - 0.04);
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd - 0.06, work - 0.04, work);
  p.box("wood", -p.hw, p.hw, p.hd - 0.24, p.hd + 0.02, p.height - 0.05, p.height);
  p.box("metal", -p.hw + 0.06, p.hw - 0.06, -p.hd + 0.06, p.hd - 0.1, 0, KICK);
}

/** Kitchen run: plinth, cabinet doors, worktop and a splashback. */
export function kitchenBlock(p: Placer): void {
  const top = p.height;
  p.box("metal", -p.hw + 0.05, p.hw - 0.05, -p.hd + 0.05, p.hd - 0.06, 0, KICK);
  p.box("metal", -p.hw, p.hw, -p.hd, p.hd - 0.04, KICK, top - 0.05);
  for (const [x0, x1] of cabinetBays(p.hw * 2)) {
    p.box("wood", x0 + 0.01, x1 - 0.01, p.hd - 0.04, p.hd, KICK + 0.01, top - 0.06);
  }
  p.box("tile", -p.hw, p.hw, -p.hd, p.hd, top - 0.05, top);
  p.box("tile", -p.hw, p.hw, -p.hd, -p.hd + 0.03, top, top + 0.35);
  topware(p, top, -p.hw + 0.2, p.hw - 0.2, -p.hd + 0.22, 8);
}
