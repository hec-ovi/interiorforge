import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { resolveAssignments, validateRequest } from '../src/blueprint/validate.js';
import { duplexAssignments } from '../src/layout/duplex/assignments.js';
import { planBuilding } from '../src/layout/index.js';
import { buildNpcSupport } from '../src/npc/index.js';
import { generate } from '../src/index.js';
import type { BuildingType, FloorInterior, InteriorRequest, ReferenceKind, Tier } from '../src/index.js';
import {
    defaultStyle, floorPolicy, isLoftRequest, KIND_ARCHITECTURES, KIND_POLICY, KIND_TEMPLATES, referenceKind,
} from '../src/styles/reference/kinds.js';
import { assembly } from './fixtures.js';

const base = await assembly('mirror-frame', { width: 40, depth: 40, floors: 6 });
const withBuilding = (building: Partial<InteriorRequest['building']>, architecture?: string, extra: Partial<InteriorRequest> = {}): InteriorRequest => ({
    ...base, ...extra, building: { ...base.building, ...building },
    blueprint: { ...base.blueprint, assembly: { ...(base.blueprint.assembly as object), architecture } },
});
const schema = (name: string) => JSON.parse(readFileSync(`schemas/${name}.schema.json`, 'utf8'));
const validator = () => {
    const ajv = new Ajv2020({ strict: false });
    for (const name of ['floor', 'npc', 'blueprint', 'modules', 'floor-placement', 'building', 'request'])
        ajv.addSchema(schema(name), `https://urbe.dev/interior/${name}.schema.json`);
    return (name: string, value: unknown) => {
        const check = ajv.getSchema(`https://urbe.dev/interior/${name}.schema.json`)!;
        return { ok: check(value) as boolean, errors: JSON.stringify(check.errors) };
    };
};
const code = (fn: () => unknown): string | undefined => {
    try { fn(); } catch (error) { return (error as { code?: string }).code; }
    return undefined;
};

describe('reference kind derivation', () => {
    const cases: [BuildingType, Tier, string | undefined, ReferenceKind | null][] = [
        ['residential', 'high_rich', 'mirror-frame', 'A'], ['residential', 'rich', 'mirror-frame', 'A'],
        ['residential', 'high_rich', 'corporate-sectors', 'A'], ['hotel', 'rich', 'white-grid', 'A'],
        ['residential', 'rich', 'balcony-grid', 'B'], ['residential', 'high_rich', 'balcony-grid', 'B'],
        ['hotel', 'rich', 'mirror-shutters', 'B'], ['residential', 'rich', 'faceted-bays', 'B'],
        ['residential', 'poor', 'residential-serviced', 'C'], ['hotel', 'poor', 'residential-megablock', 'C'],
        ['residential', 'poor', 'mirror-frame', 'C'], ['residential', 'rich', 'residential-serviced', 'B'],
        ['residential', 'high_rich', undefined, 'A'], ['residential', 'rich', undefined, 'B'], ['residential', 'poor', undefined, 'C'],
        ['residential', 'rich', 'garden-taper', 'B'], ['residential', 'high_rich', 'rounded-corner', 'A'],
        ['residential', 'mid', 'residential-serviced', null], ['residential', 'mid', 'mirror-frame', null],
        ['offices', 'rich', 'mirror-frame', 'R'], ['corpo', 'high_rich', 'balcony-grid', 'R'], ['offices', 'mid', 'mirror-frame', null],
        ['corpo', 'poor', undefined, null], ['hospital', 'rich', 'mirror-frame', null], ['factory', 'poor', undefined, null],
        ['restaurant', 'high_rich', 'mirror-frame', null],
    ];
    it.each(cases)('%s %s on %s is %s', (type, tier, architecture, kind) => {
        expect(referenceKind(withBuilding({ type, tier }, architecture))).toBe(kind);
    });
    it('lets building.kind force the kind and keeps named identities out of the kinds', () => {
        expect(referenceKind(withBuilding({ type: 'residential', tier: 'rich', kind: 'A' }, 'balcony-grid'))).toBe('A');
        expect(referenceKind(withBuilding({ type: 'residential', tier: 'mid', kind: 'C' }))).toBe('C');
        expect(referenceKind(withBuilding({ type: 'residential', tier: 'mid', interiorStyle: 'h10' }, 'residential-serviced'))).toBeNull();
        expect(referenceKind(withBuilding({ type: 'residential', tier: 'rich', interiorStyle: 'apartment-1702' }, 'balcony-grid'))).toBeNull();
        expect(isLoftRequest(withBuilding({ type: 'residential', tier: 'rich', interiorStyle: 'apartment-1702' }))).toBe(true);
        expect(isLoftRequest(withBuilding({ type: 'residential', tier: 'rich' }, 'balcony-grid'))).toBe(true);
        expect(isLoftRequest(withBuilding({ type: 'residential', tier: 'high_rich' }, 'mirror-frame'))).toBe(false);
    });
    it('pairs every kind with its own architectures, templates and policy', () => {
        for (const [kind, families] of Object.entries(KIND_ARCHITECTURES))
            for (const architecture of families) {
                const tier = kind === 'C' ? 'poor' : kind === 'A' ? 'high_rich' : 'rich';
                expect(referenceKind(withBuilding({ type: 'residential', tier }, architecture))).toBe(kind);
            }
        for (const [kind, policy] of Object.entries(KIND_POLICY)) {
            const keys = new Set<string>(KIND_TEMPLATES[kind as ReferenceKind]);
            for (const floor of Object.values(policy.floors)) {
                for (const key of [...floor.dwellings, ...floor.public.flatMap(slot => slot.templates)]) expect(keys.has(key), `${kind} ${key}`).toBe(true);
                for (const style of [floor.dwellingStyle, floor.publicStyle]) expect([...keys].some(key => key.startsWith(style)), `${kind} ${style}`).toBe(true);
            }
        }
        expect(KIND_POLICY.C.pitch).toEqual({ floor: 3.5, clear: 3 });
        expect(KIND_POLICY.A.family).toBe('luxury');
        expect(KIND_POLICY.C.family).toBe('damaged');
        expect(KIND_POLICY.R.family).toBe('corporate');
    });
    it('narrows floor policies to the requested references and stamps default styles', () => {
        const a = withBuilding({ type: 'residential', tier: 'high_rich', references: ['e6-apartment2'] }, 'mirror-frame');
        expect(floorPolicy(a, 'apartment')).toMatchObject({ dwellings: ['e6-apartment2'], public: [], dwellingStyle: 'e1', publicStyle: 'e2' });
        expect(floorPolicy(withBuilding({ type: 'residential', tier: 'high_rich' }, 'mirror-frame'), 'apartment')!.dwellings).toEqual(['e1-apartment', 'e6-apartment2']);
        expect(floorPolicy(withBuilding({ type: 'residential', tier: 'mid' }), 'apartment')).toBeNull();
        const c = withBuilding({ type: 'residential', tier: 'poor' });
        expect(defaultStyle(c, 'apartment', { kind: 'bedroom', unit: 'apartment_1' })).toBe('c7');
        expect(defaultStyle(c, 'apartment', { kind: 'corridor' })).toBe('c2');
        expect(defaultStyle(c, 'lobby', { kind: 'toilets' })).toBe('c2');
        expect(defaultStyle(c, 'parking', { kind: 'parking_area' })).toBe('c2');
        const r = withBuilding({ type: 'offices', tier: 'rich' });
        expect(defaultStyle(r, 'office', { kind: 'executive_office', unit: 'suite_1' })).toBe('r1');
        expect(floorPolicy(r, 'office')!.public).toEqual([{ slot: 'hall', templates: ['r1-office'], count: 'per-side' }]);
        expect(defaultStyle(withBuilding({ type: 'residential', tier: 'mid' }), 'apartment', { kind: 'bedroom', unit: 'a' })).toBeUndefined();
    });
});

describe('kind contract validation', () => {
    it('accepts a kind consistent with its type and tier and rejects any other', () => {
        expect(validateRequest(withBuilding({ type: 'residential', tier: 'high_rich', kind: 'A' })).building.kind).toBe('A');
        expect(validateRequest(withBuilding({ type: 'offices', tier: 'rich', kind: 'B' })).building.kind).toBe('B');
        expect(validateRequest(withBuilding({ type: 'hotel', tier: 'mid', kind: 'C' })).building.kind).toBe('C');
        for (const building of [
            { type: 'residential', tier: 'poor', kind: 'A' }, { type: 'residential', tier: 'mid', kind: 'B' },
            { type: 'residential', tier: 'rich', kind: 'C' }, { type: 'offices', tier: 'poor', kind: 'C' },
            { type: 'residential', tier: 'rich', kind: 'R' }, { type: 'hospital', tier: 'rich', kind: 'A' },
        ] as const) expect(code(() => validateRequest(withBuilding(building))), JSON.stringify(building)).toBe('E_BLUEPRINT_INVALID');
        expect(code(() => validateRequest(withBuilding({ type: 'residential', tier: 'rich', kind: 'D' as ReferenceKind })))).toBe('E_BLUEPRINT_INVALID');
    });
    it('keeps template references inside the building kind', () => {
        expect(validateRequest(withBuilding({ type: 'residential', tier: 'poor', references: ['c1-capsule', 'c7-room'] })).building.references)
            .toEqual(['c1-capsule', 'c7-room']);
        expect(code(() => validateRequest(withBuilding({ type: 'residential', tier: 'poor', references: ['e1-apartment'] })))).toBe('E_BLUEPRINT_INVALID');
        expect(code(() => validateRequest(withBuilding({ type: 'residential', tier: 'mid', references: ['c1-capsule'] })))).toBe('E_BLUEPRINT_INVALID');
        expect(code(() => validateRequest(withBuilding({ type: 'residential', tier: 'poor', references: [] })))).toBe('E_BLUEPRINT_INVALID');
        expect(code(() => validateRequest(withBuilding({ type: 'residential', tier: 'poor', references: ['c1-capsule', 'c1-capsule'] })))).toBe('E_BLUEPRINT_INVALID');
        expect(code(() => validateRequest(withBuilding({ type: 'residential', tier: 'poor', references: ['c9-nowhere' as never] })))).toBe('E_BLUEPRINT_INVALID');
    });
    it('still gates the named interior styles as before', () => {
        expect(code(() => validateRequest(withBuilding({ type: 'residential', tier: 'rich', interiorStyle: 'h10' })))).toBe('E_BLUEPRINT_INVALID');
        expect(code(() => validateRequest(withBuilding({ type: 'residential', tier: 'rich', interiorStyle: 'apartment-1702' })))).toBe('E_ASSIGNMENT_INVALID');
    });
});

describe('kind assignments', () => {
    const seeds = ['interior-proof', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 1, 2, 3, 4, 5, 6, 7, 8];
    it('furnishes every home floor of a kind building as apartments whatever the seed; hotels keep hotel rooms', () => {
        for (const [tier, architecture] of [['high_rich', 'mirror-frame'], ['poor', 'residential-serviced']] as const)
            for (const seed of seeds) {
                const kinds = resolveAssignments({ ...withBuilding({ type: 'residential', tier }, architecture), seed }).map(a => a.kind);
                expect(kinds).toEqual(['lobby', 'apartment', 'apartment', 'apartment', 'apartment', 'apartment']);
            }
        const studios = seeds.filter(seed => resolveAssignments({ ...withBuilding({ type: 'residential', tier: 'mid' }), seed })
            .some(a => a.kind === 'residence_studio'));
        expect(studios.length).toBeGreaterThan(0);
        expect(resolveAssignments(withBuilding({ type: 'hotel', tier: 'high_rich' }, 'mirror-frame')).map(a => a.kind))
            .toEqual(['lobby', 'hotel_rooms', 'hotel_rooms', 'hotel_rooms', 'hotel_rooms', 'hotel_rooms']);
    });
    it('pairs a kind B crown with the floor below into one optional loft', () => {
        for (const seed of seeds) {
            const b = { ...withBuilding({ type: 'residential', tier: 'rich' }, 'balcony-grid'), seed };
            const assignments = resolveAssignments(b);
            expect(assignments).toEqual([
                { floor: 0, kind: 'lobby' }, { floor: 1, kind: 'apartment' }, { floor: 2, kind: 'apartment' }, { floor: 3, kind: 'apartment' },
                { floor: 4, kind: 'apartment', spans: 2 },
            ]);
            const { assignments: flat, pairs } = duplexAssignments(b, assignments);
            expect(pairs).toEqual([{ lower: 4, upper: 5, optional: true }]);
            expect(flat.map(a => a.floor)).toEqual([0, 1, 2, 3, 4, 5]);
        }
        // an explicit pair is required, and a building of three floors above ground is the least that pairs
        const explicit = withBuilding({ type: 'residential', tier: 'rich' }, 'balcony-grid', {
            assignments: [{ floor: 0, kind: 'lobby' }, { floor: 1, kind: 'apartment', spans: 2 }, { floor: 3, kind: 'apartment' },
                { floor: 4, kind: 'apartment' }, { floor: 5, kind: 'apartment' }],
        });
        expect(duplexAssignments(explicit, resolveAssignments(validateRequest(explicit))).pairs).toEqual([{ lower: 1, upper: 2 }]);
        const short = (floors: number) => {
            const r = withBuilding({ type: 'residential', tier: 'rich' }, 'balcony-grid');
            return { ...r, blueprint: { ...r.blueprint, floors: r.blueprint.floors.slice(0, floors) } };
        };
        expect(resolveAssignments(short(4)).at(-1)).toEqual({ floor: 2, kind: 'apartment', spans: 2 });
        expect(resolveAssignments(short(3)).some(a => a.spans === 2)).toBe(false);
        expect(resolveAssignments(withBuilding({ type: 'hotel', tier: 'rich' }, 'balcony-grid')).some(a => a.spans === 2)).toBe(false);
        expect(resolveAssignments(withBuilding({ type: 'residential', tier: 'high_rich' }, 'mirror-frame')).some(a => a.spans === 2)).toBe(false);
    });
    it('refuses a paired storey outside the loft identities', () => {
        const a = withBuilding({ type: 'residential', tier: 'high_rich' }, 'mirror-frame');
        expect(code(() => duplexAssignments(a, [{ floor: 1, kind: 'apartment', spans: 2 }]))).toBe('E_ASSIGNMENT_INVALID');
    });
});

describe('published contract fields', () => {
    const valid = validator();
    it('round trips the new request, manifest and floor fields through the schemas', () => {
        const request = withBuilding({ type: 'residential', tier: 'rich', kind: 'B', references: ['b3-apartment', 'b4-loft'] }, 'balcony-grid');
        expect(valid('request', JSON.parse(JSON.stringify(request))).ok).toBe(true);
        expect(valid('request', withBuilding({ type: 'residential', tier: 'rich', kind: 'E' as ReferenceKind })).ok).toBe(false);
        const floor: FloorInterior = {
            floor: 1, kind: 'apartment', elevation: 3.6, height: 3.6, ceilingElevation: 6.7, coreAngleDeg: 0,
            core: { elevators: [], stairs: [], shafts: [] }, openingReservations: [],
            voids: [{ id: 'atrium-a', polygon: [[0, 0], [4, 0], [4, 4], [0, 4]], lower: 0, upper: 2, guards: [[[0, 0], [4, 0]]] }],
            rooms: [{
                id: 'f1-kitchen', kind: 'living', polygon: [[0, 0], [6, 0], [6, 5], [0, 5]], doors: [], unit: 'apartment_1',
                style: 'b3', template: 'b3-apartment/living', role: 'bar', ceilingDrop: 0.4,
                levels: [{ polygon: [[0, 0], [2, 0], [2, 2], [0, 2]], delta: 0.45, edge: 'step', stair: { at: [2, 1], axis: 'u', width: 1 } }],
            }],
            furniture: [
                { id: 'f1-bar', kind: 'bar_counter', room: 'f1-kitchen', position: [1, 1], rotationDeg: 0, size: [3, 0.65, 1.1], elevation: 0.45, fit: 'asm-b3-bar' },
                { id: 'f1-tub', kind: 'bathtub', room: 'f1-kitchen', position: [4, 4], rotationDeg: 90, size: [1.7, 0.8, 0.6] },
                { id: 'f1-urinal', kind: 'urinal', room: 'f1-kitchen', position: [5, 1], rotationDeg: 0, size: [0.4, 0.35, 0.6], fit: 'fit-urinal' },
            ],
            lights: [],
        };
        const check = valid('floor', JSON.parse(JSON.stringify(floor)));
        expect(check.ok, check.errors).toBe(true);
        for (const broken of [
            { room: { style: 'E1' } }, { room: { style: 'e12' } }, { room: { template: 'b3-apartment' } }, { room: { role: 'Bar' } },
            { room: { ceilingDrop: 2.5 } }, { room: { levels: [{ polygon: [[0, 0], [1, 0], [1, 1]], delta: 2, edge: 'step' }] } },
            { furniture: { fit: 'module-x' } }, { furniture: { kind: 'jacuzzi' } },
        ]) {
            const copy = JSON.parse(JSON.stringify(floor));
            Object.assign(broken.room ? copy.rooms[0] : copy.furniture[0], broken.room ?? broken.furniture);
            expect(valid('floor', copy).ok, JSON.stringify(broken)).toBe(false);
        }
    });
});

describe('fixtures a new furniture kind stands for', () => {
    it('stands a person at a urinal as at a toilet and leaves a bathtub without an anchor', () => {
        const request = validateRequest(withBuilding({ type: 'residential', tier: 'high_rich' }, 'mirror-frame'));
        const plan = planBuilding(request, resolveAssignments(request), new Set([0, 1]));
        const floor = plan.floors.find(f => f.furniture.some(item => item.kind === 'toilet'))!;
        const toilet = floor.furniture.find(item => item.kind === 'toilet')!;
        toilet.kind = 'urinal';
        const shower = floor.furniture.find(item => item.kind === 'shower');
        if (shower) shower.kind = 'bathtub';
        const npc = buildNpcSupport(plan, request);
        expect(npc.anchors.some(anchor => anchor.kind === 'toilet' && anchor.furniture === toilet.id)).toBe(true);
        if (shower) expect(npc.anchors.some(anchor => anchor.furniture === shower.id)).toBe(false);
    });
});

describe('kind buildings generate and publish their kind', () => {
    const shell = async (family: string, type: BuildingType, tier: Tier): Promise<InteriorRequest> => {
        const { planAssembly } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
        const { blueprint } = planAssembly({ buildingId: `${family}-${tier}`, family, seed: 'interior-proof', lot: { width: 40, depth: 40 }, floors: 6 });
        return { seed: 'interior-proof', building: { id: `${family}-${tier}`, type, tier }, blueprint, materialTheme: 'cyberpunk' };
    };
    const valid = validator();
    for (const [kind, family, type, tier] of [
        ['A', 'mirror-frame', 'residential', 'high_rich'], ['B', 'balcony-grid', 'residential', 'rich'],
        ['C', 'mirror-frame', 'residential', 'poor'], ['R', 'mirror-frame', 'offices', 'rich'],
    ] as const) {
        it(`generates a 40x40 kind ${kind} building on ${family}`, { timeout: 300000 }, async () => {
            const result = await generate(await shell(family, type, tier));
            expect(result.building.kind).toBe(kind);
            const check = valid('building', result.building);
            expect(check.ok, check.errors).toBe(true);
            for (const layout of Object.values(result.layouts)) {
                const floor = valid('floor-placement', layout);
                expect(floor.ok, floor.errors).toBe(true);
            }
            if (kind === 'B') {
                // the derived loft pair: either a real paired storey, or two single floors with the loss recorded
                const paired = Object.values(result.layouts).some(layout => layout.floor.duplexes?.length);
                const recorded = result.building.floors.some(f => f.program?.changes.some(change => change.fitted === null && change.kind === 'living'));
                expect(paired || recorded).toBe(true);
            }
        });
    }
});
