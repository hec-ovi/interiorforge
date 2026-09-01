import type { Placer } from "./placer.js";

/** Boxes and bottles standing on a board, seeded from the piece's own id. */
function goods(p: Placer, y: number, x0: number, x1: number, depth: number, salt: number): void {
  const slots = Math.max(1, Math.min(4, Math.floor((x1 - x0) / 0.32)));
  for (let i = 0; i < slots; i++) {
    const draw = p.variant(salt * 31 + i);
    if (draw < 0.3) continue;
    const w = 0.1 + draw * 0.14;
    const cx = x0 + ((x1 - x0) * (i + 0.5)) / slots;
    p.box(draw > 0.7 ? "metal" : "wood", cx - w / 2, cx + w / 2, -depth / 2, depth / 2, y, y + 0.14 + draw * 0.16);
  }
}

/** Wall shelving: back panel, sides, boards and what stands on them. */
export function shelf(p: Placer): void {
  p.box("metal", -p.hw, p.hw, -p.hd, -p.hd + 0.04, 0, p.height);
  for (const sx of [-1, 1]) {
    const x = sx * p.hw;
    p.box("metal", Math.min(x, x - sx * 0.04), Math.max(x, x - sx * 0.04), -p.hd, p.hd, 0, p.height);
  }
  const boards = Math.max(2, Math.round(p.height / 0.45));
  for (let i = 1; i <= boards; i++) {
    const y = (p.height * i) / (boards + 1);
    p.box("metal", -p.hw + 0.04, p.hw - 0.04, -p.hd + 0.04, p.hd, y, y + 0.03);
    goods(p, y + 0.03, -p.hw + 0.1, p.hw - 0.1, p.height > 1.2 ? 0.3 : 0.24, i);
  }
}

/** Free-standing rack: posts, open boards, goods on show. */
export function displayRack(p: Placer): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (p.hw - 0.04);
      const z = sz * (p.hd - 0.04);
      p.box("metal", x - 0.04, x + 0.04, z - 0.04, z + 0.04, 0, p.height);
    }
  }
  const boards = Math.max(2, Math.round(p.height / 0.5));
  for (let i = 0; i < boards; i++) {
    const y = 0.15 + ((p.height - 0.25) * i) / boards;
    p.box("metal", -p.hw, p.hw, -p.hd, p.hd, y, y + 0.03);
    goods(p, y + 0.03, -p.hw + 0.08, p.hw - 0.08, 0.26, i + 7);
  }
}

/** Wardrobe: carcass on a plinth with two panelled doors. */
export function wardrobe(p: Placer): void {
  p.box("metal", -p.hw + 0.04, p.hw - 0.04, -p.hd + 0.04, p.hd - 0.04, 0, 0.07);
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd - 0.03, 0.07, p.height);
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -p.hw + 0.02 : 0.015;
    const x1 = sx < 0 ? -0.015 : p.hw - 0.02;
    p.box("wood", x0, x1, p.hd - 0.03, p.hd, 0.09, p.height - 0.02);
    p.box("metal", sx < 0 ? -0.09 : 0.05, sx < 0 ? -0.05 : 0.09, p.hd, p.hd + 0.02, p.height * 0.5, p.height * 0.5 + 0.22);
  }
}

/** Fridge: body, door line and a handle. */
export function fridge(p: Placer): void {
  p.box("metal", -p.hw, p.hw, -p.hd, p.hd - 0.03, 0, p.height);
  p.box("metal", -p.hw + 0.02, p.hw - 0.02, p.hd - 0.03, p.hd, 0.04, p.height * 0.62);
  p.box("metal", -p.hw + 0.02, p.hw - 0.02, p.hd - 0.03, p.hd, p.height * 0.64, p.height - 0.04);
  p.box("metal", p.hw - 0.14, p.hw - 0.08, p.hd, p.hd + 0.03, p.height * 0.2, p.height * 0.58);
}

/** Shelf board hung on the wall, with a couple of things on it. */
export function wallShelf(p: Placer): void {
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, p.height - 0.05, p.height);
  for (const sx of [-1, 1]) {
    const x = sx * (p.hw - 0.12);
    p.box("metal", x - 0.02, x + 0.02, -p.hd, -p.hd + 0.14, 0, p.height - 0.05);
  }
  goods(p, p.height, -p.hw + 0.08, p.hw - 0.08, p.hd, 11);
}
