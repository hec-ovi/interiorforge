import { cabinetBays } from "./cabinet-bays.js";
import type { Placer } from "./placer.js";

/** Closed end bays, fitted repeated doors, separate upper cabinets and lower drawers. */
export function wardrobe(p: Placer): void {
  const skin = Math.min(.05, p.hd * .15), plinth = Math.min(.1, p.height * .08);
  const lower = Math.min(.5, p.height * .25), upper = p.height - lower;
  p.box("metal", -p.hw + skin, p.hw - skin, -p.hd + skin, p.hd - skin, 0, plinth);
  p.box("metal", -p.hw, p.hw, -p.hd, -p.hd + skin, plinth, p.height);
  for (const [left, right] of [[-p.hw, -p.hw + skin], [p.hw - skin, p.hw]])
    p.box("metal", left!, right!, -p.hd, p.hd - .04, plinth, p.height);
  for (const y of [plinth, lower, upper, p.height - skin])
    p.box("metal", -p.hw, p.hw, -p.hd, p.hd - .04, y, Math.min(p.height, y + skin));
  for (const [left, right] of cabinetBays(p.hw * 2)) {
    for (const [bottom, top] of [[plinth + .008, lower - .008], [lower + .008, upper - .008], [upper + .008, p.height - .008]]) {
      p.box("door", left + .008, right - .008, p.hd - .04, p.hd - .012, bottom!, top!);
      if (top! - bottom! > .08) {
        const x = right - Math.min(.1, (right - left) / 3), y = (bottom! + top!) / 2;
        p.box("metal", x - .014, x + .014, p.hd - .015, p.hd, y - .04, y + .04);
      }
    }
    for (let i = 0; i < 3; i++) {
      const y = upper - .2 + i * .04;
      if (y > lower + .1) p.box("metal", left + .06, right - .06, p.hd - .012, p.hd - .008, y, y + .012);
    }
  }
}
