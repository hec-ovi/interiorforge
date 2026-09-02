import type { Placer } from "./placer.js";

/** Wall display: a dark bezel around a lit screen face, on a small mount. */
export function displayScreen(p: Placer): void {
  p.box("metal", -p.hw + 0.12, p.hw - 0.12, -p.hd - 0.03, -p.hd, p.height * 0.3, p.height * 0.7);
  p.box("metal", -p.hw, p.hw, -p.hd, p.hd, 0, p.height);
  p.box("screen", -p.hw + 0.05, p.hw - 0.05, p.hd, p.hd + 0.012, 0.05, p.height - 0.05);
}

/** Framed piece on the wall: a backing board, four wood rails standing proud as the border, and a picture (an image ad of the theme) inside them. */
export function wallArt(p: Placer): void {
  const rail = 0.06;
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, 0, p.height);
  p.box("wood", -p.hw, -p.hw + rail, p.hd, p.hd + 0.02, 0, p.height);
  p.box("wood", p.hw - rail, p.hw, p.hd, p.hd + 0.02, 0, p.height);
  p.box("wood", -p.hw + rail, p.hw - rail, p.hd, p.hd + 0.02, 0, rail);
  p.box("wood", -p.hw + rail, p.hw - rail, p.hd, p.hd + 0.02, p.height - rail, p.height);
  p.box("screen", -p.hw + rail, p.hw - rail, p.hd, p.hd + 0.006, rail, p.height - rail);
}
