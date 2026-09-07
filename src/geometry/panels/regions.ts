import { nineSlice, type PanelPiece } from "./nine-slice.js";
export interface PanelRegion extends PanelPiece { joint: boolean }

/** Fixed-width perimeter joints continue through adjacent nine-piece cells. */
export function panelRegions(width: number, height: number, joint: number): PanelRegion[] {
  const out: PanelRegion[] = [];
  const edge = Math.min(joint / 2, width / 4, height / 4);
  for (const cell of nineSlice(width, height).pieces) {
    const cuts = (start: number, size: number, limit: number): number[] =>
      [start, ...[edge, limit - edge].filter(n => n > start + 1e-8 && n < start + size - 1e-8), start + size];
    const xs = cuts(cell.x, cell.width, width), ys = cuts(cell.y, cell.height, height);
    for (let y = 0; y < ys.length - 1; y++) for (let x = 0; x < xs.length - 1; x++) {
      const x0 = xs[x]!, x1 = xs[x + 1]!, y0 = ys[y]!, y1 = ys[y + 1]!;
      out.push({ role: cell.role, x: x0, y: y0, width: x1 - x0, height: y1 - y0,
        joint: x1 <= edge + 1e-8 || x0 >= width - edge - 1e-8 || y1 <= edge + 1e-8 || y0 >= height - edge - 1e-8 });
    }
  }
  return out;
}
