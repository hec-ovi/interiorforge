import type { Point } from '../../core/geom.js';
import { triangulate } from '../../core/triangulate.js';
import type { Vec3 } from '../../glb/mesh-builder.js';
import type { Kit } from '../../modules/kit.js';
import { smoothSurface } from '../luxury/model-geometry.js';
import type { RecipeSet } from '../../modules/recipes.js';
import { pill } from './built-ins.js';
import type { KitchenWallSpec } from './types.js';

/** The modules of an embedded kitchen wall, drawn as joinery rather than boxes: handle-less
 *  fronts with rounded edges and 3 mm shadow gaps under recessed finger channels; a worktop
 *  section with a rounded nose (and, on a window run, a raised back ledge); an integrated
 *  pressed bowl with a ribbed drainboard and a bent tube mixer; a black glass hob with inlaid
 *  zones and a touch strip; uppers with an angled underside, framed grilles and screens;
 *  a steel kick plate on the toe. Every module keeps the size the wall placer measures
 *  (`kitchen-wall.ts`): bays one bay wide, cells 0.5 m, tiers at their spec heights. */

type Add = Parameters<RecipeSet>[0];

export interface KitchenLook {
    carcass: string; front: string; toe: string; top: string; splash: string; upper: string;
    line: string; grille: string; screen: string; panel: string; lens: string;
    /** the kick plate on the toe */
    kick: string;
    /** the bowl, mixer and hob markings */
    steel: string;
    /** hob glass */
    glass: string;
    /** horizontal grooves across the splash (E6's moulded wall), as fractions of its height */
    splashGrooves?: number[];
    /** open bottle shelves of a bar: bottle glass, dark glass */
    bottle?: [string, string];
    /** e1: two tiers (projecting tier with an angled underside, set-back vent tier); bar: one tall tier */
    uppers: 'e1' | 'bar';
}

const box = (k: Kit, slot: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
    k.box(slot, [x0, y0, z0], [x1 - x0, y1 - y0, z1 - z0]);
const bevel = (k: Kit, slot: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, r = .004) =>
    k.bevelBox(slot, [x0, y0, z0], [x1 - x0, y1 - y0, z1 - z0], r);

/** Points of an arc about (cy, cz) in the (y, z) plane, angle measured from +y towards +z. */
function arc(cy: number, cz: number, r: number, a0: number, a1: number, segments: number): Point[] {
    return Array.from({ length: segments + 1 }, (_, i) => {
        const a = a0 + (a1 - a0) * i / segments;
        return [cy + r * Math.cos(a), cz + r * Math.sin(a)] as Point;
    });
}

/** A (y, z) rectangle with rounded corners (any of bottom-front, top-front, top-back,
 *  bottom-back), traced once round. */
export function roundedSection(y0: number, y1: number, z0: number, z1: number,
    r: { bottomFront?: number; topFront?: number; topBack?: number; bottomBack?: number }, segments = 5): Point[] {
    const points: Point[] = [];
    const corner = (cy: number, cz: number, radius: number, a0: number, a1: number, sharp: Point) =>
        points.push(...(radius > 1e-6 ? arc(cy, cz, radius, a0, a1, segments) : [sharp]));
    const bf = r.bottomFront ?? 0, tf = r.topFront ?? 0, tb = r.topBack ?? 0, bb = r.bottomBack ?? 0;
    corner(y0 + bf, z1 - bf, bf, Math.PI, Math.PI / 2, [y0, z1]);
    corner(y1 - tf, z1 - tf, tf, Math.PI / 2, 0, [y1, z1]);
    corner(y1 - tb, z0 + tb, tb, 0, -Math.PI / 2, [y1, z0]);
    corner(y0 + bb, z0 + bb, bb, -Math.PI / 2, -Math.PI, [y0, z0]);
    return points;
}

/** Clip a (y, z) polygon to z0 <= z <= z1. */
function clipZ(poly: Point[], z0: number, z1: number): Point[] {
    const cut = (points: Point[], keep: (p: Point) => boolean, at: number): Point[] => {
        const out: Point[] = [];
        for (let i = 0; i < points.length; i++) {
            const a = points[i]!, b = points[(i + 1) % points.length]!;
            const ka = keep(a), kb = keep(b);
            if (ka) out.push(a);
            if (ka !== kb) { const t = (at - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, at]); }
        }
        return out;
    };
    return cut(cut(poly, p => p[1] >= z0 - 1e-9, z0), p => p[1] <= z1 + 1e-9, z1);
}

/** Rounded rectangle in plan (x, z), counter-clockwise from +x. */
function roundRect(cx: number, cz: number, w: number, d: number, r: number, segments = 6): Point[] {
    const rr = Math.min(r, w / 2 - 1e-4, d / 2 - 1e-4), out: Point[] = [];
    for (const [sx, sz, start] of [[1, 1, 0], [-1, 1, 90], [-1, -1, 180], [1, -1, 270]] as const)
        for (let i = 0; i <= segments; i++) {
            const a = (start + i * 90 / segments) * Math.PI / 180;
            out.push([cx + sx * (w / 2 - rr) + Math.cos(a) * rr, cz + sz * (d / 2 - rr) + Math.sin(a) * rr]);
        }
    return out;
}

/** A flat polygon in the plane y (facing up) or z (facing +z), with its UVs laid over the
 *  given rectangle: metres for a tiled slot, 0..1 for an exact one. */
function flat(k: Kit, slot: string, outline: Point[], plane: { y: number } | { z: number }, unitRect?: [number, number, number, number]): void {
    const area = outline.reduce((s, p, i) => { const q = outline[(i + 1) % outline.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
    const p = area < 0 ? [...outline].reverse() : outline, tris = triangulate(p);
    const [u0, v0, u1, v1] = unitRect ?? [0, 0, 1, 1];
    const uv = ([a, b]: Point) => unitRect ? [(a - u0) / (u1 - u0), 1 - (b - v0) / (v1 - v0)] : [a, b];
    if ('y' in plane) k.mesh.addSurface(slot, {
        positions: p.flatMap(([x, z]) => [x, plane.y, z]), normals: p.flatMap(() => [0, 1, 0]),
        uvs: p.flatMap(uv), indices: tris.flatMap(([a, b, c]) => [a, c, b]),
    });
    else k.mesh.addSurface(slot, {
        positions: p.flatMap(([x, y]) => [x, y, plane.z]), normals: p.flatMap(() => [0, 0, 1]),
        uvs: p.flatMap(uv), indices: tris.flatMap(([a, b, c]) => [a, b, c]),
    });
}

/** A flat ring in the plane y (an inlaid hob zone, a drain collar). */
function annulus(k: Kit, slot: string, cx: number, y: number, cz: number, r0: number, r1: number, segments = 32): void {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
        const a = i / segments * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        positions.push(cx + c * r0, y, cz + s * r0, cx + c * r1, y, cz + s * r1);
        normals.push(0, 1, 0, 0, 1, 0);
        uvs.push(c * r0, s * r0, c * r1, s * r1);
    }
    for (let i = 0; i < segments; i++) { const a = 2 * i; indices.push(a, a + 2, a + 3, a, a + 3, a + 1); }
    k.mesh.addSurface(slot, { positions, normals, uvs, indices });
}

// ---- base carcass ---------------------------------------------------------------------

/** Height of the recessed finger channel over each front. */
const CHANNEL = .032;

/** One handle-less front with the dark finger channel over it, back plane at d - 0.02. */
function frontWithChannel(k: Kit, look: KitchenLook, x0: number, x1: number, y0: number, y1: number, d: number, channel = true): void {
    bevel(k, look.front, x0, x1, y0, channel ? y1 - CHANNEL - .003 : y1, d - .02, d, .004);
    if (channel) box(k, look.line, x0 - .0015, x1 + .0015, y1 - CHANNEL, y1, d - .02, d - .016);
}

/** A carcass bay: the carcass (lowered under a sink bowl), its fronts in rows with 3 mm gaps. */
function bayFront(k: Kit, look: KitchenLook, w: number, h: number, d: number, rows: number[], split = false, carcassTop = h): void {
    box(k, look.carcass, -w / 2 + .0015, w / 2 - .0015, 0, carcassTop, 0, d - .02);
    if (carcassTop < h) for (const x of [-w / 2 + .0015, w / 2 - .0175])
        box(k, look.carcass, x, x + .016, carcassTop, h, 0, d - .02);
    let y = 0;
    for (const rh of rows) {
        for (const [x0, x1] of split ? [[-w / 2 + .0015, -.0015], [.0015, w / 2 - .0015]] : [[-w / 2 + .0015, w / 2 - .0015]])
            frontWithChannel(k, look, x0!, x1!, y + .003, y + rh, d);
        y += rh;
    }
}

// ---- worktop --------------------------------------------------------------------------

/** The worktop section (y, z): thickness t, depth td, a 22 mm rounded nose over a 10 mm
 *  eased underside; with a ledge, a raised back shelf 60 mm high and 160 mm deep. */
function worktopSection(t: number, td: number, ledge: boolean): Point[] {
    const nose = [...arc(.01, td - .01, .01, Math.PI, Math.PI / 2, 4), ...arc(t - .022, td - .022, .022, Math.PI / 2, 0, 6)];
    if (!ledge) return [...nose, [t, 0], [0, 0]];
    const [lh, ld, lr] = [.06, .16, .012];
    return [...nose, [t, ld], ...arc(t + lh - lr, ld - lr, lr, Math.PI / 2, 0, 4), [t + lh, 0], [0, 0]];
}

/** A worktop piece from x0 to x1, optionally only its z range (round a cut-out). */
function worktop(k: Kit, slot: string, t: number, td: number, ledge: boolean, x0: number, x1: number, z0 = 0, z1 = td): void {
    const section = z0 > 0 || z1 < td ? clipZ(worktopSection(t, td, ledge), z0, z1) : worktopSection(t, td, ledge);
    k.sweep(slot, section, x0, x1);
}

/** Integrated pressed bowl under a cut-out (outer w x d at the worktop top y = t), falling
 *  `depth`, with a waste. */
function bowl(k: Kit, look: KitchenLook, cx: number, cz: number, w: number, d: number, t: number, depth: number): void {
    const rings = [
        { w: w + .02, d: d + .02, y: t + .0015, r: .05 }, { w: w - .004, d: d - .004, y: t + .0015, r: .045 },
        { w: w - .012, d: d - .012, y: t - .004, r: .044 }, { w: w - .02, d: d - .02, y: t - .03, r: .046 },
        { w: w - .035, d: d - .035, y: t - depth + .03, r: .05 }, { w: w - .06, d: d - .06, y: t - depth + .004, r: .05 },
        { w: w - .09, d: d - .09, y: t - depth, r: .05 },
    ];
    const polygons = rings.map(r => roundRect(cx, cz, r.w, r.d, r.r, 5));
    const count = polygons[0]!.length, stride = count + 1, positions: number[] = [], uvs: number[] = [], indices: number[] = [], normals: number[] = [];
    let down = 0;
    for (let j = 0; j < rings.length; j++) {
        if (j) down += Math.hypot(rings[j]!.y - rings[j - 1]!.y, (rings[j]!.w - rings[j - 1]!.w) / 2);
        let along = 0;
        for (let i = 0; i <= count; i++) {
            const [x, z] = polygons[j]![i % count]!;
            if (i) { const prev = polygons[j]![(i - 1) % count]!; along += Math.hypot(x - prev[0], z - prev[1]); }
            positions.push(x, rings[j]!.y, z); uvs.push(along, down);
        }
    }
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < count; i++) {
        const a = j * stride + i, b = a + 1, c = a + stride, e = b + stride;
        indices.push(a, c, e, a, e, b);
    }
    const base = positions.length / 3;
    for (const [x, z] of polygons.at(-1)!) { positions.push(x, rings.at(-1)!.y, z); uvs.push(x, z); }
    const centre = positions.length / 3; positions.push(cx, rings.at(-1)!.y, cz); uvs.push(cx, cz);
    for (let i = 0; i < count; i++) indices.push(centre, base + (i + 1) % count, base + i);
    k.mesh.addSurface(look.steel, smoothSurface({ positions, normals, uvs, indices }));
    const floor = rings.at(-1)!.y;
    k.cylinder(look.line, [cx, floor + .0004, cz + d * .18], .024, .0008, 24);
    annulus(k, look.steel, cx, floor + .0014, cz + d * .18, .016, .026, 24);
}

/** A bent tube mixer standing at (x, y, z), its spout reaching `reach` towards +z. */
function mixer(k: Kit, slot: string, x: number, y: number, z: number, reach = .16): void {
    k.cylinder(slot, [x, y, z], .026, .012, 24);
    const r = reach / 2, rise = .2, spout: Vec3[] = [[x, y + .012, z], [x, y + rise, z]];
    for (let i = 1; i <= 16; i++) { const a = i / 16 * Math.PI; spout.push([x, y + rise + Math.sin(a) * r, z + r - Math.cos(a) * r]); }
    spout.push([x, y + rise - .025, z + reach]);
    k.tube(slot, spout, .0115, false, 16);
    k.tube(slot, [[x + .014, y + .09, z], [x + .05, y + .13, z - .012]], .0055, false, 12);
}

// ---- recipes --------------------------------------------------------------------------

export function kitchenRecipes(sid: string, look: KitchenLook, spec: KitchenWallSpec, ledgeWorktops = false): RecipeSet {
    const w = spec.bay, h = spec.base.height, d = spec.base.depth, t = spec.worktop.thickness, td = spec.worktop.depth;
    const id = (name: string) => `fit-${sid}-kitchen-${name}`;
    return (add: Add) => {
        // Toe: a dark plinth set back, a brushed kick plate on its face.
        add(id('toe'), k => {
            const face = d - spec.toe.setback;
            box(k, look.toe, -.25, .25, 0, spec.toe.height, 0, face - .012);
            k.sweep(look.kick, roundedSection(.004, spec.toe.height - .002, face - .012, face, { topFront: .004, bottomFront: .002 }, 3), -.25, .25);
        });
        add(id('door'), k => bayFront(k, look, w, h, d, [h]));
        add(id('sink-base'), k => bayFront(k, look, w, h, d, [h], true, h - .12));
        add(id('drawers'), k => bayFront(k, look, w, h, d, [.2, .24, h - .44]));
        add(id('display'), k => {
            bayFront(k, look, w, h, d, [h]);
            bevel(k, look.line, -.235, .235, .37, .62, d, d + .006, .004);
            box(k, look.screen, -.22, .22, .385, .605, d + .006, d + .0072);
            for (const x of [-.12, -.06, 0, .06, .12]) bevel(k, look.line, x - .02, x + .02, .3, .316, d, d + .004, .0018);
        });
        add(id('filler'), k => {
            box(k, look.carcass, -.25, .25, 0, h - CHANNEL - .003, 0, d);
            box(k, look.carcass, -.25, .25, h - CHANNEL, h, 0, d - .02);
            box(k, look.line, -.25, .25, h - CHANNEL, h, d - .02, d - .016);
        });
        add(id('end'), k => bevel(k, look.carcass, -spec.base.endWidth / 2, spec.base.endWidth / 2, 0, spec.toe.height + h, 0, td, .006));
        for (const ledge of ledgeWorktops ? [false, true] : [false]) {
            const tag = ledge ? '-ledge' : '';
            add(id(`top${tag}`), k => worktop(k, look.top, t, td, ledge, -.25, .25));
            add(id(`top-sink${tag}`), k => {
                // A real aperture: the section round the bowl, the pressed bowl, a ribbed
                // drainboard beside it and a bent tube mixer behind it.
                const cx = -.04, bw = .4, z0 = ledge ? .2 : .145, z1 = .495, cz = (z0 + z1) / 2;
                worktop(k, look.top, t, td, ledge, -w / 2, cx - bw / 2);
                worktop(k, look.top, t, td, ledge, cx + bw / 2, w / 2);
                worktop(k, look.top, t, td, ledge, cx - bw / 2, cx + bw / 2, 0, z0);
                worktop(k, look.top, t, td, ledge, cx - bw / 2, cx + bw / 2, z1, td);
                bowl(k, look, cx, cz, bw, z1 - z0, t, .18);
                for (let i = 0; i < 4; i++) {
                    const x = cx + bw / 2 + .03 + i * .024;
                    k.tube(look.steel, [[x, t + .0005, z0 + .02], [x, t + .0005, z1 - .02]], .0028, false, 8);
                }
                mixer(k, look.steel, cx, ledge ? t + .06 : t, ledge ? .08 : .07, ledge ? .2 : .16);
            });
            add(id(`top-hob${tag}`), k => {
                worktop(k, look.top, t, td, ledge, -w / 2, w / 2);
                const z0 = ledge ? .19 : .07, z1 = .6, cz = (z0 + z1) / 2;
                bevel(k, look.glass, -.285, .285, t - .002, t + .005, z0, z1, .003);
                for (const [x, z, r] of [[-.13, cz - .01, .1], [.15, cz - .085, .068], [.15, cz + .085, .075]] as const) {
                    annulus(k, look.steel, x, t + .0052, z, r - .003, r, 40);
                    annulus(k, look.steel, x, t + .0052, z, r * .45 - .002, r * .45, 24);
                }
                for (let i = 0; i < 6; i++) k.box(look.steel, [-.1 + i * .04 - .006, t + .005, z1 - .03], [.012, .0006, .012]);
                box(k, look.lens, -.16, -.11, t + .005, t + .0056, z1 - .028, z1 - .024);
            });
        }
        add(id('splash'), k => {
            bevel(k, look.splash, -.25, .25, 0, .5, 0, .012, .002);
            for (const f of look.splashGrooves ?? []) box(k, look.line, -.25, .25, .5 * f - .003, .5 * f + .003, .0115, .0125);
        });
        add(id('lens'), k => box(k, look.lens, -.25, .25, -.008, 0, -.015, .015));
        const half = w / 2 - .0015;
        if (look.uppers === 'e1') {
            // Lower tier: a recessed band, an angled underside, a rounded front edge.
            const tierA = (k: Kit) => {
                k.sweep(look.upper, [[0, 0], ...arc(.008, .352, .008, Math.PI, Math.PI / 2, 3), [.07, .36], [.07, .47], [.12, .52],
                    ...arc(.418, .508, .012, Math.PI / 2, 0, 4), [.43, 0]], -half, half);
                box(k, look.line, -half, half, .0685, .0701, .37, .46);
            };
            add(id('upper-a'), tierA);
            add(id('upper-a-grille'), k => {
                tierA(k);
                const outline: Point[] = [[-.24, .17], [.08, .17], [.13, .24], [.24, .24], [.24, .35], [-.24, .35]];
                flat(k, look.grille, outline, { z: .5212 }, [-.24, .17, .24, .35]);
                k.tube(look.line, outline.map(([x, y]) => [x, y, .5215] as Vec3), .0045, true, 8);
            });
            add(id('upper-a-screen'), k => {
                tierA(k);
                bevel(k, look.line, -.115, .115, .13, .36, .518, .526, .004);
                k.box(look.panel, [-.1, .145, .526], [.2, .2, .0012], 'unit', ['north']);
            });
            // Upper tier: set back, rounded front edges, slot vents.
            const tierB = (k: Kit) => k.sweep(look.upper, roundedSection(0, .3, 0, .4, { bottomFront: .008, topFront: .008 }, 3), -half, half);
            add(id('upper-b'), tierB);
            add(id('upper-b-vent'), k => {
                tierB(k);
                for (const y of [.12, .15, .18]) {
                    const slot = pill(0, y, .2, .013, 5);
                    flat(k, look.line, slot, { z: .4012 });
                }
            });
        } else {
            // One tall tier: panels with rounded fronts, screen bays and open bottle shelves.
            const tier = (k: Kit) => k.sweep(look.upper, roundedSection(0, .9, 0, .35, { bottomFront: .006, topFront: .006 }, 3), -half, half);
            add(id('upper-a'), tier);
            add(id('upper-a-screen'), k => {
                tier(k);
                bevel(k, look.line, -.245, .245, .19, .73, .348, .356, .005);
                k.box(look.screen, [-.23, .205, .356], [.46, .51, .0012], 'unit', ['north']);
            });
            add(id('upper-a-shelf'), k => {
                bevel(k, look.upper, -half, half, 0, .9, 0, .03, .003);
                for (const x of [-half, half - .02]) bevel(k, look.upper, x, x + .02, 0, .9, .03, .35, .003);
                for (const y of [0, .3, .6, .88]) bevel(k, look.upper, -half + .02, half - .02, y, y + .02, .03, .35, .003);
                box(k, look.lens, -half + .03, half - .03, .876, .88, .28, .3);
                const [clear, dark] = look.bottle ?? [look.glass, look.glass];
                // Four bottles on the upper shelf, three tumblers below.
                const bottle: [number, number][] = [[0, 0], [.034, 0], [.036, .008], [.036, .15], [.029, .172], [.012, .19], [.011, .238], [.013, .24], [.013, .248], [0, .248]];
                for (let i = 0; i < 4; i++) k.turned(i % 2 ? dark : clear, [-.18 + i * .12, .62, .2 - (i % 2) * .05], bottle.map(([r, y]) => [r * (1 - (i % 3) * .08), y * (1 - (i % 2) * .12)] as [number, number]), 20);
                const tumbler: [number, number][] = [[0, 0], [.035, 0], [.036, .01], [.038, .09], [.034, .09], [.032, .012], [0, .012]];
                for (let i = 0; i < 3; i++) k.turned(look.glass, [-.12 + i * .12, .32, .19], tumbler, 20);
            });
        }
        add(id('bulkhead'), k => box(k, look.upper, -.25, .25, 0, .5, 0, look.uppers === 'e1' ? .4 : .35));
        // Stepped service column (0.9 wide): cabinet, screen body, stepped box, top to ceiling.
        const cw = spec.column?.width ?? .9, cHalf = cw / 2 - .0015;
        add(id('column-base'), k => bayFront(k, look, cw, spec.worktop.top, .65, [spec.worktop.top], true));
        // The column stays inside the worktop depth: the record reserves no more.
        add(id('column-mid'), k => {
            box(k, look.line, -cHalf + .004, cHalf - .004, .44, .464, 0, td - .012);
            bevel(k, look.upper, -cHalf, cHalf, 0, .45, 0, td, .006);
            bevel(k, look.upper, -cHalf, cHalf, .454, .9, 0, td, .006);
        });
        add(id('column-top'), k => box(k, look.upper, -cHalf, cHalf, 0, .5, 0, td - .15));
        // Mounted on the column front (the record's front edge), 5 mm proud.
        add(`wall-screen-${sid}-kitchen`, k => {
            bevel(k, look.line, -.13, .13, 0, .34, 0, .004, .0035);
            k.box(look.panel, [-.12, .01, .004], [.24, .32, .001], 'unit', ['north']);
        });
    };
}
