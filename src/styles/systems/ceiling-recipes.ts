import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { CeilingSystem, LitJoint } from './types.js';
import { lensSlot } from './panel-recipes.js';
import { facing } from './surface-shapes.js';
import { gridModules } from './surface-grid.js';

/** Ceiling-system modules, drawn from a profile. Ceiling pieces rise from the datum y = 0
 *  (their underside is the finished ceiling): cell panels are `thickness` deep with joints
 *  showing the backing above them; a whole block bevels its panel edges, rows, columns and
 *  cells (which stretch) stay square. Bands, fascias and lenses are fixed sections stretched
 *  along their run; corners never stretch. */

const CELL = .5;

export interface CeilingProfile {
    /** cell panel skin */
    panel: string;
    /** what the joints show */
    backing: string;
    /** panel depth above the datum */
    thickness?: number;
    /** chamfer on the panel edges of whole blocks */
    bevel?: number;
    /** reveal band skin */
    perimeter?: string;
    /** stepped ring soffit and fascia skin */
    step?: string;
    /** coffer side skin */
    coffer?: string;
    /** luminous field bezel */
    field?: string;
    lens?: (joint: LitJoint) => string;
}

/** A panel hanging from the datum: underside at y = 0, `t` deep; its underside edges
 *  chamfered by `bevel` when it never stretches. */
function panel(k: Kit, slot: string, [cx, cz]: [number, number], [w, d]: [number, number], t: number, bevel: number): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, b = Math.min(bevel, w / 4, d / 4, t / 2);
    k.box(slot, [x0, b, z0], [w, t - b, d], undefined, ['north', 'south', 'east', 'west']);
    if (b < 1e-5) { k.box(slot, [x0, 0, z0], [w, t, d], undefined, ['bottom']); return; }
    k.box(slot, [x0 + b, 0, z0 + b], [w - 2 * b, 0, d - 2 * b], undefined, ['bottom']);
    const out = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], inn = [[x0 + b, z0 + b], [x1 - b, z0 + b], [x1 - b, z1 - b], [x0 + b, z1 - b]];
    const normals: [number, number, number][] = [[0, -1, -1], [1, -1, 0], [0, -1, 1], [-1, -1, 0]];
    for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        facing(k, slot, [[out[i]![0]!, b, out[i]![1]!], [out[j]![0]!, b, out[j]![1]!], [inn[j]![0]!, 0, inn[j]![1]!], [inn[i]![0]!, 0, inn[i]![1]!]], normals[i]!);
    }
}

/** Cells of a block, a row, a column or one cell, centred on the piece. */
function cells(k: Kit, slot: string, [pu, pv]: [number, number], [nu, nv]: [number, number], joint: number, t: number, bevel: number): void {
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++)
        panel(k, slot, [(i - (nu - 1) / 2) * pu, (j - (nv - 1) / 2) * pv], [pu - joint, pv - joint], t, bevel);
}

/** The backing, grid, perimeter, step, coffer, field and lens modules of one ceiling system.
 *  Never the marker `spec.id` (`ceilingMarker` draws that). */
export function ceilingRecipes(spec: CeilingSystem, profile: CeilingProfile): RecipeSet {
    const t = profile.thickness ?? .03, bevel = profile.bevel ?? 0, g = spec.grid;
    const [cu, cv] = g.blockCells;
    return add => {
        add(spec.backing, k => k.cbox(profile.backing, [0, t + .004, 0], [CELL, .006, CELL], undefined, ['bottom']));
        // Only the whole block keeps its bevels: the others stretch.
        for (const piece of gridModules(g.block, g.blockCells))
            add(piece.id, k => cells(k, profile.panel, g.pitch, piece.cells, g.joint, t, piece.id === g.block ? bevel : 0));
        const lenses = new Map<string, LitJoint>();
        const p = spec.perimeter;
        if (p) {
            const slot = profile.perimeter ?? F.black, low = -p.drop, high = Math.max(t + .004, low + .004);
            add(p.edge, k => {
                k.box(slot, [-CELL / 2, low, 0], [CELL, high - low, p.width], undefined, ['bottom']);
                // A band hanging below the panels shows its inner face; a recessed one hides it.
                if (low < -1e-4) k.box(slot, [-CELL / 2, low, 0], [CELL, -low, p.width], undefined, ['north']);
            });
            add(p.corner, k => k.box(slot, [0, low, 0], [p.width, high - low, p.width], undefined, ['bottom']));
            if (p.lens) lenses.set(p.lens.module, p.lens);
        }
        for (const step of spec.steps ?? []) {
            const slot = profile.step ?? profile.panel;
            add(`${step.fascia}-soffit`, k => k.cbox(slot, [0, 0, 0], [CELL, .02, CELL], undefined, ['bottom']));
            add(step.fascia, k => k.box(slot, [-CELL / 2, 0, -.02], [CELL, step.drop, .02], undefined, ['north']));
            if (step.lens) lenses.set(step.lens.module, step.lens);
        }
        const c = spec.coffers;
        if (c) {
            const slot = profile.coffer ?? profile.panel;
            add(c.edge, k => k.box(slot, [-CELL / 2, 0, -.02], [CELL, c.rise, .02], undefined, ['north']));
            add(c.corner, k => k.box(slot, [-.01, 0, -.01], [.02, c.rise, .02], undefined, ['north', 'east', 'south', 'west']));
            if (c.lens) lenses.set(c.lens.module, c.lens);
        }
        const f = spec.fields;
        if (f) {
            const [bu, bv] = [g.pitch[0] * cu - g.joint, g.pitch[1] * cv - g.joint], rim = .03, bezel = profile.field ?? F.black;
            add(f.module, k => {
                // A recessed diffuser inside a bezel the size of one block.
                for (const s of [-1, 1]) {
                    k.cbox(bezel, [s * (bu / 2 - rim / 2), 0, 0], [rim, t, bv], undefined, ['bottom', 'north', 'south', 'east', 'west']);
                    k.cbox(bezel, [0, 0, s * (bv / 2 - rim / 2)], [bu - 2 * rim, t, rim], undefined, ['bottom', 'north', 'south', 'east', 'west']);
                }
                k.cbox(F.lensWarm, [0, t * .6, 0], [bu - 2 * rim, .004, bv - 2 * rim], undefined, ['bottom']);
            });
        }
        for (const [id, joint] of lenses) add(id, k => k.box((profile.lens ?? lensSlot)(joint), [-CELL / 2, -.006, -.015], [CELL, .012, .03],
            undefined, ['bottom', 'top', 'north', 'south']));
    };
}

/** The marker `ceiling-field-<sid>`: a plain ceiling field for leftovers and sealed voids. */
export function ceilingMarker(spec: CeilingSystem, profile: CeilingProfile): RecipeSet {
    return add => add(spec.id, k => k.cbox(profile.panel, [0, .04, 0], [CELL, .06, CELL], undefined, ['bottom', 'north', 'south', 'east', 'west']));
}

export type CeilingPresetName = 'A' | 'A-fields' | 'B' | 'C' | 'R';

export interface CeilingPreset { system: CeilingSystem; profile: CeilingProfile; recipes: RecipeSet }

const SLOT = {
    gloss: 'cyberpunk/gutierrez-lacquer/rich#ink',
    satin: 'cyberpunk/interior-alloy/rich#satin-fine',
    smoked: 'cyberpunk/corpo-plaza-veneer/rich#smoked',
    walnut: 'cyberpunk/corpo-plaza-veneer/rich#walnut',
    worn: 'cyberpunk/interior-damaged-ceiling/poor#field',
    gunmetal: 'cyberpunk/interior-service-gunmetal/poor#aged',
} as const;

/** A preset ceiling system for one style id; ids `ceiling-field-<sid>` (marker),
 *  `ceiling-<sid>-*` (pieces), `ceiling-cove-<sid>-*` (lenses and fields). */
export function ceilingPreset(name: CeilingPresetName, sid: string, overrides: { system?: Partial<Omit<CeilingSystem, 'id'>>; profile?: Partial<CeilingProfile> } = {}): CeilingPreset {
    const id = `ceiling-field-${sid}`, piece = (n: string) => `ceiling-${sid}-${n}`, cove = (n: string) => `ceiling-cove-${sid}-${n}`;
    const base: Record<CeilingPresetName, { system: Omit<CeilingSystem, 'id'>; profile: CeilingProfile }> = {
        // E1: dark gloss square panels on the metre, 3 × 3 per block, symmetric in the room,
        // light satin joints, a black reveal recessed 30 mm along the walls, spots on cells.
        'A': { system: { backing: piece('backing'), grid: { pitch: [1, 1], block: piece('grid1x1'), blockCells: [3, 3], joint: .008, phase: 'room-centre' },
                perimeter: { width: .22, drop: -.03, edge: piece('reveal'), corner: piece('reveal-corner') }, snapSpots: true },
            profile: { panel: SLOT.gloss, backing: SLOT.satin, bevel: .004, perimeter: F.black } },
        // E2 public: dark 1.5 m fields with a luminous field every third block.
        'A-fields': { system: { backing: piece('backing'), grid: { pitch: [1.5, 1.5], block: piece('grid15'), blockCells: [1, 1], joint: .006, phase: 'grid' },
                fields: { every: 3, module: cove('field'), lumens: 2300 }, snapSpots: true },
            profile: { panel: SLOT.gloss, backing: F.bronze, bevel: .003 } },
        // Glass building: smoked timber 1.5 m panels inside a dropped ring along the walls
        // whose fascia carries a warm up-light.
        'B': { system: { backing: piece('backing'), grid: { pitch: [1.5, 1.5], block: piece('grid15'), blockCells: [2, 2], joint: .006, phase: 'room-centre' },
                steps: [{ inset: .6, drop: .2, fascia: piece('step'), lens: { module: cove('step'), y: .19, facing: 'up', lumensPerMetre: 30, kelvin: 2700, proud: .03 } }],
                snapSpots: true },
            profile: { panel: SLOT.smoked, backing: F.black, bevel: .003, step: SLOT.smoked } },
        // Poor building: worn metre cassettes, gunmetal joints, no reveal, no lit lines.
        'C': { system: { backing: piece('backing'), grid: { pitch: [1, 1], block: piece('grid1x1'), blockCells: [2, 2], joint: .012, phase: 'grid' }, snapSpots: false },
            profile: { panel: SLOT.worn, backing: SLOT.gunmetal } },
        // Office: walnut boards 2 m long on a 0.5 m course, a black shadow gap at the walls.
        'R': { system: { backing: piece('backing'), grid: { pitch: [2, .5], block: piece('boards'), blockCells: [1, 4], joint: .004, phase: 'grid' },
                perimeter: { width: .05, drop: -.02, edge: piece('shadow'), corner: piece('shadow-corner') }, snapSpots: false },
            profile: { panel: SLOT.walnut, backing: F.black, perimeter: F.black } },
    };
    const system: CeilingSystem = { ...base[name].system, ...overrides.system, id };
    const profile: CeilingProfile = { ...base[name].profile, ...overrides.profile };
    const marker = ceilingMarker(system, profile), pieces = ceilingRecipes(system, profile);
    return { system, profile, recipes: add => { marker(add); pieces(add); } };
}
