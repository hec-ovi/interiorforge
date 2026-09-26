import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { generate, makePlacementFixture, presentModels } from '../src/index.js';
import type { GeneratedInterior } from '../src/index.js';
import { loadAssetCatalog } from '../src/assets/catalog.js';

const catalog = loadAssetCatalog().assets;
const local = new Set(catalog.filter(asset => asset.availability === 'local-only').map(asset => asset.id));
const everything = new Set(catalog.map(asset => asset.id));
const shipped = new Set(catalog.filter(asset => asset.availability === 'redistributable').map(asset => asset.id));
const request = () => makePlacementFixture({ seed: 'missing-models', floors: 3, width: 32, depth: 32, type: 'hotel', tier: 'poor' });

/** Catalog props by layout, then by furniture id. */
const props = (result: GeneratedInterior) => new Map(Object.values(result.layouts).map(layout =>
    [layout.id, new Map(layout.placements.flatMap(p => p.prop ? [[p.id, p.prop] as const] : []))]));
const ids = (byLayout: ReturnType<typeof props>) => [...byLayout.values()].flatMap(layout => [...layout.values()]);

it('reads the model files present in a models folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'interior-models-'));
    try {
        await copyFile(new URL('../src/assets/models/polyhaven-sofa-01.glb', import.meta.url), join(dir, 'polyhaven-sofa-01.glb'));
        expect([...await presentModels(dir)]).toEqual(['polyhaven-sofa-01']);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

it('furnishes around absent local models: another present model or no furniture, never a missing file', async () => {
    const full = await generate(request(), { models: everything });
    const wanted = props(full);
    expect(full.missingModels).toEqual([]);
    expect(ids(wanted).some(id => local.has(id)), 'the fixture places a local-only model when all are present').toBe(true);

    const bare = await generate(request(), { models: shipped });
    const placed = props(bare);
    expect(ids(placed).every(id => shipped.has(id))).toBe(true);
    for (const id of bare.missingModels) expect(shipped.has(id)).toBe(false);
    for (const id of ids(wanted)) if (local.has(id)) expect(bare.missingModels).toContain(id);
    for (const layout of Object.values(bare.layouts)) {
        const furniture = new Set(layout.floor.furniture.map(item => item.id));
        for (const [item, id] of wanted.get(layout.id)!) {
            if (!local.has(id)) continue;
            // The furniture wears a present model, or it left the layout with its anchors.
            const now = placed.get(layout.id)!.get(item);
            if (now) expect(shipped.has(now)).toBe(true);
            else expect(furniture.has(item)).toBe(false);
        }
        for (const anchor of layout.npc.anchors) if (anchor.furniture) expect(furniture.has(anchor.furniture), anchor.id).toBe(true);
    }
});

it('names only models this checkout holds by default', async () => {
    const result = await generate(request());
    const present = await presentModels();
    for (const id of ids(props(result))) {
        expect(present.has(id)).toBe(true);
        expect(existsSync(new URL(`../src/assets/${catalog.find(asset => asset.id === id)!.modelUri}`, import.meta.url))).toBe(true);
    }
    for (const id of result.missingModels) expect(present.has(id)).toBe(false);
});
