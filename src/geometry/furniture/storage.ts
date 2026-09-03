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

/** Industrial wardrobe: closed steel carcass, recessed plinth, two fitted doors, vents and
 *  raised handles. Every part stays inside the declared collision bounds. */
export function wardrobe(p: Placer): void {
  const skin = Math.min(0.055, p.hw * 0.12, p.hd * 0.15);
  const front0 = p.hd - skin;
  const plinth = Math.min(0.11, p.height * 0.08);
  const top = Math.min(0.08, p.height * 0.06);

  // Recessed support and a complete carcass, including the back that closes the cabinet.
  p.box("metal", -p.hw + skin, p.hw - skin, -p.hd + skin, p.hd - skin, 0, plinth);
  p.box("metal", -p.hw, p.hw, -p.hd, -p.hd + skin, plinth, p.height);
  p.box("metal", -p.hw, -p.hw + skin, -p.hd, front0, plinth, p.height);
  p.box("metal", p.hw - skin, p.hw, -p.hd, front0, plinth, p.height);
  p.box("metal", -p.hw, p.hw, -p.hd, front0, p.height - top, p.height);
  p.box("metal", -p.hw, p.hw, -p.hd, front0, plinth, plinth + skin);

  // Paired painted-steel leaves with a real centre reveal, not one textured slab.
  const edge = skin * 0.65;
  const seam = Math.min(0.025, p.hw * 0.04);
  const doorY0 = plinth + skin;
  const doorY1 = p.height - top - skin * 0.35;
  p.box("door", -p.hw + edge, -seam, front0, p.hd - skin * 0.2, doorY0, doorY1);
  p.box("door", seam, p.hw - edge, front0, p.hd - skin * 0.2, doorY0, doorY1);

  // Vent slots read as separate fitted components and keep their scale on wide cabinets.
  const ventY = doorY1 - Math.min(0.32, p.height * 0.18);
  for (let i = 0; i < 3; i++) {
    const y = ventY + i * 0.055;
    for (const side of [-1, 1] as const) {
      const x0 = side < 0 ? -p.hw + edge + 0.09 : seam + 0.09;
      const x1 = side < 0 ? -seam - 0.09 : p.hw - edge - 0.09;
      p.box("metal", x0, x1, p.hd - skin * 0.2, p.hd - skin * 0.05, y, y + 0.018);
    }
  }
  const handleY0 = doorY0 + (doorY1 - doorY0) * 0.42;
  const handleY1 = handleY0 + Math.min(0.25, p.height * 0.14);
  p.box("metal", -seam - 0.075, -seam - 0.035, p.hd - skin * 0.2, p.hd, handleY0, handleY1);
  p.box("metal", seam + 0.035, seam + 0.075, p.hd - skin * 0.2, p.hd, handleY0, handleY1);
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
