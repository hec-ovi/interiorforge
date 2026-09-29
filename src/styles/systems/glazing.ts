import { FINISH as F } from '../../modules/finishes.js';
import type { RecipeSet } from '../../modules/recipes.js';
import type { RoomKind } from '../../core/types.js';
import type { GlazingSystem, WallFace } from './types.js';

/** Glazed partitions: one glass plate over the fragment (the office side owns it; the room
 *  it looks onto draws nothing), mullions at a fixed pitch phased to the construction grid
 *  and stretched in y only, an end post at each cut, head and foot rails and transoms at
 *  fixed heights stretched in x only, an optional frosted band and an opaque base. */

const CELL = .5;
/** The shared glass plate every glazed partition wears (office side only). */
export const GLASS = 'wall-panel-field-glass';

/** The rail (transom, head, foot) module that goes with a mullion module: `<x>-stile` pairs
 *  with `<x>-rail` (the stock `wall-meridian-glass-stile`/`-rail`), anything else with
 *  `<mullion>-rail`. */
export const railOf = (mullion: string): string => mullion.endsWith('-stile') ? `${mullion.slice(0, -'-stile'.length)}-rail` : `${mullion}-rail`;

/** Mullion positions along [a, b]: an end post inside each cut, then every `pitch` from the
 *  grid origin, dropping any that would crowd an end post. */
export function mullionStations(a: number, b: number, pitch: number, width: number, origin: number): number[] {
    if (b - a < 2 * width) return [(a + b) / 2];
    const posts = [a + width / 2];
    if (pitch > 0) for (let n = Math.ceil((a + width * 1.5 - origin) / pitch - 1e-9); origin + n * pitch <= b - width * 1.5 + 1e-9; n++)
        posts.push(origin + n * pitch);
    posts.push(b - width / 2);
    return posts;
}

/** A glazed partition fragment [a, b] over the full face height. */
export function placeGlazing(face: WallFace, spec: GlazingSystem, a: number, b: number): void {
    const length = b - a, mid = (a + b) / 2, height = face.height;
    if (length < 1e-3 || height < 1e-3) return;
    const base = spec.base && spec.base.height < height - .5 ? spec.base : undefined;
    const sill = base?.height ?? 0, w = spec.mullion.width, rail = railOf(spec.mullion.module);
    if (base) face.piece(base.module, mid, 0, [length / CELL, 1, 1]);
    face.piece(GLASS, mid, sill, [length / CELL, (height - sill) / CELL, 1]);
    for (const t of mullionStations(a, b, spec.pitch, w, face.gridOrigin))
        face.piece(spec.mullion.module, t, sill, [1, (height - sill) / CELL, 1]);
    const rails = [sill, height - w, ...spec.transoms.filter(y => y > sill + 2 * w && y < height - 3 * w).map(y => y - w / 2)];
    for (const y of rails) face.piece(rail, mid, y, [length / CELL, 1, 1]);
    const frost = spec.frosting;
    if (frost) {
        const y0 = Math.max(sill, frost.y0), y1 = Math.min(height, frost.y1);
        if (y1 - y0 > .05) face.piece(frost.module, mid, y0, [length / CELL, (y1 - y0) / CELL, 1]);
    }
}

/** How a glazing system's own modules look. */
export interface GlazingProfile {
    /** mullion and rail metal */
    frame: string;
    /** depth of mullions and rails from the partition line (the plate is 12 mm) */
    depth: number;
    /** frosted interlayer slot, when the system has a frosting band */
    frost?: string;
    /** opaque base (spandrel) slot, when the system has a base */
    base?: string;
}

/** The mullion, rail, frosting and base modules of a glazing system. The glass plate is the
 *  shared `wall-panel-field-glass`. Modules the spec names that already exist (the stock
 *  `wall-meridian-glass-stile`/`-rail`) are not drawn again. */
export function glazingRecipes(spec: GlazingSystem, profile: GlazingProfile): RecipeSet {
    const stock = new Set(['wall-meridian-glass-stile', 'wall-meridian-glass-rail']);
    const w = spec.mullion.width, d = profile.depth;
    return add => {
        if (!stock.has(spec.mullion.module)) add(spec.mullion.module, k => k.cbox(profile.frame, [0, 0, d / 2], [w, CELL, d]));
        const rail = railOf(spec.mullion.module);
        if (!stock.has(rail)) add(rail, k => k.cbox(profile.frame, [0, 0, d / 2], [CELL, w, d]));
        if (spec.frosting) add(spec.frosting.module, k => k.cbox(profile.frost ?? FROSTED, [0, 0, .0145], [CELL, CELL, .003], undefined, ['north', 'south']));
        if (spec.base) {
            const h = spec.base.height;
            add(spec.base.module, k => k.cbox(profile.base ?? F.black, [0, 0, d / 2], [CELL, h, d], undefined, ['north', 'south', 'top', 'east', 'west']));
        }
    };
}

const FROSTED = 'cyberpunk/sandra-frosted-glass/mid#infill';

export type GlazingPresetName = 'B' | 'B-bath' | 'R' | 'E6-frosted';

/** Glazing presets from the references, ids `wall-glazing-<sid>-*`:
 *  B slim black mullions on 1.5 m with a door-head transom (B1 screens, B2/B3 partitions);
 *  B-bath a bronze-framed bath screen with a frosted band (B2);
 *  R black office mullions on the metre over a 0.1 m black base, transom at 2.4 m (R1);
 *  E6-frosted timber-framed frosted infill on 0.5 m (E6). */
export function glazingPreset(name: GlazingPresetName, sid: string, rooms: RoomKind[], onto: RoomKind[]):
    { system: GlazingSystem; profile: GlazingProfile; recipes: RecipeSet } {
    const id = `wall-glazing-${sid}`;
    const table: Record<GlazingPresetName, { system: Omit<GlazingSystem, 'id' | 'rooms' | 'onto'>; profile: GlazingProfile }> = {
        'B': { system: { pitch: 1.5, mullion: { module: `${id}-mullion`, width: .04 }, transoms: [2.1] },
            profile: { frame: F.black, depth: .06 } },
        'B-bath': { system: { pitch: 1, mullion: { module: `${id}-bath-mullion`, width: .03 }, transoms: [],
                frosting: { y0: .9, y1: 1.8, module: `${id}-bath-frost` } },
            profile: { frame: F.bronze, depth: .05, frost: FROSTED } },
        'R': { system: { pitch: 1, mullion: { module: `${id}-office-mullion`, width: .05 }, transoms: [2.4],
                base: { height: .1, module: `${id}-office-base` } },
            profile: { frame: F.black, depth: .07, base: F.black } },
        'E6-frosted': { system: { pitch: .5, mullion: { module: `${id}-lattice-mullion`, width: .03 }, transoms: [.9, 1.8],
                frosting: { y0: 0, y1: 2.1, module: `${id}-lattice-frost` } },
            profile: { frame: 'cyberpunk/corpo-plaza-veneer/rich#walnut', depth: .045, frost: FROSTED } },
    };
    const entry = table[name];
    const system: GlazingSystem = { id: name === 'B' ? id : `${id}-${name.toLowerCase()}`, ...entry.system, rooms, onto };
    return { system, profile: entry.profile, recipes: glazingRecipes(system, entry.profile) };
}
