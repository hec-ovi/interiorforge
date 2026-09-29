import type { PanelSystem, WallFace } from './types.js';

/** One column interval of a panel run: `full` intervals take the baked column module, the
 *  others are clipped at a run end or a hole and take the stretched fill. */
export interface PanelInterval { a: number; b: number; width: number; full: boolean }

/** Column intervals of [a, b] for a repeating width sequence phased at `origin`.
 *  Stub until package W lands: one clipped interval over the whole run. */
export function panelIntervals(a: number, b: number, _pitch: readonly number[], _origin: number, _seam = 0): PanelInterval[] {
    return b > a ? [{ a, b, width: b - a, full: false }] : [];
}

/** A panel-system wall fragment [a, b] x [y0, y1] on one face (W: columns at scale 1 phased
 *  to the grid, stretched tops, fill and edges at cuts, head and foot bands, lit joints).
 *  Stub until package W lands: the marker field as one fitted plain piece, so the wall stays
 *  closed. */
export function placePanelSystem(face: WallFace, spec: PanelSystem, a: number, b: number, y0: number, y1: number): void {
    if (b - a < 1e-6 || y1 - y0 < 1e-6) return;
    face.piece(spec.id, (a + b) / 2, y0, [(b - a) / .5, (y1 - y0) / .5, 1]);
}
