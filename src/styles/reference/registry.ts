import type { StyleId } from '../../core/types.js';
import { kind as kindA } from '../ref-a/index.js';
import { kind as kindB } from '../ref-b/index.js';
import { kind as kindC } from '../ref-c/index.js';
import { kind as kindR } from '../ref-r/index.js';
import type {
    AssemblySpec, CeilingSystem, FloorSystem, GlazingSystem, HousingSpec, KindExports, PanelSystem, PortalSpec, StyleSpec,
} from '../systems/types.js';

/** The reference layer's registry: every kind's specs, keyed by the ids placements meet in
 *  a room finish or a furniture record. Built once, deterministically, from the four kind
 *  exports; nothing registers itself. */
export const KINDS: readonly KindExports[] = [kindA, kindB, kindC, kindR];

function index<T>(what: string, entries: Iterable<[string, T]>): ReadonlyMap<string, T> {
    const map = new Map<string, T>();
    for (const [id, value] of entries) {
        if (map.has(id)) throw new Error(`duplicate reference ${what} ${id}`);
        map.set(id, value);
    }
    return map;
}
const byId = <T extends { id: string }>(pick: (kind: KindExports) => readonly T[]) =>
    KINDS.flatMap(kind => pick(kind).map(entry => [entry.id, entry] as [string, T]));

/** Style specs by style id (`e1` ... `r1`). */
export const STYLES: ReadonlyMap<string, StyleSpec> = index('style', byId(kind => kind.styles));
/** Panel systems by marker field id `wall-field-<sid>` (frontage systems by their own id). */
export const PANELS: ReadonlyMap<string, PanelSystem> = index('panel system', byId(kind => kind.panels));
/** Glazing systems by id, named in `RoomFinish.glazing`. */
export const GLAZING: ReadonlyMap<string, GlazingSystem> = index('glazing system', byId(kind => kind.glazing));
/** Ceiling systems by marker ceiling id `ceiling-field-<sid>`. */
export const CEILINGS: ReadonlyMap<string, CeilingSystem> = index('ceiling system', byId(kind => kind.ceilings));
/** Floor systems by marker slab id `floor-slab-<sid>`. */
export const FLOORS: ReadonlyMap<string, FloorSystem> = index('floor system', byId(kind => kind.floors));
/** Portal specs by portal id `<sid>-<name>`, named in `RoomFinish.portal`. */
export const PORTALS: ReadonlyMap<string, PortalSpec> = index('portal', byId(kind => kind.portals));
/** Built-in assemblies by furniture fit id `asm-<sid>-<name>`. */
export const ASSEMBLIES: ReadonlyMap<string, AssemblySpec> = index('assembly', KINDS.flatMap(kind => Object.entries(kind.assemblies)));
/** Service housings by id, named in `StyleSpec.housings`. */
export const HOUSINGS: ReadonlyMap<string, HousingSpec> = index('housing', byId(kind => kind.housings));

/** The style a room wears, when it is a registered reference style. */
export function styleOf(room: { style?: string } | undefined | null): StyleSpec | undefined {
    return room?.style ? STYLES.get(room.style) : undefined;
}

/** The portal spec whose header module this is (`door-header-<pid>`). */
export function portalOfHeader(module: string): PortalSpec | undefined {
    return module.startsWith('door-header-') ? PORTALS.get(module.slice('door-header-'.length)) : undefined;
}

export type { StyleId };
