import type { Placer, Mat } from "./placer.js";

/** Half-metre closing bays keep their width; a residual middle bay absorbs the fit. */
export function cabinetBays(width: number): [number, number][] {
  if (width <= 1) return [[-width / 2, 0], [0, width / 2]];
  const start = -width / 2, end = width / 2, spans: [number, number][] = [[start, start + .5]];
  for (let x = start + .5; x < end - .5 - 1e-8; x += .5) spans.push([x, Math.min(x + .5, end - .5)]);
  spans.push([end - .5, end]);
  return spans;
}

/** A front closes at both ends and repeats fitted centre panels with physical reveals. */
export function cabinetFront(p: Placer, bottom: number, top: number, material: Mat): void {
  for (const [left, right] of cabinetBays(p.hw * 2)) {
    p.box(material, left + .008, right - .008, p.hd - .045, p.hd - .012, bottom, top);
  }
}
