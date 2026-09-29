import type { LitJoint, PanelSystem, WallFace } from './types.js';
import { EDGE_HALF, GROUPED_COLUMNS, groupOf, MAX_GROUP } from './panel-recipes.js';

/** Panel walls: the nine-slice rule on the construction module. A wall fragment is cut into
 *  column cells of the system's pitch, phased to the 0.5 m grid (or centred in the run) and
 *  clipped only where the run ends; a whole cell takes its baked column at scale 1 and a top
 *  piece stretched in y to the head band; a clipped cell takes the fill stretched in x/y with
 *  a bullnose edge at its cut; head and foot bands stretch along the run; lit joints are lens
 *  modules with a cove record of the same id. Nothing that repeats below the cell is ever
 *  placed on its own, and no column is scaled across the run. */

/** One column interval of a panel run: `full` intervals take the baked column module, the
 *  others are clipped at a run end or a hole and take the stretched fill. */
export interface PanelInterval { a: number; b: number; width: number; full: boolean }

const CELL = .5;
/** A lit joint stops this far short of the run's ends. */
const LINE_GAP = .02;
/** Shortest lit joint worth a lens and a record. */
const MIN_LINE = .3;
/** Least height a stretched top piece must keep, else the cell is filled instead. */
const MIN_TOP = .02;

/** Column intervals of [a, b] for a repeating width sequence phased at `origin`. A run end
 *  within half a seam of a cell boundary counts as on it, so the whole cell keeps its
 *  column (its interval is the exact pattern cell); other end cells are clipped. */
export function panelIntervals(a: number, b: number, pitch: readonly number[], origin: number, seam = 0): PanelInterval[] {
    if (!(b > a)) return [];
    const tol = Math.max(seam / 2, 1e-6);
    if (!pitch.length || pitch.some(p => !(p > 0)) || b - a <= 2 * tol) return [{ a, b, width: b - a, full: false }];
    const period = pitch.reduce((s, p) => s + p, 0), starts = pitch.map((_, i) => pitch.slice(0, i).reduce((s, p) => s + p, 0));
    const bounds: { x: number; i: number }[] = [];
    for (let k = Math.floor((a - origin) / period) - 1; origin + k * period <= b + period; k++)
        for (let i = 0; i < pitch.length; i++) bounds.push({ x: origin + k * period + starts[i]!, i });
    const near = (x: number) => bounds.find(bound => Math.abs(bound.x - x) <= tol);
    const first = near(a), last = near(b);
    const points = [
        { x: first ? first.x : a, bound: first },
        ...bounds.filter(bound => bound.x > a + tol && bound.x < b - tol).map(bound => ({ x: bound.x, bound })),
        { x: last ? last.x : b, bound: last },
    ];
    const cells: PanelInterval[] = [];
    for (let j = 0; j + 1 < points.length; j++) {
        const p = points[j]!, q = points[j + 1]!;
        const width = p.bound ? pitch[p.bound.i]! : 0;
        const full = !!p.bound && !!q.bound && Math.abs(q.x - p.x - width) < 1e-6;
        cells.push(full ? { a: p.x, b: q.x, width, full }
            : { a: j === 0 ? a : p.x, b: j + 2 === points.length ? b : q.x, width: 0, full });
        const cell = cells[cells.length - 1]!;
        if (!full) cell.width = cell.b - cell.a;
    }
    return cells;
}

/** The phase origin of a system on one fragment: the grid origin, or the origin that sets
 *  the pattern symmetric in the run with end cells no narrower than `minColumn` when a
 *  period fewer allows it. */
export function panelOrigin(spec: Pick<PanelSystem, 'pitch' | 'phase' | 'minColumn'>, a: number, b: number, gridOrigin: number): number {
    if (spec.phase === 'grid') return gridOrigin;
    const period = spec.pitch.reduce((s, p) => s + p, 0), length = b - a;
    const n = Math.floor(length / period + 1e-9), rest = length - n * period;
    if (rest < 1e-6) return a;
    return rest / 2 < spec.minColumn && n >= 1 ? a + (rest + period) / 2 : a + rest / 2;
}

/** Cells ready to place: clipped cells narrower than `minColumn` merge into their neighbour,
 *  which then becomes fill too. */
export function panelCells(spec: Pick<PanelSystem, 'pitch' | 'phase' | 'minColumn' | 'seam'>, a: number, b: number, gridOrigin: number): PanelInterval[] {
    const cells = panelIntervals(a, b, spec.pitch, panelOrigin(spec, a, b, gridOrigin), spec.seam);
    for (let i = 0; cells.length > 1 && i < cells.length; i++) {
        const cell = cells[i]!;
        if (cell.full || cell.b - cell.a >= spec.minColumn) continue;
        const j = i === 0 ? 1 : i - 1, other = cells[j]!;
        const merged: PanelInterval = { a: Math.min(cell.a, other.a), b: Math.max(cell.b, other.b), width: 0, full: false };
        merged.width = merged.b - merged.a;
        cells.splice(Math.min(i, j), 2, merged);
        i = -1;
    }
    return cells;
}

/** A panel-system wall fragment [a, b] × [y0, y1] on one face. A fragment from the floor to
 *  the top of the run takes columns; a sill or lintel fragment takes one fill. The head band
 *  only where the fragment reaches the ceiling (none when it is the backing itself, left
 *  bare as a recessed band), the foot only on the floor. */
export function placePanelSystem(face: WallFace, spec: PanelSystem, a: number, b: number, y0: number, y1: number): void {
    if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
    const length = b - a, mid = (a + b) / 2;
    face.piece(spec.backing, mid, y0, [length / CELL, (y1 - y0) / CELL, 1]);
    const floor = Math.abs(y0) < 1e-3, ceiling = Math.abs(y1 - face.ceilingY) < 1e-3;
    const whole = floor && y1 >= face.height - 1e-3;
    const head = spec.head && ceiling && y1 - y0 > spec.head.height + .05 ? spec.head : undefined;
    const foot = spec.foot && floor && y1 - y0 > .3 ? spec.foot : undefined;
    const bottom = y0 + (foot?.height ?? 0), top = y1 - (head?.height ?? 0);
    // A sill or lintel is one fill: the casing or the window frame owns its ends.
    const cells = whole ? panelCells(spec, a, b, face.gridOrigin) : [{ a, b, width: b - a, full: false }];
    const tall = whole && top - bottom - spec.rows >= MIN_TOP;
    const fill = (from: number, to: number) => face.piece(spec.fill, (from + to) / 2, bottom, [(to - from) / CELL, (top - bottom) / CELL, 1]);
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]!;
        // Seams sit between cells only: a run end keeps the skin flush to it.
        const from = cell.a > a + 1e-6 ? cell.a + spec.seam / 2 : a, to = cell.b < b - 1e-6 ? cell.b - spec.seam / 2 : b;
        if (!(tall && cell.full)) {
            if (to - from > 1e-4) fill(from, to);
            continue;
        }
        // Up to MAX_GROUP equal whole cells in a row stand as one column and one top module.
        let n = 1;
        while (n < MAX_GROUP && cells[i + n]?.full && Math.abs(cells[i + n]!.width - cell.width) < 1e-9) n++;
        while (n > 1 && !GROUPED_COLUMNS.has(groupOf(spec.column(cell.width), n))) n--;
        const at = (cell.a + cells[i + n - 1]!.b) / 2;
        face.piece(groupOf(spec.column(cell.width), n), at, bottom, [1, 1, 1]);
        face.piece(groupOf(spec.top(cell.width), n), at, bottom + spec.rows, [1, (top - bottom - spec.rows) / CELL, 1]);
        i += n - 1;
    }
    // A clipped end cell of a full-height fragment rounds its cut like a column's edge.
    if (whole && spec.edge) {
        if (!cells[0]!.full || !tall) face.piece(spec.edge, a + EDGE_HALF, bottom, [1, (top - bottom) / CELL, 1]);
        if ((!cells[cells.length - 1]!.full || !tall) && length > 4 * EDGE_HALF)
            face.piece(spec.edge, b - EDGE_HALF, bottom, [1, (top - bottom) / CELL, 1]);
    }
    // A head band in the backing's own module is the backing showing: nothing to place.
    if (head && head.module !== spec.backing) face.piece(head.module, mid, top, [length / CELL, 1, 1]);
    if (foot) face.piece(foot.module, mid, y0, [length / CELL, 1, 1]);
    const joints = [...(spec.litJoints ?? []), ...(head?.lens ? [head.lens] : [])];
    for (const joint of joints) {
        const y = joint.y === 'head' ? (head ? top : undefined) : joint.y === 'foot' ? (floor ? bottom : undefined)
            : joint.y > y0 + .01 && joint.y < y1 - .01 ? joint.y : undefined;
        if (y !== undefined) litJoint(face, joint, a, b, y);
    }
}

/** A lit joint along [a, b] at height y: the lens module and its cove record, one id. */
export function litJoint(face: WallFace, joint: LitJoint, a: number, b: number, y: number): void {
    const length = b - a - 2 * LINE_GAP;
    if (length < MIN_LINE) return;
    const id = face.nextId(), mid = (a + b) / 2, position = face.at(mid, y, joint.proud);
    face.piece(joint.module, mid, y, [length / CELL, 1, 1], { id, proud: joint.proud });
    const angleDeg = (((face.axis === 'H' ? 0 : 90) + face.frame.angleDeg) % 360 + 360) % 360;
    // Records stand in building-local metres, like the plan's lights.
    face.lights.push({
        id, kind: 'cove', room: face.room,
        position: [position[0], position[1] + face.elevation, position[2]].map(v => Math.round(v * 1000) / 1000) as [number, number, number],
        length: Math.round(length * 1000) / 1000, angleDeg: Math.round(angleDeg * 100) / 100,
        intensity: Math.round(length * joint.lumensPerMetre), colorTemperatureK: joint.kelvin,
        ...(joint.color ? { color: [...joint.color] as [number, number, number] } : {}),
        range: 2.5, beamDeg: 170, diffuse: .9, facing: joint.facing,
    });
}
