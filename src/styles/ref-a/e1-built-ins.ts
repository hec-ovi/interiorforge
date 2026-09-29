import type { FloorInterior, Furniture, LightFixture } from '../../core/types.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { PlacementBuilder } from '../../placements/builder.js';
import { FINISH as F } from '../../modules/finishes.js';
import { placeAssembly } from '../systems/assembly.js';
import { itemFrame, lensRecord } from '../systems/built-ins.js';
import { E1_PLANTER } from '../systems/reference-assemblies.js';
import type { AssemblySpec } from '../systems/types.js';
import { E1_SLOT } from './e1-slots.js';
import { clothSurface, loosePillow, softBox, type SoftOptions } from '../luxury/model-geometry.js';
import { roundedSection } from '../systems/kitchen-modules.js';
import { tuft } from '../systems/foliage.js';

/** The suite's composite built-ins, each one record: the window lounge (a planted trough
 *  under the window with the pale sectional in front of it), the bed wall (a stadium
 *  terrarium on a cream base with a louvred black headboard, D nightstands and the bed) and
 *  the window desk (a trough behind a dark desk with a light inlay). Fixed bays stand at
 *  scale 1; only straight parts stretch along their run. */
export const E1_BUILT_INS = {
    /** sectional: 0.9 m seat bays and 0.2 m arms on a black plinth, 1.0 m deep, seat 0.42 m */
    sofa: { bay: .9, arm: .2, depth: 1, gap: .05 },
    /** trough under the window, as the kitchen's: 0.45 m deep */
    trough: .45,
    /** terrarium wall: cream base to 0.9 m, glass to 2.2 m, canopy to 2.55 m, 0.45 m deep */
    terrarium: { base: .9, glass: 2.2, canopy: 2.55, depth: .45 },
    bed: [1.8, 2.15] as [number, number],
    headboard: { width: 1.9, height: 1.0, bottom: .15 },
    nightstand: { width: .5, depth: .42, top: .5 },
    desk: [1.8, .8, .75] as [number, number, number],
};

const box = (k: Kit, slot: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    k.box(slot, [x0, y0, z0], [x1 - x0, y1 - y0, z1 - z0]);
const bevel = (k: Kit, slot: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r = .004) =>
    k.bevelBox(slot, [x0, y0, z0], [x1 - x0, y1 - y0, z1 - z0], r);
/** Tight upholstery: rounded, crowned, with small tension folds at the seams. */
const cushion = (k: Kit, x: number, y: number, z: number, w: number, h: number, d: number, extra: SoftOptions = {}) =>
    softBox(k, E1_SLOT.upholstery, [x, y, z], [w, h, d], { radius: .035, crown: .01, wrinkles: .0012, detail: 10, ...extra });

const T = E1_BUILT_INS.terrarium;
/** A (y, z) section with rounded front corners, for stretched cells (swept along x). */
const front = (y0: number, y1: number, z0: number, z1: number, bottom: number, top: number) => roundedSection(y0, y1, z0, z1, { bottomFront: bottom, topFront: top }, 4);

export const e1BuiltInRecipes: RecipeSet = add => {
    // Sectional bay: a recessed black plinth, a crowned seat cushion with a piped front, a
    // raked back cushion over its base; back at z = 0.
    add('fit-e1-sofa-bay', k => {
        const h = E1_BUILT_INS.sofa.bay / 2 - .004, w = 2 * h;
        bevel(k, F.black, -h + .01, h - .01, 0, .12, .08, .92, .006);
        cushion(k, 0, .12, .13, w, .3, .26, { radius: .025, crown: .004 });
        cushion(k, 0, .12, .62, w, .3, .76, { crown: .012 });
        cushion(k, 0, .4, .14, w, .38, .2, { lean: .1, frontCrown: .018, radius: .04 });
    });
    add('fit-e1-sofa-arm', k => {
        bevel(k, F.black, -.09, .09, 0, .12, .08, .92, .006);
        cushion(k, 0, .12, .5, .198, .46, .996, { radius: .045, crown: .006 });
        bevel(k, F.black, -.1, .1, .58, .6, .02, .98, .006);
    });
    // Terrarium wall, one 0.5 m straight cell stretched along the run: its parts are swept
    // sections, so the stretch keeps their rounds. Cream base with a rounded lip, dark tiled
    // back, glass front in a black rim, a cream canopy with a deep rounded underside.
    add('fit-e1-terrarium', k => {
        k.sweep(E1_SLOT.cream, front(0, T.base, 0, T.depth, .006, .02), -.25, .25);
        k.sweep(F.black, front(T.base, T.base + .04, 0, T.depth + .01, .01, .012), -.25, .25);
        box(k, E1_SLOT.tile, -.25, .25, T.base + .04, T.glass, 0, .02);
        box(k, F.soil, -.25, .25, T.base + .04, T.base + .1, .02, T.depth - .04);
        box(k, F.glass, -.25, .25, T.base + .04, T.glass, T.depth - .02, T.depth - .01);
        k.sweep(E1_SLOT.cream, front(T.glass + .02, T.canopy, 0, T.depth + .03, .12, .015), -.25, .25);
        k.sweep(F.black, front(T.glass - .005, T.glass + .02, T.depth - .03, T.depth + .045, .008, .004), -.25, .25);
    });
    // The terrarium's planting, one metre of it: tall broad-leaved plants up to the glass
    // head over low tufts, all inside the glass box (local z from the tiled back).
    add('fit-e1-terrarium-bay', k => {
        const bounds = { x: [-.49, .49] as [number, number], y: [0, T.glass - T.base - .12] as [number, number], z: [.01, T.depth - .08] as [number, number] };
        for (let i = 0; i < 4; i++) tuft(k, F.leaf, F.stem, [-.36 + i * .24, 0, .12 + (i % 2) * .12], 1.05 + (i % 3) * .15, 311 + i * 29, 12, i % 2 ? 0 : Math.PI, bounds, 1.6);
        for (let i = 0; i < 7; i++) tuft(k, F.leaf, F.stem, [-.42 + i * .14, 0, .27 - (i % 2) * .15], .32 + (i % 3) * .08, 523 + i * 31, 7, undefined, bounds);
    });
    add('fit-e1-terrarium-end', k => bevel(k, E1_SLOT.cream, -.03, .03, 0, T.canopy, 0, T.depth + .03, .015));
    // Above the canopy the wall is cream to the ceiling: stretched in x and y.
    add('fit-e1-terrarium-cap', k => box(k, E1_SLOT.cream, -.25, .25, 0, .5, 0, T.depth + .03));
    add('fit-e1-terrarium-led', k => box(k, F.lensWarm, -.25, .25, -.006, 0, -.02, .02));
    // Louvred black headboard: a rounded back panel and eight blades with rounded noses.
    add('fit-e1-headboard', k => {
        const { width, height } = E1_BUILT_INS.headboard;
        bevel(k, F.black, -width / 2, width / 2, 0, height, 0, .03, .008);
        for (let i = 0; i < 8; i++) {
            const y = .06 + i * (height - .1) / 8;
            k.sweep(F.black, roundedSection(y, y + .05, .03, .07, { bottomFront: .008, topFront: .014 }, 3), -width / 2 + .03, width / 2 - .03);
        }
    });
    // D-shaped cantilever nightstand: a cream slab with a rounded plan and edges on a black
    // bracket, a small drawer line in its face.
    add('fit-e1-nightstand', k => {
        const { width, depth, top } = E1_BUILT_INS.nightstand, straight = depth - width / 2;
        const plan: [number, number][] = [[-width / 2, 0], [width / 2, 0], [width / 2, straight]];
        for (let i = 1; i < 16; i++) { const a = i / 16 * Math.PI; plan.push([width / 2 * Math.cos(a), straight + width / 2 * Math.sin(a)]); }
        plan.push([-width / 2, straight]);
        k.slab(E1_SLOT.cream, plan, top - .08, top, .014, .01);
        bevel(k, F.black, -.05, .05, top - .3, top - .078, 0, .12, .006);
        k.tube(F.black, [[-.12, top - .045, depth - .001], [.12, top - .045, depth - .001]], .002, false, 6);
    });
    // Low bed: a black plinth set in, a rounded white mattress, a pale duvet draped over the
    // foot and sides, two loose pillows at the head.
    add('fit-e1-bed', k => {
        const [w, d] = E1_BUILT_INS.bed;
        bevel(k, F.black, -w / 2 + .1, w / 2 - .1, 0, .16, .1, d - .1, .01);
        softBox(k, E1_SLOT.upholstery, [0, .16, d / 2], [w, .1, d], { radius: .03, detail: 0 });
        softBox(k, E1_SLOT.linen, [0, .26, d / 2], [w - .04, .18, d - .04], { radius: .06, crown: .008, wrinkles: .001, detail: 8 });
        clothSurface(k, E1_SLOT.duvet, (u, v) => {
            const x = (u - .5) * (w + .06), z = .62 + v * (d - .6);
            const side = Math.max(0, (Math.abs(x) - (w / 2 - .06)) / .09), foot = Math.max(0, (z - (d - .05)) / .08);
            const drop = .1 * Math.min(1, side) ** 1.3 + .1 * Math.min(1, foot) ** 1.3;
            const roll = .03 * Math.exp(-(((v - .03) / .035) ** 2));
            const folds = .006 * Math.sin(x * 23 + z * 7) * Math.sin(v * Math.PI) + .004 * Math.sin(z * 31 - x * 9);
            return [x, .455 + roll + folds - drop, Math.min(z, d + .03)];
        }, w + .06, d - .6, .02, 24, 20);
        loosePillow(k, E1_SLOT.linen, [-.42, .44, .3], .66, .4, .13, .04, 0, [0, 0], 14);
        loosePillow(k, E1_SLOT.linen, [.42, .44, .31], .66, .4, .13, -.05, 0, [.3, .2], 14);
    });
    // Dark desk with a light inlay border on two slab legs, a glowing cylinder lamp.
    add('fit-e1-desk', k => {
        const [w, d, h] = E1_BUILT_INS.desk;
        bevel(k, F.black, -w / 2, w / 2, h - .05, h, 0, d, .008);
        for (const x of [-w / 2 + .12, w / 2 - .12]) bevel(k, F.black, x - .03, x + .03, 0, h - .05, .1, d - .1, .006);
        box(k, F.ivory, -w / 2 + .05, w / 2 - .05, h, h + .002, .05, .06);
        box(k, F.ivory, -w / 2 + .05, w / 2 - .05, h, h + .002, d - .06, d - .05);
        box(k, F.ivory, -w / 2 + .05, -w / 2 + .06, h, h + .002, .06, d - .06);
        box(k, F.ivory, w / 2 - .06, w / 2 - .05, h, h + .002, .06, d - .06);
        k.cylinder(F.black, [w / 2 - .25, h, .25], .09, .025, 32);
        k.turned(F.lensWarm, [w / 2 - .25, h + .025, .25], [[0, 0], [.07, 0], [.075, .02], [.075, .38], [.07, .4], [0, .4]], 32);
    });
};

/** The planted trough under a window along the back of a record, as its own sub-record. */
function trough(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, ceilingY: number, width: number, x = 0): LightFixture[] {
    const frame = itemFrame(item), back = -item.size[1] / 2, at = frame.at(x, 0, back + E1_BUILT_INS.trough / 2);
    const sub: Furniture = { ...item, id: `${item.id}-trough`, kind: 'plant', position: [at[0], at[2]], size: [width, E1_BUILT_INS.trough, .8] };
    return placeAssembly(builder, floor, sub, { type: 'planter', spec: E1_PLANTER }, ceilingY);
}

/** Window lounge: the trough along the whole record, the sectional in front of it. */
function placeLounge(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, ceilingY: number): LightFixture[] {
    const lights = trough(builder, floor, item, ceilingY, item.size[0]);
    const frame = itemFrame(item), room = item.room, { bay, arm, gap } = E1_BUILT_INS.sofa;
    const z = -item.size[1] / 2 + E1_BUILT_INS.trough + gap;
    const n = Math.max(1, Math.floor((item.size[0] - 2 * arm - .1) / bay)), seat = n * bay;
    for (let i = 0; i < n; i++) frame.place(builder, 'fit-e1-sofa-bay', room, -seat / 2 + (i + .5) * bay, 0, z);
    for (const s of [-1, 1]) frame.place(builder, 'fit-e1-sofa-arm', room, s * (seat / 2 + arm / 2), 0, z);
    return lights;
}

/** Bed wall: the terrarium across the record, nightstands either side of the headboard,
 *  the bed in front; the canopy's LED soffit is recorded for the item. */
function placeBedWall(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, ceilingY: number): LightFixture[] {
    const frame = itemFrame(item), room = item.room, w = item.size[0], back = -item.size[1] / 2;
    const inner = w - .06, ceiling = ceilingY - (item.elevation ?? 0);
    frame.place(builder, 'fit-e1-terrarium', room, 0, 0, back, [inner / .5, 1, 1]);
    for (const s of [-1, 1]) frame.place(builder, 'fit-e1-terrarium-end', room, s * (w / 2 - .03), 0, back);
    if (ceiling - T.canopy > .01) frame.place(builder, 'fit-e1-terrarium-cap', room, 0, T.canopy, back, [w / .5, (ceiling - T.canopy) / .5, 1]);
    const bays = Math.max(1, Math.floor((inner - .1) / 1));
    for (let i = 0; i < bays; i++) frame.place(builder, 'fit-e1-terrarium-bay', room, -bays / 2 + i + .5, T.base + .1, back + .02);
    const led = inner - .1;
    frame.place(builder, 'fit-e1-terrarium-led', room, 0, T.glass - .01, back + T.depth - .06, [led / .5, 1, 1]);
    const { width: hw } = E1_BUILT_INS.headboard, { width: nw } = E1_BUILT_INS.nightstand;
    frame.place(builder, 'fit-e1-headboard', room, 0, E1_BUILT_INS.headboard.bottom, back + T.depth);
    for (const s of [-1, 1]) frame.place(builder, 'fit-e1-nightstand', room, s * (hw / 2 + nw / 2 + .05), 0, back + T.depth);
    frame.place(builder, 'fit-e1-bed', room, 0, 0, back + T.depth);
    return [lensRecord(frame, room, `${item.id}-lens-0`, 0, T.glass - .01, back + T.depth - .06, led, floor.elevation,
        { lumensPerMetre: 180, kelvin: 3200, facing: 'down', beamDeg: 150, range: 2 }, { furniture: item.id })];
}

/** Window desk: the trough behind, the desk in front of it at the record's low end. */
function placeDesk(builder: PlacementBuilder, floor: FloorInterior, item: Furniture, ceilingY: number): LightFixture[] {
    const lights = trough(builder, floor, item, ceilingY, item.size[0]);
    const frame = itemFrame(item), [w] = E1_BUILT_INS.desk;
    frame.place(builder, 'fit-e1-desk', item.room, -item.size[0] / 2 + w / 2 + .1, 0, -item.size[1] / 2 + E1_BUILT_INS.trough + .1);
    return lights;
}

export const E1_COMPOSITES: Record<string, AssemblySpec> = {
    'asm-e1-lounge': { type: 'custom', place: placeLounge },
    'asm-e1-bed': { type: 'custom', place: placeBedWall },
    'asm-e1-desk': { type: 'custom', place: placeDesk },
};
