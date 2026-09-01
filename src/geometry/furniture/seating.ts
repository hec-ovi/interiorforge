import type { Placer } from "./placer.js";

/** Chair with a real back: seat pad on a frame, backrest with a gap under it, four legs. */
export function chair(p: Placer): void {
  const seat = 0.45;
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, seat, seat + 0.04);
  p.box("fabric", -p.hw + 0.02, p.hw - 0.02, -p.hd + 0.02, p.hd - 0.02, seat + 0.04, seat + 0.09);
  p.box("wood", -p.hw + 0.03, p.hw - 0.03, -p.hd, -p.hd + 0.05, seat + 0.2, p.height);
  for (const sx of [-1, 1]) {
    const x = sx * (p.hw - 0.04);
    p.box("wood", Math.min(x, x - sx * 0.04), Math.max(x, x - sx * 0.04), -p.hd, -p.hd + 0.05, seat, p.height);
  }
  p.legs("metal", 0.04, 0.03, seat);
}

/** Bar stool: seat on a column with a footrest, so it reads at a counter. */
export function stool(p: Placer): void {
  const seat = p.height - 0.05;
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, seat, p.height);
  p.box("metal", -0.04, 0.04, -0.04, 0.04, 0.03, seat);
  p.box("metal", -p.hw + 0.05, p.hw - 0.05, -p.hd + 0.05, p.hd - 0.05, 0, 0.03);
  p.box("metal", -p.hw + 0.06, p.hw - 0.06, -0.02, 0.02, 0.2, 0.24);
  p.box("metal", -0.02, 0.02, -p.hd + 0.06, p.hd - 0.06, 0.2, 0.24);
}

/** Task chair: seat, back, armrests, column and a star base. */
export function officeChair(p: Placer): void {
  const seat = 0.45;
  p.box("fabric", -p.hw, p.hw, -p.hd, p.hd, seat, seat + 0.06);
  p.box("fabric", -p.hw + 0.04, p.hw - 0.04, -p.hd, -p.hd + 0.06, seat + 0.06, p.height);
  for (const sx of [-1, 1]) {
    const x = sx * (p.hw - 0.02);
    const [x0, x1] = [Math.min(x, x - sx * 0.05), Math.max(x, x - sx * 0.05)];
    p.box("metal", x0, x1, -p.hd + 0.06, -p.hd + 0.1, seat + 0.06, seat + 0.2);
    p.box("metal", x0, x1, -p.hd + 0.06, p.hd - 0.06, seat + 0.2, seat + 0.25);
  }
  p.box("metal", -0.05, 0.05, -0.05, 0.05, 0.06, seat);
  for (const along of [0, 1]) {
    p.box("metal", along ? -p.hw + 0.02 : -0.03, along ? p.hw - 0.02 : 0.03,
      along ? -0.03 : -p.hd + 0.02, along ? 0.03 : p.hd - 0.02, 0, 0.06);
  }
}

/** Sofa: base, back and two arms. */
export function sofa(p: Placer): void {
  const seat = 0.42;
  p.box("fabric", -p.hw, p.hw, -p.hd, p.hd, 0.1, seat);
  p.box("fabric", -p.hw, p.hw, -p.hd, -p.hd + 0.16, seat, p.height);
  for (const sx of [-1, 1]) {
    const x = sx * p.hw;
    p.box("fabric", Math.min(x, x - sx * 0.16), Math.max(x, x - sx * 0.16), -p.hd, p.hd, seat, seat + 0.2);
  }
  const cushions = p.hw > 0.75 ? 2 : 1;
  for (let i = 0; i < cushions; i++) {
    const w = (2 * p.hw - 0.4) / cushions;
    const x0 = -p.hw + 0.2 + i * w;
    p.box("fabric", x0 + 0.02, x0 + w - 0.02, -p.hd + 0.2, p.hd - 0.04, seat, seat + 0.09);
    p.box("fabric", x0 + 0.06, x0 + w - 0.06, -p.hd + 0.16, -p.hd + 0.24, seat + 0.09, seat + 0.34);
  }
  p.legs("metal", 0.05, 0.06, 0.1);
}

export function bench(p: Placer): void {
  const seat = p.height - 0.05;
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, seat, p.height);
  for (const sx of [-1, 1]) {
    const x = sx * (p.hw - 0.15);
    p.box("metal", x - 0.04, x + 0.04, -p.hd + 0.04, p.hd - 0.04, 0, seat);
  }
}

/** Bed: base, mattress and a pillow at the head (the wall side). */
export function bed(p: Placer): void {
  p.box("wood", -p.hw, p.hw, -p.hd, p.hd, 0.08, 0.32);
  p.box("fabric", -p.hw + 0.02, p.hw - 0.02, -p.hd + 0.02, p.hd - 0.02, 0.32, p.height);
  p.box("wood", -p.hw, p.hw, -p.hd, -p.hd + 0.06, 0.08, p.height + 0.35);
  const pillowW = Math.min(0.55, p.hw - 0.05);
  for (const s of p.hw > 0.6 ? [-1, 1] : [0]) {
    const cx = s * (p.hw - pillowW / 2 - 0.06);
    p.box("fabric", cx - pillowW / 2, cx + pillowW / 2, -p.hd + 0.08, -p.hd + 0.42, p.height, p.height + 0.09);
  }
  p.box("fabric", -p.hw + 0.02, p.hw - 0.02, p.hd - 0.55, p.hd - 0.02, p.height, p.height + 0.05);
}
