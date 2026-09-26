import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generate, makePlacementFixture } from '../src/index.js';
import type { BuildingType, InteriorRequest } from '../src/index.js';
import { resolveAssignments } from '../src/blueprint/validate.js';
import { PROGRAM } from './fixtures.js';

/** A stack of storeys carrying the given plan slugs, as a shared kit plan publishes them. */
function slugged(type: BuildingType, slugs: string[]): InteriorRequest {
    const request = makePlacementFixture({ width: 24, depth: 32, floors: slugs.length, type, tier: 'mid', seed: 3 });
    const { assignments: _, ...rest } = request;
    return { ...rest, blueprint: { ...rest.blueprint, floors: rest.blueprint.floors.map((floor, i) => ({ ...floor, kind: slugs[i]! })) } };
}

it('furnishes a shared shell for the parcel standing in it, not for the plan it was drawn as', () => {
    for (const [type, program] of Object.entries(PROGRAM) as [BuildingType, typeof PROGRAM[BuildingType]][]) {
        // A commercial plan's `commerce`, a residential plan's `entry` and `residential`, and a
        // landmark's own type repeated on every floor all name no program of their own.
        for (const slugs of [['commerce', 'commerce', 'commerce', 'commerce'], ['entry', 'residential', 'residential', 'residential'], ['lobby', type, type, type], [type, type, type, type]]) {
            const kinds = resolveAssignments(slugged(type, slugs)).map(a => a.kind);
            expect(program.ground, `${type} ${slugs.join(',')} ground`).toContain(kinds[0]);
            for (const kind of kinds.slice(1)) expect(program.upper, `${type} ${slugs.join(',')}`).toContain(kind);
            // A home building is studios or apartments throughout, so its floors share a layout.
            expect(new Set(kinds.slice(1)).size, `${type} ${slugs.join(',')}`).toBe(1);
        }
    }
    // A slug that names its own program keeps it: a hotel's restaurant floor and bar, a
    // corporate executive floor, a shop floor that is the venue its parcel names.
    expect(resolveAssignments(slugged('hotel', ['lobby', 'restaurant', 'bar', 'hotel'])).map(a => a.kind))
        .toEqual(['lobby', 'restaurant', 'restaurant', 'hotel_rooms']);
    expect(resolveAssignments(slugged('corpo', ['lobby', 'corpo', 'executive'])).map(a => a.kind)).toEqual(['lobby', 'corpo_office', 'corpo_office']);
    expect(resolveAssignments(slugged('coffee_shop', ['shop', 'offices', 'commerce'])).map(a => a.kind)).toEqual(['coffee_shop', 'office', 'office']);
    // Explicit assignments always win.
    const explicit = { ...slugged('hotel', ['commerce', 'commerce', 'commerce']), assignments: [{ floor: 0, kind: 'gym' as const }, { floor: 1, kind: 'terrace' as const }, { floor: 2, kind: 'gym' as const }] };
    expect(resolveAssignments(explicit).map(a => a.kind)).toEqual(['gym', 'terrace', 'gym']);
});

it('opens a hotel, a factory and a coffee roastery on shared commercial plans as what they are', { timeout: 120000 }, async () => {
    const plan = JSON.parse(readFileSync(new URL('./kit-plans/plain-residential-poor-3x4x4f.blueprint.json', import.meta.url), 'utf8'));
    for (const type of ['hotel', 'factory', 'coffee_shop', 'clinic'] as const) {
        const blueprint = { ...plan, floors: plan.floors.map((floor: { kind: string }) => ({ ...floor, kind: 'commerce' })) };
        const built = await generate({ seed: `programs:${type}`, building: { id: type, type, tier: 'mid' }, blueprint, materialTheme: 'cyberpunk' });
        const kinds = built.building.floors.map(ref => built.layouts[ref.layout]!.floor.kind);
        expect(PROGRAM[type].ground, type).toContain(kinds[0]);
        for (const kind of kinds.slice(1)) expect(PROGRAM[type].upper, type).toContain(kind);
    }
});
