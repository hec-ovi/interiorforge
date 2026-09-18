import { CORRIDOR } from "./constants.js";
import type { UvRect } from "./uv.js";

/** Full-width turning bands on each side of an inline shaft, south then north. */
export function inlineStairBypasses(stair: UvRect | undefined, width = CORRIDOR.width): UvRect[] {
  if (!stair) return [];
  const u = stair.u - width;
  const lu = stair.lu + 2 * width;
  return [
    { u, v: stair.v - width, lu, lv: width },
    { u, v: stair.v + stair.lv, lu, lv: width },
  ];
}
