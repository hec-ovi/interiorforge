import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { Logger } from '@gltf-transform/core';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { createDocument } from '../src/glb/io.js';
import { moduleRecipes } from '../src/modules/recipes.js';
import { slotAlignment, tileScale } from '../src/modules/index.js';
import { loadTheme } from '../src/materials/load.js';
import { generate } from '../src/index.js';
import type { BuildingType, InteriorRequest, ReferenceKind, Tier } from '../src/index.js';
import type { GeneratedInterior } from '../src/placements/types.js';
import { KINDS } from '../src/styles/reference/registry.js';
import { portalRecipes } from '../src/styles/systems/portal.js';
import { stairWallSkinId } from '../src/modules/recipes/stair-wall-skins.js';

/** The reference layer's hard budgets: what each kind adds to the shared kit, and what a
 *  furnished kind building publishes. Anything repeating under 0.5 m is baked into bay
 *  modules, so these hold however long the walls run. */
const KIT_GROWTH_BYTES = 400_000;
const MODULE_TRIANGLES = 10_000;
const FLOOR_TRIANGLES = 400_000;
const LAYOUT_PLACEMENTS = 3_000;
const BUILDING_BYTES = 2_500_000;
const GENERATION_SECONDS = 30;
/** What the generic family content already spends on these lots before any reference
 *  style lands (measured on the landing tree with the space templates fitted, 40x40, six
 *  floors, one generation in the container), plus about 5 %: a ratchet the kind packages
 *  must only lower, until every kind is inside the gates above and its entry here is
 *  deleted. Kind B's two-storey loft still wears the Apartment 1702 finish, whose fluted
 *  bays and boards put some 6 k placements on each of its floors. Kind C's damaged planner
 *  and kind A's luxury planner are slow today; their time allowances are that cost under load. */
const PRE_REFERENCE: Partial<Record<ReferenceKind, { placements?: number; triangles?: number; seconds?: number; bytes?: number }>> = {
    A: { placements: 3400, triangles: 1_250_000, seconds: 45 },
    B: { placements: 7000, triangles: 1_557_000, seconds: 45, bytes: 3_700_000 },
    C: { triangles: 600_000, seconds: 200 },
};

describe('kit growth per reference kind', () => {
    const theme = loadTheme('cyberpunk')?.library.themeIndex ?? null;
    const catalog = new Map(moduleRecipes(tileScale(theme), slotAlignment(theme)).map(recipe => [recipe.id, recipe]));
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    for (const kind of KINDS) {
        it(`keeps kind ${kind.kind} under ${KIT_GROWTH_BYTES / 1000} KB of new modules, none over ${MODULE_TRIANGLES / 1000} k triangles`, async () => {
            await MeshoptEncoder.ready;
            const ids = new Set<string>();
            const collect = (id: string) => { ids.add(id); if (catalog.has(stairWallSkinId(id))) ids.add(stairWallSkinId(id)); };
            for (const set of kind.recipes) set(id => collect(id));
            for (const portal of kind.portals) portalRecipes(portal)(id => collect(id));
            let bytes = 0;
            for (const id of ids) {
                const recipe = catalog.get(id);
                expect(recipe, id).toBeDefined();
                const triangles = recipe!.mesh.materials().reduce((sum, slot) => sum + recipe!.mesh.getGroup(slot)!.indices.length / 3, 0);
                expect(triangles, `${id} triangles`).toBeLessThanOrEqual(MODULE_TRIANGLES);
                const doc = createDocument(recipe!.mesh).setLogger(new Logger(Logger.Verbosity.SILENT));
                await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16 }));
                bytes += (await io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder }).writeBinary(doc)).byteLength;
            }
            expect(bytes, `kind ${kind.kind} modules ${[...ids].length}`).toBeLessThanOrEqual(KIT_GROWTH_BYTES);
        }, 120000);
    }
});

describe('a furnished kind building on a 40x40 lot', () => {
    const shells: Record<ReferenceKind, [string, BuildingType, Tier]> = {
        A: ['mirror-frame', 'residential', 'high_rich'], B: ['balcony-grid', 'residential', 'rich'],
        C: ['mirror-frame', 'residential', 'poor'], R: ['mirror-frame', 'offices', 'rich'],
    };
    const triangles = new Map(moduleRecipes().map(recipe => [recipe.id,
        recipe.mesh.materials().reduce((sum, slot) => sum + recipe.mesh.getGroup(slot)!.indices.length / 3, 0)]));
    const requests = new Map<ReferenceKind, InteriorRequest>();
    const proof: Record<string, unknown>[] = [];
    beforeAll(async () => {
        const { planAssembly } = await import(new URL('../../exterior/src/index.ts', import.meta.url).href);
        for (const [kind, [family, type, tier]] of Object.entries(shells) as [ReferenceKind, [string, BuildingType, Tier]][]) {
            const { blueprint } = planAssembly({ buildingId: `budget-${kind}`, family, seed: 'interior-proof', lot: { width: 40, depth: 40 }, floors: 6 });
            requests.set(kind, { seed: 'interior-proof', building: { id: `budget-${kind}`, type, tier }, blueprint, materialTheme: 'cyberpunk' });
        }
    }, 60000);

    const measure = (kind: ReferenceKind, result: GeneratedInterior, seconds: number) => {
        const layouts = Object.values(result.layouts);
        const bytes = Buffer.byteLength(JSON.stringify(result.building)) + layouts.reduce((sum, layout) => sum + Buffer.byteLength(JSON.stringify(layout)), 0);
        const floors = layouts.map(layout => ({
            layout: layout.id, kind: layout.floor.kind, placements: layout.placements.length,
            triangles: layout.placements.reduce((sum, p) => sum + (p.module ? triangles.get(p.module) ?? 0 : 0), 0),
        }));
        proof.push({ kind, seconds: Number(seconds.toFixed(2)), bytes, floors });
        return { bytes, floors };
    };

    for (const kind of ['R', 'A', 'B', 'C'] as const) {
        it(`keeps kind ${kind} within its placement, triangle, JSON and time budgets`, { timeout: 400000 }, async () => {
            const start = performance.now();
            const result = await generate(requests.get(kind)!);
            const seconds = (performance.now() - start) / 1000;
            const { bytes, floors } = measure(kind, result, seconds);
            await mkdir('out/proof', { recursive: true });
            await writeFile('out/proof/reference-budget.json', JSON.stringify(proof, null, 2) + '\n');
            const allowance = PRE_REFERENCE[kind] ?? {};
            expect(result.building.kind).toBe(kind);
            expect(bytes).toBeLessThanOrEqual(Math.max(BUILDING_BYTES, allowance.bytes ?? 0));
            for (const floor of floors) {
                expect(floor.placements, `${floor.layout} placements`).toBeLessThanOrEqual(Math.max(LAYOUT_PLACEMENTS, allowance.placements ?? 0));
                if (floor.layout === 'middle' && kind !== 'R')
                    expect(floor.triangles, `${floor.layout} triangles`).toBeLessThanOrEqual(Math.max(FLOOR_TRIANGLES, allowance.triangles ?? 0));
            }
            expect(seconds).toBeLessThanOrEqual(Math.max(GENERATION_SECONDS, allowance.seconds ?? 0));
        });
    }
});
