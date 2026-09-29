import type { BuildingType, FloorKind, InteriorRequest, ReferenceKind, RoomKind, StyleId, TemplateKey, Tier } from '../../core/types.js';
import type { Family } from '../../placements/finish.js';

/** Reference building kinds, derived inside Interior from type, tier and the exterior
 *  architecture (or forced by `building.kind`), and the program policy of each: which space
 *  templates its floors fit and which style their other rooms wear. */

/** Exterior architectures that pair with each residential kind, preferred first. */
export const KIND_ARCHITECTURES: Readonly<Record<Exclude<ReferenceKind, 'R'>, readonly string[]>> = {
    A: ['mirror-frame', 'corporate-sectors', 'white-grid'],
    B: ['balcony-grid', 'mirror-shutters', 'faceted-bays'],
    C: ['residential-serviced', 'residential-megablock', 'residential-courtyard'],
};

/** Space templates of each kind. */
export const KIND_TEMPLATES: Readonly<Record<ReferenceKind, readonly TemplateKey[]>> = {
    A: ['e1-apartment', 'e2-floor', 'e5-lobby2', 'e6-apartment2'],
    B: ['b1-floor', 'b2-suite', 'b3-apartment', 'b4-loft'],
    C: ['c1-capsule', 'c2-corridors', 'c3-poor', 'c4-bathroom', 'c5-machine', 'c6-studio', 'c7-room'],
    R: ['r1-office'],
};

/** Tiers and building types a kind may furnish. */
export const KIND_SCOPE: Readonly<Record<ReferenceKind, { tiers: readonly Tier[]; types: readonly BuildingType[] }>> = {
    A: { tiers: ['rich', 'high_rich'], types: ['residential', 'hotel', 'offices', 'corpo'] },
    B: { tiers: ['rich', 'high_rich'], types: ['residential', 'hotel', 'offices', 'corpo'] },
    C: { tiers: ['poor', 'mid'], types: ['residential', 'hotel'] },
    R: { tiers: ['rich', 'high_rich'], types: ['offices', 'corpo'] },
};

export const keysOf = (kind: ReferenceKind): readonly TemplateKey[] => KIND_TEMPLATES[kind];
/** The style a template's rooms wear by default: its key's first two characters. */
export const templateStyle = (key: TemplateKey): StyleId => key.slice(0, 2) as StyleId;
export const kindAllows = (kind: ReferenceKind, type: BuildingType, tier: Tier): boolean =>
    KIND_SCOPE[kind].tiers.includes(tier) && KIND_SCOPE[kind].types.includes(type);

const DWELLING_TYPES: ReadonlySet<BuildingType> = new Set(['residential', 'hotel']);
const OFFICE_TYPES: ReadonlySet<BuildingType> = new Set(['offices', 'corpo']);
const RICH: ReadonlySet<Tier> = new Set(['rich', 'high_rich']);

const architectureOf = (request: InteriorRequest): string | undefined =>
    (request.blueprint.assembly as { architecture?: string } | undefined)?.architecture;

/** The reference kind a building furnishes as, or null for the family look alone.
 *  An explicit `building.kind` wins. Otherwise rich offices are R; a residential or hotel
 *  building whose architecture belongs to a kind that allows its tier is that kind, and any
 *  other architecture follows the tier: high_rich A, rich B, poor C. Mid tiers and the
 *  named `interiorStyle` identities keep their own look. */
export function referenceKind(request: InteriorRequest): ReferenceKind | null {
    const { type, tier, kind, interiorStyle } = request.building;
    if (kind) return kind;
    if (interiorStyle) return null;
    if (OFFICE_TYPES.has(type)) return RICH.has(tier) ? 'R' : null;
    if (!DWELLING_TYPES.has(type)) return null;
    const architecture = architectureOf(request);
    const paired = (Object.keys(KIND_ARCHITECTURES) as Exclude<ReferenceKind, 'R'>[])
        .find(key => architecture && KIND_ARCHITECTURES[key].includes(architecture) && derivedTiers(key).includes(tier));
    if (paired) return paired;
    return tier === 'high_rich' ? 'A' : tier === 'rich' ? 'B' : tier === 'poor' ? 'C' : null;
}

/** Tiers a kind is derived for without an explicit `building.kind` (mid stays null). */
const derivedTiers = (kind: ReferenceKind): readonly Tier[] => kind === 'C' ? ['poor'] : KIND_SCOPE[kind].tiers;

/** Buildings whose paired-storey units wear the loft finish: Apartment 1702 and kind B. */
export const isLoftRequest = (request: InteriorRequest): boolean =>
    request.building.interiorStyle === 'apartment-1702' || referenceKind(request) === 'B';

export type PublicSlot = 'ground-front' | 'core-front' | 'service' | 'hall' | 'corridor';

export interface FloorPolicy {
    /** dwelling templates, tried in parity order per unit */
    dwellings: TemplateKey[];
    /** style of untemplated private rooms */
    dwellingStyle: StyleId;
    /** style of untemplated common rooms (corridor, lobby, services) */
    publicStyle: StyleId;
    public: { slot: PublicSlot; templates: TemplateKey[]; count?: 'one' | 'per-side' | 'all' }[];
}

export interface KindPolicy {
    family: Family;
    tier: Tier;
    /** storey pitch and clear height the kind's references stand in, metres */
    pitch: { floor: number; clear: number };
    floors: Partial<Record<FloorKind, FloorPolicy>>;
    /** styles of rooms on floors the policy does not name */
    styles: { private: StyleId; public: StyleId };
    loft?: { template: 'b4-loft'; style: 'b4'; pairs: 'top-pair' };
}

const A_DWELLING: FloorPolicy = {
    dwellings: ['e1-apartment', 'e6-apartment2'], dwellingStyle: 'e1', publicStyle: 'e2',
    public: [{ slot: 'core-front', templates: ['e2-floor'] }],
};
const B_DWELLING: FloorPolicy = { dwellings: ['b3-apartment', 'b2-suite'], dwellingStyle: 'b3', publicStyle: 'b1', public: [] };
const C_DWELLING: FloorPolicy = {
    dwellings: ['c7-room', 'c1-capsule', 'c6-studio'], dwellingStyle: 'c7', publicStyle: 'c2',
    public: [{ slot: 'corridor', templates: ['c2-corridors'] }, { slot: 'service', templates: ['c5-machine'] }],
};
const R_OFFICE: FloorPolicy = { dwellings: [], dwellingStyle: 'r1', publicStyle: 'r1', public: [{ slot: 'hall', templates: ['r1-office'], count: 'per-side' }] };

export const KIND_POLICY: Readonly<Record<ReferenceKind, KindPolicy>> = {
    A: {
        family: 'luxury', tier: 'high_rich', pitch: { floor: 3.6, clear: 3.1 }, styles: { private: 'e1', public: 'e2' },
        floors: {
            lobby: { dwellings: [], dwellingStyle: 'e1', publicStyle: 'e5', public: [{ slot: 'ground-front', templates: ['e5-lobby2'] }] },
            apartment: A_DWELLING,
            hotel_rooms: { ...A_DWELLING, dwellings: ['e1-apartment'] },
        },
    },
    B: {
        family: 'luxury', tier: 'rich', pitch: { floor: 3.6, clear: 3.1 }, styles: { private: 'b3', public: 'b1' },
        floors: {
            lobby: { dwellings: [], dwellingStyle: 'b3', publicStyle: 'b1', public: [{ slot: 'ground-front', templates: ['b1-floor'] }] },
            apartment: B_DWELLING,
            hotel_rooms: { ...B_DWELLING, dwellings: ['b2-suite'] },
        },
        loft: { template: 'b4-loft', style: 'b4', pairs: 'top-pair' },
    },
    C: {
        family: 'damaged', tier: 'poor', pitch: { floor: 3.5, clear: 3.0 }, styles: { private: 'c7', public: 'c2' },
        floors: {
            lobby: {
                dwellings: [], dwellingStyle: 'c7', publicStyle: 'c2',
                public: [{ slot: 'ground-front', templates: ['c3-poor', 'c2-corridors'] }, { slot: 'service', templates: ['c4-bathroom', 'c5-machine'] }],
            },
            apartment: C_DWELLING,
            hotel_rooms: C_DWELLING,
        },
    },
    R: {
        family: 'corporate', tier: 'rich', pitch: { floor: 3.6, clear: 3.1 }, styles: { private: 'r1', public: 'r1' },
        floors: {
            office: R_OFFICE,
            corpo_office: R_OFFICE,
            lobby: { dwellings: [], dwellingStyle: 'r1', publicStyle: 'r1', public: [] },
        },
    },
};

/** The floor policy of a kind building's floor, its template lists narrowed to
 *  `building.references`; null outside kind buildings or on floors the kind does not plan. */
export function floorPolicy(request: InteriorRequest, kind: FloorKind): FloorPolicy | null {
    const reference = referenceKind(request);
    const policy = reference ? KIND_POLICY[reference].floors[kind] : undefined;
    if (!policy) return null;
    const allowed = request.building.references;
    if (!allowed) return policy;
    const keep = (keys: readonly TemplateKey[]) => keys.filter(key => allowed.includes(key));
    return {
        ...policy, dwellings: keep(policy.dwellings),
        public: policy.public.map(slot => ({ ...slot, templates: keep(slot.templates) })).filter(slot => slot.templates.length),
    };
}

/** Common rooms of a floor: they wear the public style even inside a unit's group. */
const COMMON_ROOMS: ReadonlySet<RoomKind> = new Set(['corridor', 'elevator_lobby', 'concourse', 'reception']);

/** The style an untemplated room of a kind building wears: the floor's dwelling style for a
 *  unit's private rooms, its public style for everything else. */
export function defaultStyle(request: InteriorRequest, floorKind: FloorKind, room: { kind: RoomKind; unit?: string }): StyleId | undefined {
    const kind = referenceKind(request);
    if (!kind) return undefined;
    const policy = KIND_POLICY[kind];
    const floor = policy.floors[floorKind];
    const privateRoom = !!room.unit && !COMMON_ROOMS.has(room.kind);
    if (floor) return privateRoom ? floor.dwellingStyle : floor.publicStyle;
    return privateRoom ? policy.styles.private : policy.styles.public;
}
