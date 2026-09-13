export type PanelRole = "top-left" | "top" | "top-right" | "left" | "centre" | "right"
  | "bottom-left" | "bottom" | "bottom-right" | "field";
export interface PanelPiece { role: PanelRole; x: number; y: number; width: number; height: number }
export interface NinePieceAssembly { width: number; height: number; unit: number; pieces: PanelPiece[] }

interface Span { at: number; size: number; edge: -1 | 0 | 1 }
const ROLES: PanelRole[][] = [
  ["bottom-left", "bottom", "bottom-right"], ["left", "centre", "right"], ["top-left", "top", "top-right"],
];

function spans(length: number, unit: number): Span[] {
  const out: Span[] = [{ at: 0, size: unit, edge: -1 }];
  if (length > 2 * unit) out.push({ at: unit, size: length - 2 * unit, edge: 0 });
  out.push({ at: length - unit, size: unit, edge: 1 });
  return out;
}

/** Fixed corners surround one fitted plain field, following Studio's panel composition. */
export function nineSlice(width: number, height: number, unit = 0.5): NinePieceAssembly {
  if (![width, height, unit].every(n => Number.isFinite(n) && n > 0)) throw new RangeError("panel dimensions must be positive metres");
  if (width < 2 * unit || height < 2 * unit) {
    return { width, height, unit, pieces: [{ role: "field", x: 0, y: 0, width, height }] };
  }
  const pieces = spans(height, unit).flatMap(y => spans(width, unit).map(x => ({
    role: ROLES[y.edge + 1]![x.edge + 1]!, x: x.at, y: y.at, width: x.size, height: y.size,
  })));
  return { width, height, unit, pieces };
}
