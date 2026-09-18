import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { createDocument } from '../glb/io.js';
import { moduleRecipes } from './recipes.js';
import type { ModuleCatalog } from './types.js';
export type * from './types.js';
/** Publishes geometry once. Building generation does not serialize or load it. */
export async function buildModules(): Promise<{
    catalog: ModuleCatalog;
    files: Map<string, Uint8Array>;
}> {
    await MeshoptEncoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
    const catalog: ModuleCatalog = { version: 1, grid: .5, modules: [] }, files = new Map<string, Uint8Array>();
    for (const recipe of moduleRecipes()) {
        const doc = createDocument(recipe.mesh).setLogger(new Logger(Logger.Verbosity.SILENT));
        const triangles = recipe.mesh.materials().reduce((sum, slot) => sum + recipe.mesh.getGroup(slot)!.indices.length / 3, 0);
        await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: 16 }));
        const bytes = await io.writeBinary(doc), file = `${recipe.id}.glb`;
        files.set(file, bytes);
        catalog.modules.push({
            id: recipe.id, file, size: recipe.size, origin: recipe.origin,
            materialSlots: recipe.mesh.materials(), triangles, bytes: bytes.byteLength
        });
    }
    return { catalog, files };
}
