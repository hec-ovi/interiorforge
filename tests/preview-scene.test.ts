import { expect, it, vi } from 'vitest';
import { InstancedMesh, type BufferGeometry } from 'three';
import { generate, makePlacementFixture } from '../src/index.js';
import { loadAssetCatalog } from '../src/assets/catalog.js';
import { placementScene, releaseScene } from '../src/ui/views/placement-scene.js';

it('draws unreadable props as boxes, names those it cannot draw, loads each once and frees a replaced scene', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    try {
        const catalog = new Map(loadAssetCatalog().assets.map(asset => [asset.id, asset]));
        const result = await generate(makePlacementFixture({ seed: 'preview-scene', floors: 3, width: 32, depth: 32, type: 'hotel', tier: 'poor' }),
            { models: new Set(catalog.keys()) });
        const layout = Object.values(result.layouts)[0]!, sample = layout.placements.find(p => p.prop)!;
        layout.placements.push({ ...sample, id: 'ghost', prop: 'no-such-prop' });
        const placed = [...new Set(Object.values(result.layouts).flatMap(l => l.placements.flatMap(p => p.prop ? [p.prop] : [])))].sort();

        const first = await placementScene(result);
        expect(first.undrawn).toEqual(placed.filter(id => !catalog.get(id)?.dimensionsMeters));
        expect(first.undrawn).toContain('no-such-prop');
        expect(first.boxed).toEqual(placed.filter(id => catalog.get(id)?.dimensionsMeters));
        const reads = fetch.mock.calls.length;

        const second = await placementScene(result);
        expect(second).toMatchObject({ boxed: first.boxed, undrawn: first.undrawn });
        expect(fetch.mock.calls.length, 'a prop loads once per session').toBe(reads);

        const owned = (group: typeof first.group) => {
            const geometries: BufferGeometry[] = [];
            group.traverse(node => { if (node instanceof InstancedMesh) geometries.push(node.geometry); });
            return geometries;
        };
        const freed = new Set<BufferGeometry>();
        for (const geometry of [...owned(first.group), ...owned(second.group)]) geometry.addEventListener('dispose', () => freed.add(geometry));
        releaseScene(first.group);
        expect(owned(first.group).length).toBeGreaterThan(first.boxed.length);
        expect([...freed]).toEqual(owned(first.group));
    } finally {
        vi.unstubAllGlobals();
    }
});
