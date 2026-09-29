import type { GlazingSystem, WallFace } from './types.js';

/** A glazed partition fragment [a, b] over the full face height: glass plate, mullions at a
 *  fixed pitch phased to the grid, transoms, frosting and base (W).
 *  Stub until package W lands: today's office glass (plate, end stiles, head and foot rails). */
export function placeGlazing(face: WallFace, _spec: GlazingSystem, a: number, b: number): void {
    const length = b - a, mid = (a + b) / 2;
    if (length < 1e-6) return;
    face.piece('wall-panel-field-glass', mid, 0, [length / .5, face.height / .5, 1]);
    for (const t of [a + .0125, b - .0125]) face.piece('wall-meridian-glass-stile', t, 0, [1, face.height / .5, 1]);
    for (const y of [0, face.height - .025]) face.piece('wall-meridian-glass-rail', mid, y, [length / .5, 1, 1]);
}
