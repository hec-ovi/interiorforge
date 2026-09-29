import type { Point } from '../../core/geom.js';
import { FINISH as F } from '../../modules/finishes.js';
import type { Kit } from '../../modules/kit.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { FloorSystem, PitSpec } from './types.js';
import { lensSlot } from './panel-recipes.js';
import { ccw, facing } from './surface-shapes.js';
import { gridIds } from './surface-grid.js';
import { pitIds } from './floor.js';

/** Floor-system modules, drawn from a profile. Floor pieces stand with their top at y = 0:
 *  the support hangs from 2 mm under it, tiles and bands are 18 mm skins over it, so every
 *  joint shows the support. The pit's pieces lie on its length along local x: the straight
 *  tray is 0.5 m long and stretches, each rounded end is authored for the pit's width and
 *  radius and never stretches, the glass is a 0.5 m walking cell stretched over the pit. */

const CELL = .5;
const SKIN = .018;
/** Under the glass: the rim, the corner stone and the rock tops stay below this. */
const UNDER_GLASS = -.013;
const RIM = .03;

export interface FloorProfile {
    /** tile skin */
    tile: string;
    /** support slab (the joints show it) */
    support?: string;
    border?: string;
    inlay?: string;
    pit?: { glass: string; rim: string; tray: string; rock: string };
}

const SIDES = ['top', 'north', 'south', 'east', 'west'] as const;

function tiles(k: Kit, slot: string, [pu, pv]: [number, number], [nu, nv]: [number, number], joint: number): void {
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++)
        k.cbox(slot, [(i - (nu - 1) / 2) * pu, -SKIN, (j - (nv - 1) / 2) * pv], [pu - joint, SKIN, pv - joint], undefined, SIDES);
}

/** Support, tile block/row/column/cell, border, inlay and pit modules of one floor system.
 *  Never the marker `spec.id` (`floorMarker` draws that). */
export function floorRecipes(spec: FloorSystem, profile: FloorProfile): RecipeSet {
    const g = spec.tile, ids = gridIds(g.block), [cu, cv] = g.blockTiles;
    return add => {
        add(spec.support, k => k.cbox(profile.support ?? F.concrete, [0, -.15, 0], [CELL, .148, CELL]));
        add(ids.block, k => tiles(k, profile.tile, g.size, [cu, cv], g.joint));
        add(ids.row, k => tiles(k, profile.tile, g.size, [cu, 1], g.joint));
        add(ids.col, k => tiles(k, profile.tile, g.size, [1, cv], g.joint));
        add(ids.cell, k => tiles(k, profile.tile, g.size, [1, 1], g.joint));
        if (spec.border) {
            add(spec.border.module, k => k.cbox(profile.border ?? profile.tile, [0, -SKIN, 0], [CELL, SKIN, CELL], undefined, SIDES));
            if (spec.border.inlay) add(spec.border.inlay.module, k => k.cbox(profile.inlay ?? F.bronze, [0, -SKIN, 0], [CELL, SKIN, CELL], undefined, SIDES));
        }
        if (spec.pit) pitRecipes(spec, profile)(add);
    };
}

/** The marker `floor-slab-<sid>`: a complete plain slab for leftovers and thresholds. */
export function floorMarker(spec: FloorSystem, profile: FloorProfile): RecipeSet {
    return add => add(spec.id, k => {
        k.cbox(profile.support ?? F.concrete, [0, -.15, 0], [CELL, .13, CELL]);
        k.cbox(profile.tile, [0, -.02, 0], [CELL, .02, CELL]);
    });
}

/** Outline of one rounded end in plan (x along the pit from its inner edge, z across),
 *  inset by `inset`: from (0, -w/2) round the two corner arcs to (0, +w/2). */
export function endOutline(width: number, radius: number, inset = 0, segments = 8): Point[] {
    const r = Math.max(.01, radius - inset), half = width / 2 - inset, c = width / 2 - radius, out: Point[] = [];
    for (const [sign, from, to] of [[-1, -Math.PI / 2, 0], [1, 0, Math.PI / 2]] as const)
        for (let i = 0; i <= segments; i++) {
            const a = from + (to - from) * i / segments;
            out.push([r * Math.cos(a), sign * c + r * Math.sin(a)]);
        }
    // The arcs start and end on the inner edge x = 0 at |z| = half.
    out[0] = [0, -half]; out[out.length - 1] = [0, half];
    return out;
}

/** The glass, straight tray, rounded end, rock cluster and lens modules of a pit. */
export function pitRecipes(spec: FloorSystem, profile: FloorProfile): RecipeSet {
    const pit = spec.pit!, ids = pitIds(spec), slots = profile.pit ?? { glass: GLASS, rim: F.black, tray: F.black, rock: ROCK };
    const width = pit.size[0], radius = Math.min(pit.radius, width / 2), depth = pit.depth;
    return add => {
        add(ids.glass, k => k.cbox(slots.glass, [0, -.012, 0], [CELL, .012, CELL], undefined, ['top']));
        add(ids.straight, k => {
            for (const s of [-1, 1]) {
                const edge = s * width / 2, inner = s * (width / 2 - RIM);
                // Rim under the glass, then the tray wall down to the bottom, facing the pit.
                facing(k, slots.rim, [[-CELL / 2, UNDER_GLASS, edge], [CELL / 2, UNDER_GLASS, edge], [CELL / 2, UNDER_GLASS, inner], [-CELL / 2, UNDER_GLASS, inner]], [0, 1, 0]);
                facing(k, slots.tray, [[-CELL / 2, UNDER_GLASS, inner], [CELL / 2, UNDER_GLASS, inner], [CELL / 2, -depth, inner], [-CELL / 2, -depth, inner]], [0, 0, -s]);
            }
            k.box(slots.tray, [-CELL / 2, -depth, -(width / 2 - RIM)], [CELL, 0, width - 2 * RIM], undefined, ['top']);
        });
        add(ids.end, k => {
            const outer = endOutline(width, radius), inner = endOutline(width, radius, RIM);
            // Stone under the glass outside the arcs, one fill per corner.
            const half = outer.length / 2;
            for (const [corner, arc] of [[[radius, -width / 2], outer.slice(0, half)], [[radius, width / 2], outer.slice(half)]] as [Point, Point[]][])
                k.mesh.addHorizontalPolygon(profile.tile, ccw([corner, ...arc]), UNDER_GLASS, 'up');
            for (let i = 0; i + 1 < outer.length; i++) {
                const a = outer[i]!, b = outer[i + 1]!, c = inner[i + 1]!, d = inner[i]!;
                facing(k, slots.rim, [[a[0], UNDER_GLASS, a[1]], [b[0], UNDER_GLASS, b[1]], [c[0], UNDER_GLASS, c[1]], [d[0], UNDER_GLASS, d[1]]], [0, 1, 0]);
                // The tray wall along the inset outline faces back into the pit (towards -x mostly).
                const nx = -(c[1] - d[1]), nz = c[0] - d[0];
                const mid: Point = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2], toward = nx * -mid[0] + nz * -mid[1] > 0 ? 1 : -1;
                facing(k, slots.tray, [[d[0], UNDER_GLASS, d[1]], [c[0], UNDER_GLASS, c[1]], [c[0], -depth, c[1]], [d[0], -depth, d[1]]], [toward * nx, 0, toward * nz]);
            }
            k.mesh.addHorizontalPolygon(slots.tray, ccw([...inner]), -depth, 'up');
            boulders(k, slots.rock, [[radius * .45, -width * .18], [radius * .35, width * .22]], depth);
        });
        add(ids.rocks, k => boulders(k, slots.rock, [[-.22, -width * .2], [.18, width * .12], [.3, -width * .02]], depth));
        add(ids.lens, k => k.cbox(lensSlot({ color: pit.lens.color, kelvin: 6500 }), [0, -.003, 0], [CELL, .003, CELL], undefined, ['top']));
    };
}

/** A few low boulders on the tray bottom, hexagonal prisms of seeded size, their tops well
 *  under the glass. */
function boulders(k: Kit, slot: string, at: Point[], depth: number): void {
    for (const [i, [x, z]] of at.entries()) {
        const r = .16 + .07 * ((i * 7 + 3) % 5) / 4, h = Math.min(depth - .08, .18 + .1 * ((i * 5 + 1) % 3) / 2);
        k.cylinder(slot, [x, -depth, z], r, h, 6);
    }
}

const GLASS = 'cyberpunk/corpo-plaza-glass/rich#clear';
const ROCK = 'cyberpunk/exterior-basalt-concrete/mid#native';

export type FloorPresetName = 'A' | 'A-pit' | 'B' | 'B-plank' | 'C' | 'C-hex' | 'R';

export interface FloorPreset { system: FloorSystem; profile: FloorProfile; recipes: RecipeSet }

const SLOT = {
    darkStone: 'cyberpunk/corpo-plaza-stone/rich#polished',
    honed: 'cyberpunk/meridian-lobby-stone/rich#honed',
    walnut: 'cyberpunk/corpo-plaza-veneer/rich#walnut',
    plank: 'cyberpunk/wood/high_rich#2',
    worn: 'cyberpunk/interior-damaged-floor/poor#field',
    hex: 'cyberpunk/interior-capsule-hex/mid#field',
} as const;

/** A preset floor system for one style id; ids `floor-slab-<sid>` (marker),
 *  `floor-slab-<sid>-support`, `floor-finish-<sid>-*` (tiles, bands),
 *  `floor-slab-<sid>-pit*` and `ceiling-cove-<sid>-pit` (pit). */
export function floorPreset(name: FloorPresetName, sid: string, overrides: { system?: Partial<Omit<FloorSystem, 'id'>>; profile?: Partial<FloorProfile> } = {}): FloorPreset {
    const id = `floor-slab-${sid}`, finish = (n: string) => `floor-finish-${sid}-${n}`;
    const base: Record<FloorPresetName, { system: Omit<FloorSystem, 'id'>; profile: FloorProfile }> = {
        // E1: dark polished stone in 1.5 m squares, 3 mm joints, on the building grid.
        'A': { system: { support: `${id}-support`, tile: { size: [1.5, 1.5], joint: .003, block: finish('stone'), blockTiles: [2, 2], phase: 'grid' } },
            profile: { tile: SLOT.darkStone } },
        // E1 lounge: the same stone round a walk-on glass rock pit, 2.4 × 4 m, corners of
        // 0.8 m, 0.5 m deep, lit cyan from below.
        'A-pit': { system: { support: `${id}-support`, tile: { size: [1.5, 1.5], joint: .003, block: finish('stone'), blockTiles: [2, 2], phase: 'grid' },
                pit: { size: [2.4, 4], radius: .8, depth: .5, straight: `${id}-pit-straight`, end: `${id}-pit-end`, rim: `${id}-pit`,
                    lens: { color: [.05, .75, 1], lumensPerMetre: 120 } } },
            profile: { tile: SLOT.darkStone } },
        // Glass building lobby: honed stone 2 × 1 m in running blocks, a pale border with a
        // bronze inlay along the walls.
        'B': { system: { support: `${id}-support`, tile: { size: [2, 1], joint: .003, block: finish('stone'), blockTiles: [1, 2], phase: 'grid' },
                border: { width: .45, module: finish('border'), inlay: { width: .012, module: finish('inlay') } } },
            profile: { tile: SLOT.honed, border: 'cyberpunk/loft1702-stone/rich#pale', inlay: F.bronze } },
        // Glass building homes: 2 m walnut planks 0.25 m wide.
        'B-plank': { system: { support: `${id}-support`, tile: { size: [2, .25], joint: .002, block: finish('planks'), blockTiles: [1, 8], phase: 'grid' } },
            profile: { tile: SLOT.plank } },
        // Poor building: worn metre tiles.
        'C': { system: { support: `${id}-support`, tile: { size: [1, 1], joint: .004, block: finish('tiles'), blockTiles: [2, 2], phase: 'grid' } },
            profile: { tile: SLOT.worn } },
        // Capsule homes: worn hex sheet in 2 m panels.
        'C-hex': { system: { support: `${id}-support`, tile: { size: [2, 2], joint: .003, block: finish('hex'), blockTiles: [1, 1], phase: 'grid' } },
            profile: { tile: SLOT.hex } },
        // Office: walnut boards 2 m by 0.2 m.
        'R': { system: { support: `${id}-support`, tile: { size: [2, .2], joint: .002, block: finish('boards'), blockTiles: [1, 10], phase: 'grid' } },
            profile: { tile: SLOT.walnut } },
    };
    const system: FloorSystem = { ...base[name].system, ...overrides.system, id };
    const profile: FloorProfile = { ...base[name].profile, ...overrides.profile };
    const marker = floorMarker(system, profile), pieces = floorRecipes(system, profile);
    return { system, profile, recipes: add => { marker(add); pieces(add); } };
}
