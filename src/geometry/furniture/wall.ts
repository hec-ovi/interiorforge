import type { Placer } from "./placer.js";

/** Wall display: a dark bezel around a lit screen face, on a small mount. */
export function displayScreen(p: Placer): void {
  p.box("metal", -p.hw + 0.12, p.hw - 0.12, -p.hd - 0.03, -p.hd, p.height * 0.3, p.height * 0.7);
  p.box("metal", -p.hw, p.hw, -p.hd, p.hd, 0, p.height);
  p.box("screen", -p.hw + 0.05, p.hw - 0.05, p.hd, p.hd + 0.012, 0.05, p.height - 0.05);
}

/** Framed piece on the wall: frame, mount and the glazed face. */
export function wallArt(p: Placer): void {
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, 0, p.height);
  p.box("plaster", -p.hw + 0.04, p.hw - 0.04, p.hd, p.hd + 0.004, 0.04, p.height - 0.04);
  p.box("glass", -p.hw + 0.06, p.hw - 0.06, p.hd + 0.004, p.hd + 0.01, 0.06, p.height - 0.06);
}
