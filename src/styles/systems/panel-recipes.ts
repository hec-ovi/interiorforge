import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { LitJoint, PanelProfile, PanelSystem } from './types.js';
import { bevelSlab, extrude, facing, roundedSection } from './surface-shapes.js';

/** Panel-system modules, drawn from a profile. A column is one panel cell of the pitch
 *  (`pitch − seam` wide) from the floor or skirting to `rows`: its horizontal seams, bevels
 *  and fixings are baked, so it is always placed at scale 1. The top piece carries the same
 *  rounded section from `rows` to the head and only ever stretches in y. Fill and edge close
 *  cut cells; head and foot bands and lit-joint lenses are fixed sections stretched along
 *  the run. Group modules (`<column>x2` … `x4`, and the same tops) hold up to four equal
 *  cells with their seams, so a run spends one column and one top placement per group. */

const CELL = .5;
/** Half the width of an edge bullnose; the placer centres it this far inside a cut side. */
export const EDGE_HALF = .008;
/** Lens section of a lit joint: 12 mm tall, 12 mm deep, centred on its record. */
const LENS = .012;

/** Most equal cells one column or top module holds. */
export const MAX_GROUP = 4;
/** Group modules panelRecipes drew, so the placer only asks for groups that exist. */
export const GROUPED_COLUMNS = new Set<string>();
/** The module of `n` equal cells side by side: the column itself for one. */
export const groupOf = (id: string, n: number): string => n === 1 ? id : `${id}x${n}`;
export const pairOf = (id: string): string => groupOf(id, 2);

export interface PanelRecipeOptions {
    /** a lower skin for pieces ending at or below `to` (a dado, a stone course) */
    lower?: { to: number; skin: string };
    /** lens slot of a lit joint; by default from its colour and kelvin */
    lens?: (joint: LitJoint) => string;
}

/** Module ids of a panel system named by the shared convention (`wall-field-<sid>` marker,
 *  `wall-panel-<sid>-*` pieces, `wall-light-line-<sid>` lenses). */
export function panelIds(sid: string) {
    const cm = (w: number) => String(Math.round(w * 100));
    return {
        marker: `wall-field-${sid}`, backing: `wall-panel-${sid}-backing`,
        column: (w: number) => `wall-panel-${sid}-col${cm(w)}`, top: (w: number) => `wall-panel-${sid}-top${cm(w)}`,
        fill: `wall-panel-${sid}-fill`, edge: `wall-panel-${sid}-edge`,
        head: `wall-panel-${sid}-head`, foot: `wall-panel-${sid}-foot`, line: `wall-light-line-${sid}`,
    };
}

/** The lit lens slot of a joint: a coloured record wears the matching coloured lens. */
export function lensSlot(joint: Pick<LitJoint, 'color' | 'kelvin'>): string {
    const c = joint.color;
    if (c) {
        if (c[0] > .8 && c[1] < .2 && c[2] < .2) return 'cyberpunk/light-fixture/rich#loft-red';
        if (c[0] > .8 && c[1] >= .2 && c[2] < .3) return 'cyberpunk/light-fixture/rich#corpo-amber';
        return F.lensCool;
    }
    return joint.kelvin >= 3500 ? F.lensCool : F.lensWarm;
}

/** Depth the panel skin starts at: behind the backing face when the bevel needs the room. */
function skinBack(profile: PanelProfile): number {
    return Math.min(profile.depth[0], profile.depth[1] - profile.bevel.radius - .003);
}

/** The column, top, fill, edge, head, foot and lens modules of one panel system, plus its
 *  backing when the profile names a backing slot. Never the marker `spec.id`
 *  (`panelMarker` draws that). */
export function panelRecipes(spec: PanelSystem, profile: PanelProfile, options: PanelRecipeOptions = {}): RecipeSet {
    const widths = [...new Set(spec.pitch)];
    // Groups only for a width the pitch repeats back to back (a single-width pitch always does).
    const groupable = (w: number) => spec.pitch.some((p, i) => p === w && spec.pitch[(i + 1) % spec.pitch.length] === w);
    for (const w of widths) if (groupable(w)) for (let n = 2; n <= MAX_GROUP; n++) GROUPED_COLUMNS.add(groupOf(spec.column(w), n));
    const back = skinBack(profile), front = profile.depth[1];
    return add => {
        if (profile.backing) add(spec.backing, k => k.box(profile.backing!, [-CELL / 2, 0, 0], [CELL, CELL, profile.depth[0]], undefined,
            ['north', 'east', 'west', 'top', 'bottom']));
        for (const w of widths) {
            add(spec.column(w), k => column(k, spec, profile, options, w, [0]));
            add(spec.top(w), k => top(k, spec, profile, w, [0]));
            for (let n = 2; n <= MAX_GROUP && groupable(w); n++) {
                const centres = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * w);
                add(groupOf(spec.column(w), n), k => column(k, spec, profile, options, w, centres));
                add(groupOf(spec.top(w), n), k => top(k, spec, profile, w, centres));
            }
        }
        add(spec.fill, k => k.box(profile.skin, [-CELL / 2, 0, back], [CELL, CELL, front - back], undefined,
            ['north', 'east', 'west', 'top', 'bottom']));
        if (spec.edge) add(spec.edge, k => extrude(k, profile.skin,
            roundedSection(EDGE_HALF, back, front + .0015, EDGE_HALF, Math.max(2, profile.bevel.segments)), 0, CELL, back));
        if (spec.head && spec.head.module !== spec.backing) {
            const band = profile.head ?? { slot: F.black, depth: profile.depth[0] + .002 };
            const z = Math.max(band.depth, profile.depth[0] + .002), h = spec.head.height;
            add(spec.head.module, k => k.box(band.slot, [-CELL / 2, 0, 0], [CELL, h, z], undefined, ['north', 'bottom', 'east', 'west']));
        }
        if (spec.foot) {
            const band = profile.foot ?? { slot: F.black, depth: front + .004 };
            const h = spec.foot.height;
            add(spec.foot.module, k => k.box(band.slot, [-CELL / 2, 0, 0], [CELL, h, Math.max(band.depth, front + .001)], undefined,
                ['north', 'top', 'east', 'west']));
        }
        const lenses = new Map<string, LitJoint>();
        for (const joint of [...(spec.litJoints ?? []), ...(spec.head?.lens ? [spec.head.lens] : [])]) lenses.set(joint.module, joint);
        for (const [id, joint] of lenses) add(id, k => k.box((options.lens ?? lensSlot)(joint), [-CELL / 2, -LENS / 2, -LENS / 2], [CELL, LENS, LENS],
            undefined, ['north', 'top', 'bottom', 'east', 'west']));
    };
}

/** The marker `wall-field-<sid>`: a closed plain field in the panel skin, full wall depth,
 *  for leftovers, sealed voids and any consumer that places the marker raw. */
export function panelMarker(spec: PanelSystem, profile: PanelProfile): RecipeSet {
    return add => add(spec.id, k => k.cbox(profile.skin, [0, 0, profile.depth[1] / 2], [CELL, CELL, profile.depth[1]]));
}

/** One column cell (or a pair of cells at `centres`): stacked rounded panels between the
 *  profile's horizontal seams up to `rows`, a recessed seam strip in every gap, and the
 *  fixings at each panel corner that meets a seam or the floor. */
function column(k: Kit, spec: PanelSystem, profile: PanelProfile, options: PanelRecipeOptions, w: number, centres: number[]): void {
    const half = (w - spec.seam) / 2, back = skinBack(profile), front = profile.depth[1];
    const seams = profile.seams.filter(s => s.y > .02 && s.y <= spec.rows + 1e-6).sort((a, b) => a.y - b.y);
    const pieces: { y0: number; y1: number; top: boolean }[] = [];
    const strips: { y0: number; y1: number; slot: string }[] = [];
    let start = 0;
    for (const s of seams) {
        const atTop = Math.abs(s.y - spec.rows) < 1e-6;
        const lo = atTop ? s.y - s.width : s.y - s.width / 2, hi = atTop ? s.y : s.y + s.width / 2;
        if (lo > start + 1e-4) pieces.push({ y0: start, y1: lo, top: true });
        strips.push({ y0: lo, y1: hi, slot: s.slot });
        start = hi;
    }
    // Without a seam at `rows` the last panel runs on into the top piece.
    if (spec.rows > start + 1e-4) pieces.push({ y0: start, y1: spec.rows, top: false });
    const seamAtTop = seams.some(s => Math.abs(s.y - spec.rows) < 1e-6);
    for (const cx of centres) {
        for (const piece of pieces) {
            const slot = options.lower && piece.y1 <= options.lower.to + 1e-6 ? options.lower.skin : profile.skin;
            bevelSlab(k, slot, [cx - half, cx + half], [piece.y0, piece.y1], back, front, profile.bevel, { bottom: true, top: piece.top });
        }
        for (const strip of strips)
            facing(k, strip.slot, [[cx - half, strip.y0, front - .003], [cx + half, strip.y0, front - .003],
                [cx + half, strip.y1, front - .003], [cx - half, strip.y1, front - .003]], [0, 0, 1]);
        const fix = profile.fixings;
        if (!fix) continue;
        const heights: number[] = [];
        for (const piece of pieces) {
            heights.push(piece.y0 + fix.inset[1]);
            if (piece.top) heights.push(piece.y1 - fix.inset[1]);
        }
        // The top piece stretches, so its lower corners' fixings live here, just above rows.
        if (seamAtTop) heights.push(spec.rows + fix.inset[1]);
        // A pill is a flat plate 1.5 mm proud of the face: two triangles, no sides.
        const pw = fix.radius, ph = 2.25 * fix.radius, z = front + .0015;
        for (const y of heights) for (const side of [-1, 1]) for (let n = 0; n < Math.max(1, fix.pairs); n++) {
            const x = cx + side * (half - fix.inset[0] - n * 3 * fix.radius);
            facing(k, fix.slot, [[x - pw, y - ph, z], [x + pw, y - ph, z], [x + pw, y + ph, z], [x - pw, y + ph, z]], [0, 0, 1]);
        }
    }
}

/** The top piece of one cell (or a pair): the column's rounded section extruded over one
 *  cell height, stretched in y by the placer; no caps (the head band and seam hide them). */
function top(k: Kit, spec: PanelSystem, profile: PanelProfile, w: number, centres: number[]): void {
    const half = (w - spec.seam) / 2, back = skinBack(profile);
    const section = roundedSection(half, back, profile.depth[1], profile.bevel.radius, profile.bevel.segments);
    for (const cx of centres) extrude(k, profile.skin, section.map(([x, z]) => [x + cx, z]), 0, CELL, back);
}

// ---------------------------------------------------------------------------------------
// Per-kind presets from the reference interiors. A kind package names its style id and
// overrides what its plan measures; the preset returns the spec, the profile and every
// module (marker included) the kind adds to its `recipes`.

export type PanelPresetName = 'A' | 'A-bed' | 'B' | 'B-stone' | 'C' | 'C-capsule' | 'R';

export interface PanelPreset {
    system: PanelSystem;
    profile: PanelProfile;
    options: PanelRecipeOptions;
    /** marker + pieces */
    recipes: RecipeSet;
}

const SLOT = {
    cream: 'cyberpunk/ivory-panel/rich#meridian-satin',
    smoked: 'cyberpunk/corpo-plaza-veneer/rich#smoked',
    walnut: 'cyberpunk/corpo-plaza-veneer/rich#walnut',
    darkStone: 'cyberpunk/corpo-plaza-stone/rich#polished',
    worn: 'cyberpunk/interior-damaged-wall/poor#field',
    petrol: 'cyberpunk/interior-service-enamel/poor#petrol',
    gunmetal: 'cyberpunk/interior-service-gunmetal/poor#aged',
    enamel: 'cyberpunk/interior-capsule-enamel/mid#ivory',
    enamelPetrol: 'cyberpunk/interior-capsule-enamel/mid#petrol',
} as const;

/** A preset panel system for one style id. Overrides replace whole fields of the spec or
 *  the profile (ids always follow `panelIds(sid)`). */
export function panelPreset(name: PanelPresetName, sid: string,
    overrides: { system?: Partial<Omit<PanelSystem, 'id' | 'column' | 'top'>>; profile?: Partial<PanelProfile>; options?: PanelRecipeOptions } = {}): PanelPreset {
    const ids = panelIds(sid);
    const base = presetBase(name, ids);
    const system: PanelSystem = { ...base.system, ...overrides.system, id: ids.marker, column: ids.column, top: ids.top };
    const profile: PanelProfile = { ...base.profile, ...overrides.profile };
    const options: PanelRecipeOptions = { ...base.options, ...overrides.options };
    const marker = panelMarker(system, profile), pieces = panelRecipes(system, profile, options);
    return { system, profile, options, recipes: add => { marker(add); pieces(add); } };
}

type Ids = ReturnType<typeof panelIds>;
type Base = { system: Omit<PanelSystem, 'id' | 'column' | 'top'>; profile: PanelProfile; options: PanelRecipeOptions };

function presetBase(name: PanelPresetName, ids: Ids): Base {
    switch (name) {
        // E1 suite: cream full-height panels on the metre, thin dark seams at 1.2 and 2.15 m,
        // rounded vertical edges, a pill fixing at every panel corner meeting a seam, the black
        // backing left bare as the recessed head band under the ceiling, and no skirting.
        case 'A': return {
            system: { backing: 'wall-field-meridian-backing', pitch: [1], phase: 'grid', rows: 2.15, fill: ids.fill,
                seam: .006, head: { height: .22, module: 'wall-field-meridian-backing' }, foot: null, minColumn: .3 },
            profile: { skin: SLOT.cream, bevel: { radius: .01, segments: 3 },
                seams: [{ y: 1.2, width: .006, slot: F.black }, { y: 2.15, width: .006, slot: F.black }],
                fixings: { inset: [.035, .045], radius: .005, slot: F.black, pairs: 1 }, depth: [.088, .095],
                head: { slot: F.black, depth: .091 } },
            options: {},
        };
        // E1 bedroom: full-height panels in a 0.5/1.0/0.7 m rhythm, no horizontal seams.
        case 'A-bed': return {
            system: { backing: 'wall-field-meridian-backing', pitch: [.5, 1, .7], exact: true, phase: 'grid', rows: 2, fill: ids.fill,
                seam: .006, head: { height: .22, module: 'wall-field-meridian-backing' }, foot: null, minColumn: .25 },
            profile: { skin: SLOT.cream, bevel: { radius: .01, segments: 3 }, seams: [],
                fixings: { inset: [.035, .045], radius: .005, slot: F.black, pairs: 1 }, depth: [.088, .095],
                head: { slot: F.black, depth: .091 } },
            options: {},
        };
        // Glass building (B3/B2): dark smoked veneer panels on the metre, bronze joints (the
        // backing shows gold in every seam and as a reveal under the ceiling).
        case 'B': return {
            system: { backing: ids.backing, pitch: [1], phase: 'grid', rows: 2, fill: ids.fill, seam: .004,
                head: { height: .035, module: ids.backing }, foot: null, minColumn: .3 },
            profile: { skin: SLOT.smoked, backing: F.bronze, bevel: { radius: .003, segments: 1 }, seams: [], depth: [.086, .095],
                head: { slot: F.bronze, depth: .097 } },
            options: {},
        };
        // Glass building lobby (B1): polished stone to 1.2 m under a bronze course, walnut
        // above, 1.5 m bays, a black skirting.
        case 'B-stone': return {
            system: { backing: ids.backing, pitch: [1.5], phase: 'grid', rows: 1.2, fill: ids.fill, seam: .004,
                head: { height: .035, module: ids.backing }, foot: { height: .06, module: ids.foot }, minColumn: .4 },
            profile: { skin: SLOT.walnut, backing: F.black, bevel: { radius: .003, segments: 1 },
                seams: [{ y: 1.2, width: .03, slot: F.bronze }], depth: [.086, .095],
                head: { slot: F.bronze, depth: .097 }, foot: { slot: F.black, depth: .1 } },
            options: { lower: { to: 1.2, skin: SLOT.darkStone } },
        };
        // Poor building (C2-C6): 1.5 m worn plates, petrol enamel dado to 1.15 m under a
        // gunmetal course, worn paint above, gunmetal joints, rivets and skirting, unlit.
        case 'C': return {
            system: { backing: ids.backing, pitch: [1.5], phase: 'grid', rows: 1.15, fill: ids.fill, seam: .008,
                foot: { height: .1, module: ids.foot }, minColumn: .4 },
            profile: { skin: SLOT.worn, backing: SLOT.gunmetal, bevel: { radius: .004, segments: 1 },
                seams: [{ y: 1.15, width: .03, slot: SLOT.gunmetal }],
                fixings: { inset: [.03, .03], radius: .005, slot: SLOT.gunmetal, pairs: 1 }, depth: [.084, .095],
                foot: { slot: SLOT.gunmetal, depth: .1 } },
            options: { lower: { to: 1.15, skin: SLOT.petrol } },
        };
        // Capsule homes in the poor building (C1/C7): rounded ivory enamel plates on 1.5 m,
        // a low petrol course, a seam at 2.1 m and a dark recessed band under the ceiling.
        case 'C-capsule': return {
            system: { backing: 'wall-field-meridian-backing', pitch: [1.5], phase: 'grid', rows: 2.1, fill: ids.fill,
                seam: .008, head: { height: .12, module: 'wall-field-meridian-backing' }, foot: null, minColumn: .4 },
            profile: { skin: SLOT.enamel, bevel: { radius: .012, segments: 3 },
                seams: [{ y: .3, width: .008, slot: SLOT.gunmetal }, { y: 2.1, width: .008, slot: F.black }],
                fixings: { inset: [.04, .04], radius: .005, slot: SLOT.gunmetal, pairs: 1 }, depth: [.088, .095],
                head: { slot: SLOT.enamelPetrol, depth: .092 } },
            options: { lower: { to: .3, skin: SLOT.enamelPetrol } },
        };
        // Rich office (R1): dark smoked timber in 1.5 m bays with bronze inlaid joints, a
        // black base with a red floor line, a bronze reveal at the ceiling.
        case 'R': return {
            system: { backing: ids.backing, pitch: [1.5], phase: 'grid', rows: 2, fill: ids.fill, seam: .005,
                head: { height: .03, module: ids.backing }, foot: { height: .05, module: ids.foot }, minColumn: .4,
                litJoints: [{ module: ids.line, y: 'foot', facing: 'down', lumensPerMetre: 12, kelvin: 2700, color: [1, .035, .022], proud: .1 }] },
            profile: { skin: SLOT.smoked, backing: F.bronze, bevel: { radius: .003, segments: 1 }, seams: [], depth: [.086, .095],
                head: { slot: F.black, depth: .088 }, foot: { slot: F.black, depth: .1 } },
            options: {},
        };
    }
}
