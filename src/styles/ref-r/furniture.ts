import type { FloorInterior, Furniture, LightFixture } from '../../core/types.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { itemFrame, registerModuleSizes } from '../systems/built-ins.js';
import { placeRun } from '../systems/run.js';
import type { AssemblySpec, RunSpec } from '../systems/types.js';
import { R1 } from './look.js';

/** The rich office's own furniture, measured on the reference office. Every piece is a
 *  module at its authored size (a template names it in `fit`), or an assembly of fixed bays
 *  and cells:
 *  - the drawer chest by the door: 1.35 × 0.5 × 1.25 m, four stacked burl trays of two
 *    white inset drawers each, a finger notch cut in every front;
 *  - the drawer towers flanking the desk: 0.5 × 0.45 × 1.2 m, four white drawers in an ink
 *    carcass, a vase on top;
 *  - the fixed corner bench under the wall library: navy upholstery on a black plinth, seat
 *    at 0.49 m, a stepped low back to 0.72 m, laid in 0.5 m cells along the wall;
 *  - the wall library over it: three walnut boards 0.3 m deep at 1.45, 1.85 and 2.25 m
 *    along the whole run, binder bays baked at 0.9 m pitch, bare boards where none fits. */

const box = (k: Kit, slot: string, [x0, x1]: [number, number], [y0, y1]: [number, number], [z0, z1]: [number, number]) =>
    k.box(slot, [x0, y0, z0], [x1 - x0, y1 - y0, z1 - z0]);

export const CHEST = { size: [1.35, .5, 1.25] as const, module: 'fit-r1-chest' };
export const TOWER = { size: [.5, .45, 1.2] as const, module: 'fit-r1-tower' };
/** Depth of the bench (its record) and of the library boards over it. */
export const BENCH_DEPTH = .7;
export const SHELF_DEPTH = .3;
/** Seat height: the consumers' sitting datum. */
export const SEAT = .49;
/** Board heights of the wall library above the floor. */
export const LIBRARY_BOARDS = [1.45, 1.85, 2.25] as const;
const BOARD = .03;
const BAY = .9;

/** One drawer front with its finger notch, facing +z at z. */
function drawer(k: Kit, x0: number, x1: number, y0: number, y1: number, z: number): void {
    box(k, R1.white, [x0, x1], [y0, y1 - .018], [z - .018, z]);
    // the notch: a dark slot under the top edge, the front's lip either side of it
    const cx = (x0 + x1) / 2;
    box(k, R1.black, [cx - .09, cx + .09], [y1 - .018, y1 - .006], [z - .03, z - .004]);
    box(k, R1.white, [x0, cx - .09], [y1 - .018, y1], [z - .018, z]);
    box(k, R1.white, [cx + .09, x1], [y1 - .018, y1], [z - .018, z]);
}

function chest(k: Kit): void {
    const [w, d] = CHEST.size, hw = w / 2, hd = d / 2;
    box(k, R1.black, [-hw + .04, hw - .04], [0, .05], [-hd + .03, hd - .04]);
    for (let row = 0; row < 4; row++) {
        // stacked trays step a few millimetres in and out, as the reference chest does
        const y0 = .05 + row * .29, y1 = y0 + .27, jog = row % 2 ? .012 : -.012;
        box(k, R1.burl, [-hw + jog + .005, hw + jog - .005], [y0, y1], [-hd, hd - .02]);
        box(k, R1.black, [-hw + .03, hw - .03], [y1, y1 + .02], [-hd + .02, hd - .04]);
        for (const [x0, x1] of [[-hw + .05 + jog, -.02 + jog], [.02 + jog, hw - .05 + jog]] as const)
            drawer(k, x0, x1, y0 + .03, y1 - .02, hd);
    }
    box(k, R1.ink, [-hw, hw], [1.21, 1.25], [-hd, hd]);
}

function tower(k: Kit): void {
    const [w, d] = TOWER.size, hw = w / 2, hd = d / 2;
    box(k, R1.black, [-hw + .03, hw - .03], [0, .05], [-hd + .03, hd - .03]);
    box(k, R1.ink, [-hw, hw], [.05, 1.16], [-hd, hd - .02]);
    for (let row = 0; row < 4; row++) {
        const y0 = .08 + row * .27;
        drawer(k, -hw + .04, hw - .04, y0, y0 + .23, hd);
    }
    box(k, R1.ink, [-hw, hw], [1.16, 1.2], [-hd, hd]);
    // a slim vase on top
    k.cylinder(R1.alloy, [0, 1.2, 0], .06, .02, 10);
    k.cylinder(R1.alloy, [0, 1.22, 0], .075, .16, 10);
    k.cylinder(R1.alloy, [0, 1.38, 0], .04, .06, 10);
}

/** One 0.5 m cell of the fixed bench, back on z = -0.35. */
function benchCell(k: Kit): void {
    const h = .25, back = -BENCH_DEPTH / 2, front = BENCH_DEPTH / 2;
    box(k, R1.black, [-h, h], [0, .07], [back + .02, front - .06]);
    box(k, R1.navy, [-h, h], [.07, SEAT - .09], [back, front]);
    // seat cushion with a 6 mm groove at each cell end
    box(k, R1.navy, [-h + .003, h - .003], [SEAT - .09, SEAT], [back + .17, front]);
    // stepped low back: an upright to 0.62 m and a raked cap to 0.72 m
    box(k, R1.navy, [-h + .003, h - .003], [SEAT - .09, .62], [back, back + .17]);
    box(k, R1.navy, [-h + .003, h - .003], [.62, .72], [back, back + .11]);
    box(k, R1.bronze, [-h, h], [.069, .075], [front - .062, front - .058]);
}

/** The three library boards over one 0.5 m cell, stretched along the whole run. */
function boards(k: Kit): void {
    for (const y of LIBRARY_BOARDS) box(k, R1.walnut, [-.25, .25], [y - LIBRARY_BOARDS[0], y - LIBRARY_BOARDS[0] + BOARD], [0, SHELF_DEPTH]);
}

/** One 0.9 m library bay over the boards: binders, boxes and a gap, like the occupied
 *  reference shelves (white binders with a dark one now and then, white file boxes). */
function libraryBay(k: Kit): void {
    const base = LIBRARY_BOARDS[0];
    for (const [level, y] of LIBRARY_BOARDS.entries()) {
        const y0 = y - base + BOARD;
        if (level === 0) {
            // two white file boxes and a run of binders
            for (const x of [-.36, -.16]) box(k, R1.white, [x - .09, x + .09], [y0, y0 + .2], [.03, .28]);
            for (let i = 0; i < 6; i++) binder(k, .02 + i * .065, y0, i === 4);
        } else {
            const count = level === 1 ? 11 : 9, start = level === 1 ? -.4 : -.3;
            for (let i = 0; i < count; i++) binder(k, start + i * .066, y0, (i + level) % 7 === 3);
        }
    }
}

function binder(k: Kit, x: number, y: number, dark: boolean): void {
    const h = .29 + ((Math.round(x * 100) % 3 + 3) % 3) * .012;
    box(k, dark ? R1.ink : R1.white, [x - .028, x + .028], [y, y + h], [.03, .27]);
    // spine label
    box(k, R1.paper, [x - .016, x + .016], [y + h * .55, y + h * .8], [.27, .272]);
}

/** A bronze lip under the front of the lowest board, where a bay does not fit. */
function lip(k: Kit): void {
    box(k, R1.bronze, [-.25, .25], [-.008, 0], [SHELF_DEPTH - .012, SHELF_DEPTH]);
}

export const R1_LIBRARY_RUN: RunSpec = {
    mid: 'fit-r1-shelf-boards', repeat: { module: 'fit-r1-shelf-bay', pitch: BAY }, filler: 'fit-r1-shelf-lip',
    height: LIBRARY_BOARDS[2] - LIBRARY_BOARDS[0] + BOARD, depth: SHELF_DEPTH,
};

/** The fixed bench with the wall library over it: one record, the bench's footprint, its back
 *  on the wall. `reach` lengthens the library past both ends of the bench (a return along the
 *  side wall reaches into the corner over the other bench). */
function benchLibrary(reach: number) {
    return (builder: PlacementBuilder, _floor: FloorInterior, item: Furniture, ceilingY: number): LightFixture[] => {
        const frame = itemFrame(item), w = item.size[0], d = item.size[1], room = item.room;
        const cells = Math.max(1, Math.round(w / .5)), cell = w / cells;
        for (let i = 0; i < cells; i++)
            frame.place(builder, 'fit-r1-bench-cell', room, -w / 2 + cell * (i + .5), 0, 0, [cell / .5, 1, d / BENCH_DEPTH]);
        // the library hangs from the wall above, lowered as a whole under a low ceiling
        const top = LIBRARY_BOARDS[2] + BOARD + .34, drop = Math.max(0, top - (ceilingY - .08));
        placeRun(builder, room, frame.origin, frame.rotation, w + 2 * reach, R1_LIBRARY_RUN,
            { y: LIBRARY_BOARDS[0] - drop, z: -d / 2, align: 'centre' });
        return [];
    };
}

export const R1_ASSEMBLIES: Record<string, AssemblySpec> = {
    'asm-r1-library': { type: 'custom', place: benchLibrary(0) },
    'asm-r1-library-return': { type: 'custom', place: benchLibrary(BENCH_DEPTH - SHELF_DEPTH + .1) },
};

export const r1FurnitureRecipes: RecipeSet = add => {
    add(CHEST.module, chest);
    add(TOWER.module, tower);
    add('fit-r1-bench-cell', benchCell);
    add('fit-r1-shelf-boards', boards);
    add('fit-r1-shelf-bay', libraryBay);
    add('fit-r1-shelf-lip', lip);
};
registerModuleSizes(r1FurnitureRecipes);
