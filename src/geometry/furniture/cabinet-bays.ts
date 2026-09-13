import type { Placer, Mat } from "./placer.js";

/** Half-metre ends surround equally fitted cabinet fronts, targeting Studio's 0.8 m bays. */
export function cabinetBays(width: number): [number, number][] {
  if (width <= 1) return [[-width / 2, 0], [0, width / 2]];
  const start = -width / 2, end = width / 2, spans: [number, number][] = [[start, start + .5]];
  const middle = width - 1;
  const count = Math.max(1, Math.round(middle / .8));
  for (let i = 0; i < count; i++) {
    spans.push([start + .5 + i * middle / count, start + .5 + (i + 1) * middle / count]);
  }
  spans.push([end - .5, end]);
  return spans;
}

/** A front closes at both ends and repeats fitted centre panels with physical reveals. */
export function cabinetFront(p: Placer, bottom: number, top: number, material: Mat): void {
  for (const [left, right] of cabinetBays(p.hw * 2)) {
    p.box(material, left + .008, right - .008, p.hd - .045, p.hd - .012, bottom, top);
  }
}
