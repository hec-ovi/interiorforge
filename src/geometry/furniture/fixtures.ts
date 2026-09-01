import type { Placer } from "./placer.js";

export function toilet(p: Placer): void {
  p.box("tile", -p.hw + 0.02, p.hw - 0.02, -p.hd, -p.hd + 0.18, 0, p.height);
  p.box("tile", -p.hw + 0.04, p.hw - 0.04, -p.hd + 0.18, p.hd - 0.04, 0.1, 0.4);
  p.box("tile", -p.hw, p.hw, -p.hd + 0.16, p.hd, 0.4, 0.44);
}

export function sink(p: Placer): void {
  p.box("tile", -p.hw, p.hw, -p.hd, p.hd, p.height - 0.14, p.height);
  p.box("tile", -0.09, 0.09, -p.hd + 0.06, p.hd - 0.1, 0, p.height - 0.14);
  p.box("metal", -0.025, 0.025, -p.hd + 0.04, -p.hd + 0.09, p.height, p.height + 0.16);
}

export function shower(p: Placer): void {
  p.box("tile", -p.hw, p.hw, -p.hd, p.hd, 0, 0.08);
  p.box("glass", p.hw - 0.03, p.hw, -p.hd, p.hd, 0.08, p.height);
  p.box("glass", -p.hw, p.hw - 0.03, p.hd - 0.03, p.hd, 0.08, p.height);
  p.box("metal", -0.04, 0.04, -p.hd + 0.04, -p.hd + 0.2, p.height - 0.1, p.height - 0.04);
}

/** Weights machine: base frame, uprights, a seat and the stack. */
export function gymMachine(p: Placer): void {
  p.box("metal", -p.hw, p.hw, -p.hd, p.hd, 0, 0.1);
  for (const sx of [-1, 1]) {
    const x = sx * (p.hw - 0.08);
    p.box("metal", x - 0.05, x + 0.05, -p.hd + 0.06, -p.hd + 0.22, 0.1, p.height);
  }
  p.box("metal", -p.hw + 0.06, p.hw - 0.06, -p.hd + 0.06, -p.hd + 0.22, 0.2, p.height - 0.12);
  p.box("fabric", -0.22, 0.22, 0.05, p.hd - 0.25, 0.45, 0.52);
  p.box("fabric", -0.22, 0.22, -p.hd + 0.3, -p.hd + 0.38, 0.52, 1.05);
}

export function plant(p: Placer): void {
  p.box("tile", -p.hw + 0.05, p.hw - 0.05, -p.hd + 0.05, p.hd - 0.05, 0, 0.32);
  p.box("wood", -0.03, 0.03, -0.03, 0.03, 0.32, 0.62);
  const spread = p.hw * (0.7 + p.variant(2) * 0.3);
  p.box("fabric", -spread, spread, -spread, spread, 0.55, p.height);
}
