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

const T = E1_BUILT_INS.terrarium;

export const e1BuiltInRecipes: RecipeSet = add => {
    // Sectional bay: plinth, seat cushion, raked back cushion, black edge line; back at z = 0.
    add('fit-e1-sofa-bay', k => {
        const h = E1_BUILT_INS.sofa.bay / 2 - .004;
        box(k, F.black, -h, h, 0, .12, .08, .92);
        box(k, E1_SLOT.upholstery, -h, h, .12, .42, .12, 1);
        box(k, E1_SLOT.upholstery, -h, h, .12, .78, 0, .24);
        box(k, E1_SLOT.upholstery, -h, h, .42, .66, .24, .34);
        box(k, F.black, -h, h, .4, .42, .998, 1.002);
    });
    add('fit-e1-sofa-arm', k => {
        box(k, F.black, -.1, .1, 0, .12, .08, .92);
        box(k, E1_SLOT.upholstery, -.1, .1, .12, .6, 0, 1);
        box(k, F.black, -.1, .1, .6, .63, 0, 1);
    });
    // Terrarium wall, one 0.5 m straight cell stretched along the run: cream base, dark
    // tiled back, glass front with a black lip, cream canopy with a black rail.
    add('fit-e1-terrarium', k => {
        box(k, E1_SLOT.cream, -.25, .25, 0, T.base, 0, T.depth);
        box(k, F.black, -.25, .25, T.base, T.base + .04, 0, T.depth + .01);
        box(k, E1_SLOT.tile, -.25, .25, T.base + .04, T.glass, 0, .02);
        box(k, F.soil, -.25, .25, T.base + .04, T.base + .1, .02, T.depth - .04);
        box(k, F.glass, -.25, .25, T.base + .04, T.glass, T.depth - .02, T.depth - .01);
        box(k, E1_SLOT.cream, -.25, .25, T.glass, T.canopy, 0, T.depth + .03);
        box(k, F.black, -.25, .25, T.glass - .005, T.glass + .04, T.depth + .03, T.depth + .045);
    });
    add('fit-e1-terrarium-end', k => box(k, E1_SLOT.cream, -.03, .03, 0, T.canopy, 0, T.depth + .03));
    // Above the canopy the wall is cream to the ceiling: stretched in x and y.
    add('fit-e1-terrarium-cap', k => box(k, E1_SLOT.cream, -.25, .25, 0, .5, 0, T.depth + .03));
    add('fit-e1-terrarium-led', k => box(k, F.lensWarm, -.25, .25, -.006, 0, -.02, .02));
    // Louvred black headboard: a back panel and eight baked slats.
    add('fit-e1-headboard', k => {
        const { width, height } = E1_BUILT_INS.headboard;
        box(k, F.black, -width / 2, width / 2, 0, height, 0, .03);
        for (let i = 0; i < 8; i++) {
            const y = .06 + i * (height - .1) / 8;
            box(k, F.black, -width / 2 + .03, width / 2 - .03, y, y + .05, .03, .07);
        }
    });
    // D-shaped cantilever nightstand: a cream slab with a rounded front on a black bracket.
    add('fit-e1-nightstand', k => {
        const { width, depth, top } = E1_BUILT_INS.nightstand;
        box(k, E1_SLOT.cream, -width / 2, width / 2, top - .08, top, 0, depth - width / 2);
        k.cylinder(E1_SLOT.cream, [0, top - .08, depth - width / 2], width / 2, .08, 12);
        box(k, F.black, -.05, .05, top - .3, top - .08, 0, .12);
    });
    // Low bed: a black plinth, a white mattress, a pale duvet over the foot, two pillows.
    add('fit-e1-bed', k => {
        const [w, d] = E1_BUILT_INS.bed;
        box(k, F.black, -w / 2 + .1, w / 2 - .1, 0, .16, .1, d - .1);
        box(k, E1_SLOT.upholstery, -w / 2, w / 2, .16, .26, 0, d);
        box(k, E1_SLOT.linen, -w / 2 + .02, w / 2 - .02, .26, .44, .02, d - .02);
        box(k, E1_SLOT.duvet, -w / 2 - .01, w / 2 + .01, .38, .47, .7, d + .01);
        for (const x of [-.42, .42]) box(k, E1_SLOT.linen, x - .33, x + .33, .44, .56, .08, .45);
    });
    // Dark desk with a light inlay border on two slab legs.
    add('fit-e1-desk', k => {
        const [w, d, h] = E1_BUILT_INS.desk;
        box(k, F.black, -w / 2, w / 2, h - .05, h, 0, d);
        for (const x of [-w / 2 + .12, w / 2 - .12]) box(k, F.black, x - .03, x + .03, 0, h - .05, .1, d - .1);
        box(k, F.ivory, -w / 2 + .05, w / 2 - .05, h, h + .002, .05, .06);
        box(k, F.ivory, -w / 2 + .05, w / 2 - .05, h, h + .002, d - .06, d - .05);
        box(k, F.ivory, -w / 2 + .05, -w / 2 + .06, h, h + .002, .06, d - .06);
        box(k, F.ivory, w / 2 - .06, w / 2 - .05, h, h + .002, .06, d - .06);
        box(k, F.lensWarm, w / 2 - .35, w / 2 - .15, h, h + .45, .15, .35);
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
    for (let i = 0; i < bays; i++) frame.place(builder, 'fit-e1-planter-bay', room, -bays / 2 + i + .5, T.base + .1 - .75, back + .02);
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
