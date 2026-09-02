import type { Placer } from "./placer.js";

/** Wall display: a dark bezel around a lit screen face, on a small mount. */
export function displayScreen(p: Placer): void {
  p.box("metal", -p.hw + 0.12, p.hw - 0.12, -p.hd - 0.03, -p.hd, p.height * 0.3, p.height * 0.7);
  p.box("metal", -p.hw, p.hw, -p.hd, p.hd, 0, p.height);
  p.box("screen", -p.hw + 0.05, p.hw - 0.05, p.hd, p.hd + 0.012, 0.05, p.height - 0.05);
}

/** Framed piece on the wall: a wood frame with a real border, and a picture (an image ad of the theme) as its face. */
export function wallArt(p: Placer): void {
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, 0, p.height);
  p.box("screen", -p.hw + 0.06, p.hw - 0.06, p.hd, p.hd + 0.006, 0.06, p.height - 0.06);
}
